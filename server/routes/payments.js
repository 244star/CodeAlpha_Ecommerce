const express = require("express");
const Stripe = require("stripe");
const requireDatabase = require("../middleware/require-database");
const requireAuth = require("../middleware/require-auth");
const { pool, query } = require("../db/connection");
const { sendOrderConfirmationEmail } = require("../config/email");

const router = express.Router();

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

async function releasePendingOrder(orderId, status) {
  if (!Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1) return false;
  const client = await pool.getConnection();
  try {
    await client.beginTransaction();
    const [orders] = await client.execute("SELECT id, status FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    if (!orders[0] || orders[0].status !== "pending_payment") {
      await client.commit();
      return false;
    }

    const [items] = await client.execute("SELECT product_id, quantity FROM order_items WHERE order_id = ?", [orderId]);
    for (const item of items) {
      await client.execute("UPDATE products SET stock = stock + ? WHERE id = ?", [item.quantity, item.product_id]);
    }
    await client.execute("UPDATE orders SET status = ? WHERE id = ?", [status, orderId]);
    await client.commit();
    return true;
  } catch (error) {
    await client.rollback().catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function fulfillPaidOrder(session) {
  const orderId = Number(session.metadata?.orderId || session.client_reference_id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) return;

  const client = await pool.getConnection();
  let confirmation;
  try {
    await client.beginTransaction();
    const [orders] = await client.execute("SELECT id, user_id, total, status FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    const order = orders[0];
    if (!order || order.status !== "pending_payment") {
      await client.commit();
      return;
    }

    await client.execute(
      "UPDATE orders SET status = 'placed', stripe_session_id = COALESCE(stripe_session_id, ?) WHERE id = ?",
      [session.id, orderId]
    );
    const [[user]] = await client.execute("SELECT id, name, email FROM users WHERE id = ?", [order.user_id]);
    const [items] = await client.execute(
      `SELECT p.name, oi.quantity, oi.unit_price
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ? ORDER BY oi.id`,
      [orderId]
    );
    await client.commit();
    confirmation = { user, order: { ...order, status: "placed" }, items };
  } catch (error) {
    await client.rollback().catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  if (confirmation?.user) {
    await sendOrderConfirmationEmail(confirmation.user, confirmation.order, confirmation.items).catch((emailError) => {
      console.error("Order confirmation email failed:", emailError.message);
    });
  }
}

router.post("/create-session", requireDatabase, requireAuth, async (req, res, next) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length || items.length > 50) {
    return res.status(400).json({ error: "Your bag must contain between 1 and 50 items." });
  }

  const quantities = new Map();
  for (const item of items) {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ error: "One of the items in your bag is invalid." });
    }
    const totalQuantity = (quantities.get(productId) || 0) + quantity;
    if (totalQuantity > 99) return res.status(400).json({ error: "A product quantity cannot exceed 99." });
    quantities.set(productId, totalQuantity);
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return res.status(503).json({ error: "Online checkout is not configured. No order has been placed." });
  }

  let orderId;
  let products;
  let session;
  try {
    const client = await pool.getConnection();
    try {
      await client.beginTransaction();
      const productIds = [...quantities.keys()];
      const placeholders = productIds.map(() => "?").join(", ");
      [products] = await client.execute(
        `SELECT id, name, price, image_url, stock FROM products WHERE id IN (${placeholders}) ORDER BY id FOR UPDATE`,
        productIds
      );
      if (products.length !== productIds.length) {
        throw Object.assign(new Error("One of those pieces is no longer available."), { status: 409 });
      }
      for (const product of products) {
        if (Number(product.stock) < quantities.get(product.id)) {
          throw Object.assign(new Error(`${product.name} does not have enough stock for that quantity.`), { status: 409 });
        }
      }

      const total = products.reduce((sum, product) => sum + Number(product.price) * quantities.get(product.id), 0);
      const [orderResult] = await client.execute(
        "INSERT INTO orders (user_id, total, status) VALUES (?, ?, 'pending_payment')",
        [req.user.id, total.toFixed(2)]
      );
      orderId = orderResult.insertId;
      for (const product of products) {
        const quantity = quantities.get(product.id);
        await client.execute(
          "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
          [orderId, product.id, quantity, product.price]
        );
        await client.execute("UPDATE products SET stock = stock - ? WHERE id = ?", [quantity, product.id]);
      }
      await client.commit();
    } catch (error) {
      await client.rollback().catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    const line_items = products.map((product) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: product.name,
          images: product.image_url ? [product.image_url] : undefined
        },
        unit_amount: Math.round(Number(product.price) * 100)
      },
      quantity: quantities.get(product.id)
    }));
    const appUrl = (process.env.APP_URL || "http://localhost:5000").replace(/\/$/, "");
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${appUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?payment=cancelled&order_id=${orderId}`,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      line_items,
      customer_email: req.user.email,
      client_reference_id: String(orderId),
      metadata: { orderId: String(orderId), userId: String(req.user.id) },
      payment_intent_data: { metadata: { orderId: String(orderId), userId: String(req.user.id) } }
    }, { idempotencyKey: `morrow-order-${orderId}` });

    await query("UPDATE orders SET stripe_session_id = ? WHERE id = ? AND status = 'pending_payment'", [session.id, orderId]);
    return res.json({ status: "pending_payment", checkoutUrl: session.url, sessionId: session.id });
  } catch (error) {
    if (orderId) {
      if (session?.id) {
        try {
          await stripe.checkout.sessions.expire(session.id);
          await releasePendingOrder(orderId, "payment_failed");
        } catch (releaseError) {
          console.error("Could not expire checkout session after checkout failure:", releaseError.message);
        }
      } else {
        await releasePendingOrder(orderId, "payment_failed").catch((releaseError) => {
          console.error("Could not release inventory after checkout failure:", releaseError.message);
        });
      }
    }
    next(error);
  }
});

router.get("/session-status", requireDatabase, requireAuth, async (req, res, next) => {
  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : "";
  if (!sessionId.startsWith("cs_")) return res.status(400).json({ error: "A valid checkout session is required." });

  const stripe = getStripeClient();
  if (!stripe) return res.status(503).json({ error: "Online checkout is not configured." });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const orderId = Number(session.metadata?.orderId || session.client_reference_id);
    const orders = await query(
      "SELECT id, status FROM orders WHERE id = ? AND user_id = ? AND stripe_session_id = ?",
      [orderId, req.user.id, sessionId]
    );
    if (!orders[0]) return res.status(404).json({ error: "That checkout session was not found." });

    res.json({
      orderId: orders[0].id,
      orderStatus: orders[0].status,
      checkoutStatus: session.status,
      paymentStatus: session.payment_status
    });
  } catch (error) {
    next(error);
  }
});

router.post("/cancel-session", requireDatabase, requireAuth, async (req, res, next) => {
  const orderId = Number(req.body?.orderId);
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: "A valid pending order is required." });
  }

  try {
    const orders = await query(
      "SELECT id, status, stripe_session_id FROM orders WHERE id = ? AND user_id = ?",
      [orderId, req.user.id]
    );
    const order = orders[0];
    if (!order) return res.status(404).json({ error: "That checkout was not found." });
    if (order.status !== "pending_payment") return res.json({ status: order.status });

    const stripe = getStripeClient();
    if (!stripe || !order.stripe_session_id) {
      return res.status(503).json({ error: "This checkout cannot be cancelled right now." });
    }

    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
    if (session.status === "complete") return res.json({ status: "pending_payment" });

    await releasePendingOrder(order.id, "payment_cancelled");
    res.json({ status: "payment_cancelled" });
  } catch (error) {
    next(error);
  }
});

router.post("/webhook", async (req, res) => {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.get("stripe-signature");
  if (!stripe || !webhookSecret) {
    return res.status(503).json({ error: "Stripe webhook verification is not configured." });
  }
  if (!Buffer.isBuffer(req.body) || !signature) {
    return res.status(400).json({ error: "A signed Stripe webhook payload is required." });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    return res.status(400).json({ error: `Invalid Stripe signature: ${error.message}` });
  }

  try {
    const session = event.data.object;
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      if (session.payment_status === "paid") await fulfillPaidOrder(session);
    } else if (event.type === "checkout.session.expired") {
      await releasePendingOrder(Number(session.metadata?.orderId || session.client_reference_id), "payment_expired");
    } else if (event.type === "checkout.session.async_payment_failed") {
      await releasePendingOrder(Number(session.metadata?.orderId || session.client_reference_id), "payment_failed");
    }
    res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error.message);
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

module.exports = router;
