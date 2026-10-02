const express = require("express");
const requireAuth = require("../middleware/require-auth");
const { query } = require("../db/connection");

const router = express.Router();

function isAdminUser(req) {
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const userEmail = String(req.user?.email || "").trim().toLowerCase();
  return Boolean(adminEmail) && userEmail === adminEmail;
}

router.use(requireAuth);

router.get("/overview", async (req, res, next) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ error: "Admin access is required." });
  }

  try {
    const [summary] = await query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM orders WHERE status = 'placed') AS total_orders,
        (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status = 'placed') AS total_revenue,
        (SELECT COUNT(*) FROM products WHERE stock < 10) AS low_stock_count
    `);

    const recentOrders = await query(`
      SELECT o.id, o.total, o.status, o.created_at, u.name, u.email
      FROM orders o
      JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    const lowStockProducts = await query(`
      SELECT id, name, stock, price
      FROM products
      WHERE stock < 10
      ORDER BY stock ASC, id ASC
      LIMIT 5
    `);

    res.json({
      summary,
      recentOrders,
      lowStockProducts
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
