require("dotenv").config();

const path = require("node:path");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");

const app = express();
const port = Number(process.env.PORT) || 5000;
const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const pool = databaseUrl
  ? mysql.createPool({
      host: databaseUrl.hostname,
      port: Number(databaseUrl.port) || 3306,
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
      database: decodeURIComponent(databaseUrl.pathname.slice(1)),
      ssl: process.env.MYSQL_SSL === "true" ? {} : undefined,
      waitForConnections: true,
      connectionLimit: 10
    })
  : null;

async function query(sql, values = []) {
  const [rows] = await pool.execute(sql, values);
  return rows;
}

app.use(express.json({ limit: "30kb" }));
app.use(express.static(path.join(__dirname, "client")));

function requireDatabase(req, res, next) {
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "The store database is not configured yet." });
  next();
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: "Sign in to continue." });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

function createToken(user) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    const error = new Error("JWT_SECRET must be set to a random string of at least 32 characters.");
    error.status = 503;
    throw error;
  }
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

app.get("/api/health", async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json({ status: "ok", database: "not_configured" });
  try {
    await query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});

app.post("/api/auth/register", requireDatabase, async (req, res, next) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: "Enter a name between 2 and 100 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: "Your password must be at least 8 characters." });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name, email, passwordHash]
    );
    const user = { id: result.insertId, name, email };
    res.status(201).json({ user, token: createToken(user) });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "An account with that email already exists." });
    next(error);
  }
});

app.post("/api/auth/login", requireDatabase, async (req, res, next) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!email || !password) return res.status(400).json({ error: "Enter your email and password." });
  try {
    const rows = await query("SELECT id, name, email, password_hash FROM users WHERE email = ?", [email]);
    const record = rows[0];
    if (!record || !(await bcrypt.compare(password, record.password_hash))) {
      return res.status(401).json({ error: "That email and password do not match." });
    }
    const user = { id: record.id, name: record.name, email: record.email };
    res.json({ user, token: createToken(user) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/products", requireDatabase, async (req, res, next) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim().slice(0, 60) : "";
  try {
    const rows = await query(
      `SELECT id, name, description, price, image_url, category, stock
       FROM products
       WHERE (? = '' OR name LIKE CONCAT('%', ?, '%') OR description LIKE CONCAT('%', ?, '%') OR category LIKE CONCAT('%', ?, '%'))
         AND (? = '' OR category = ?)
       ORDER BY id`,
      [search, search, search, search, category, category]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/products/:id", requireDatabase, async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: "That piece could not be found." });
  try {
    const rows = await query(
      "SELECT id, name, description, price, image_url, category, stock FROM products WHERE id = ?",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "That piece could not be found." });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders", requireDatabase, requireAuth, async (req, res, next) => {
  const items = req.body.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    return res.status(400).json({ error: "Your bag must contain between 1 and 50 items." });
  }
  const quantities = new Map();
  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ error: "One of the items in your bag is invalid." });
    }
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }

  const client = await pool.getConnection().catch(next);
  if (!client) return;
  try {
    await client.beginTransaction();
    const ids = [...quantities.keys()];
    const placeholders = ids.map(() => "?").join(", ");
    const [products] = await client.execute(
      `SELECT id, name, price, stock FROM products WHERE id IN (${placeholders}) ORDER BY id FOR UPDATE`,
      ids
    );
    if (products.length !== ids.length) throw Object.assign(new Error("One of those pieces is no longer available."), { status: 409 });
    for (const product of products) {
      if (Number(product.stock) < quantities.get(product.id)) {
        throw Object.assign(new Error(`${product.name} does not have enough stock for that quantity.`), { status: 409 });
      }
    }
    const total = products.reduce((sum, product) => sum + Number(product.price) * quantities.get(product.id), 0);
    const [orderResult] = await client.execute(
      "INSERT INTO orders (user_id, total, status) VALUES (?, ?, 'placed')",
      [req.user.id, total.toFixed(2)]
    );
    const [orderRows] = await client.execute(
      "SELECT id, user_id, total, status, created_at FROM orders WHERE id = ?",
      [orderResult.insertId]
    );
    const order = orderRows[0];
    for (const product of products) {
      const quantity = quantities.get(product.id);
      await client.execute(
        "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
        [order.id, product.id, quantity, product.price]
      );
      await client.execute("UPDATE products SET stock = stock - ? WHERE id = ?", [quantity, product.id]);
    }
    await client.commit();
    res.status(201).json(order);
  } catch (error) {
    await client.rollback().catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/orders", requireDatabase, requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT o.id, o.total, o.status, o.created_at, COALESCE(SUM(oi.quantity), 0) AS item_count
       FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = ? GROUP BY o.id ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/orders/:id", requireDatabase, requireAuth, async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: "That order could not be found." });
  try {
    const rows = await query(
      `SELECT o.id, o.total, o.status, o.created_at
       FROM orders o
       WHERE o.id = ? AND o.user_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "That order could not be found." });
    const items = await query(
      `SELECT oi.product_id, p.name, oi.quantity, oi.unit_price
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ? ORDER BY oi.id`,
      [rows[0].id]
    );
    res.json({ ...rows[0], items });
  } catch (error) {
    next(error);
  }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "client", "index.html")));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error.status) || 500;
  if (status >= 500) console.error(error.message);
  res.status(status).json({ error: status >= 500 ? "The store is having a moment. Please try again shortly." : error.message });
});

const server = app.listen(port, () => console.log(`Morrow Supply is ready at http://localhost:${port}`));

async function shutdown() {
  server.close();
  if (pool) await pool.end();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);