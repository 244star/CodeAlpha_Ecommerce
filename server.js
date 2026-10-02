require("dotenv").config();

const path = require("node:path");
const express = require("express");
const { pool } = require("./server/db/connection");
const { ensureDatabaseSchema } = require("./server/db/migrate");
const healthRoutes = require("./server/routes/health");
const authRoutes = require("./server/routes/auth");
const productRoutes = require("./server/routes/products");
const orderRoutes = require("./server/routes/orders");
const paymentRoutes = require("./server/routes/payments");
const adminRoutes = require("./server/routes/admin");

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "30kb" }));
app.use(express.static(path.join(__dirname, "client")));

app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "client", "index.html")));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error.status) || 500;
  if (status >= 500) console.error(error.message);
  res.status(status).json({ error: status >= 500 ? "The store is having a moment. Please try again shortly." : error.message });
});

let server;

async function start() {
  try {
    await ensureDatabaseSchema();
    server = app.listen(port, () => console.log(`Morrow Supply is ready at http://localhost:${port}`));
  } catch (error) {
    console.error("Schema bootstrap failed:", error.message);
    process.exitCode = 1;
    if (pool) await pool.end();
  }
}

start();

async function shutdown() {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);