const express = require("express");
const requireDatabase = require("../middleware/require-database");
const requireAuth = require("../middleware/require-auth");
const { query } = require("../db/connection");

const router = express.Router();

router.get("/", requireDatabase, async (req, res, next) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim().slice(0, 60) : "";
  try {
    const rows = await query(
      `SELECT p.id, p.name, p.description, p.price, p.image_url, p.category, p.stock,
              COALESCE(ROUND(AVG(r.rating), 1), 0) AS rating,
              COUNT(r.id) AS review_count
       FROM products p
       LEFT JOIN product_reviews r ON r.product_id = p.id
       WHERE (? = '' OR p.name LIKE CONCAT('%', ?, '%') OR p.description LIKE CONCAT('%', ?, '%') OR p.category LIKE CONCAT('%', ?, '%'))
         AND (? = '' OR p.category = ?)
       GROUP BY p.id, p.name, p.description, p.price, p.image_url, p.category, p.stock
       ORDER BY p.id`,
      [search, search, search, search, category, category]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireDatabase, async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: "That piece could not be found." });
  try {
    const rows = await query(
      `SELECT p.id, p.name, p.description, p.price, p.image_url, p.category, p.stock,
              COALESCE(ROUND(AVG(r.rating), 1), 0) AS rating,
              COUNT(r.id) AS review_count
       FROM products p
       LEFT JOIN product_reviews r ON r.product_id = p.id
       WHERE p.id = ?
       GROUP BY p.id, p.name, p.description, p.price, p.image_url, p.category, p.stock`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "That piece could not be found." });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/reviews", requireDatabase, requireAuth, async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: "That piece could not be found." });

  const rating = Number(req.body?.rating);
  const comment = typeof req.body?.comment === "string" ? req.body.comment.trim().slice(0, 500) : "";

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Please rate the product from 1 to 5 stars." });
  }

  try {
    const productRows = await query("SELECT id FROM products WHERE id = ?", [req.params.id]);
    if (!productRows[0]) return res.status(404).json({ error: "That piece could not be found." });

    await query(
      "INSERT INTO product_reviews (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?)",
      [req.params.id, req.user.id, rating, comment || null]
    );

    const [summary] = await query(
      "SELECT ROUND(AVG(rating), 1) AS rating, COUNT(*) AS review_count FROM product_reviews WHERE product_id = ?",
      [req.params.id]
    );

    res.status(201).json({
      rating: Number(summary.rating || 0),
      review_count: Number(summary.review_count || 0),
      message: "Thanks for leaving a review."
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;