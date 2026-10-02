const mysql = require("mysql2/promise");

const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const databaseConfig = databaseUrl
  ? {
      host: databaseUrl.hostname,
      port: Number(databaseUrl.port) || 3306,
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
      database: decodeURIComponent(databaseUrl.pathname.slice(1))
    }
  : process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME
    ? {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      }
    : null;

const pool = databaseConfig
  ? mysql.createPool({
      ...databaseConfig,
      ssl: process.env.MYSQL_SSL === "true" ? {} : undefined,
      waitForConnections: true,
      connectionLimit: 10
    })
  : null;

async function query(sql, values = []) {
  const [rows] = await pool.execute(sql, values);
  return rows;
}

module.exports = { pool, query };