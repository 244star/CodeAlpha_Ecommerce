const express = require("express");
const requireDatabase = require("../middleware/require-database");
const requireAuth = require("../middleware/require-auth");
const { query } = require("../db/connection");

const router = express.Router();

router.post("/", requireDatabase, requireAuth, (req, res) => {
  res.status(405).json({ error: "Orders are created only after payment is confirmed." });
});

router.get("/", requireDatabase, requireAuth, async (req, res, next) => {
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

router.get("/:id", requireDatabase, requireAuth, async (req, res, next) => {
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

module.exports = router;