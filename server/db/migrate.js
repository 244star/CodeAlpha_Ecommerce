const { pool } = require("./connection");

async function ensureDatabaseSchema() {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  const [userColumns] = await pool.query("SHOW COLUMNS FROM users LIKE 'is_admin'");
  if (!userColumns.length) {
    await pool.query("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE");
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      description TEXT NOT NULL,
      price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
      image_url TEXT NOT NULL,
      category VARCHAR(60) NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_reviews (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      product_id INT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      rating TINYINT UNSIGNED NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX product_reviews_product_idx (product_id),
      INDEX product_reviews_user_idx (user_id),
      CONSTRAINT product_reviews_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      CONSTRAINT product_reviews_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
      status VARCHAR(30) NOT NULL DEFAULT 'placed',
      stripe_session_id VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX orders_user_created_idx (user_id, created_at DESC),
      UNIQUE KEY orders_stripe_session_id_uq (stripe_session_id),
      CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  const [orderColumns] = await pool.query("SHOW COLUMNS FROM orders LIKE 'stripe_session_id'");
  if (!orderColumns.length) {
    await pool.query("ALTER TABLE orders ADD COLUMN stripe_session_id VARCHAR(255) NULL");
  }
  const [orderIndexes] = await pool.query("SHOW INDEX FROM orders WHERE Key_name = 'orders_stripe_session_id_uq'");
  if (!orderIndexes.length) {
    await pool.query("ALTER TABLE orders ADD UNIQUE KEY orders_stripe_session_id_uq (stripe_session_id)");
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_id INT UNSIGNED NOT NULL,
      product_id INT UNSIGNED NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
      INDEX order_items_order_idx (order_id),
      CONSTRAINT order_items_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT order_items_product_fk FOREIGN KEY (product_id) REFERENCES products(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  await pool.query(`
    INSERT IGNORE INTO products (name, description, price, image_url, category, stock)
    VALUES
      ('Sunday ceramic cup', 'A hand-finished stoneware cup with a gentle curve, a comfortable weight, and just enough room for the first coffee of the day.', 28.00, 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=85', 'Home', 18),
      ('Daily carry tote', 'An easy, sturdy carryall in heavyweight cotton canvas. Room for the market, the library, or whatever the day brings.', 42.00, 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85', 'Everyday', 14),
      ('Sunday stem vase', 'A softly sculptural ceramic vase that makes a single stem feel like a considered arrangement.', 36.00, 'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=900&q=85', 'Home', 9),
      ('The daily notebook', 'A cloth-bound notebook with 160 uncoated pages for lists, loose thoughts, and plans worth keeping.', 18.00, 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=900&q=85', 'Desk', 32),
      ('Everyday serving bowl', 'A generously sized, wheel-thrown stoneware bowl for shared meals and the very good peaches on the counter.', 48.00, 'https://images.unsplash.com/photo-1603199506016-b9a594b593c0?auto=format&fit=crop&w=900&q=85', 'Home', 7),
      ('Still water bottle', 'A double-wall stainless bottle that keeps drinks cool and slips into a tote without a second thought.', 32.00, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85', 'Everyday', 22),
      ('Catchall, in oak', 'A small solid-oak tray for the things that deserve a place: keys, rings, and the day''s loose ends.', 34.00, 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=900&q=85', 'Desk', 11),
      ('Late afternoon candle', 'A clean-burning soy candle with notes of cedar, fig, and open windows. Poured by hand in a reusable glass vessel.', 26.00, 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=900&q=85', 'Home', 16)
  `);
}

module.exports = { ensureDatabaseSchema };
