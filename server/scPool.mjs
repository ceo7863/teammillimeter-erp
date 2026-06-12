import { config } from "./config.mjs";

export async function withScPool(callback) {
  const url = String(config.sc.databaseUrl || "").trim();
  if (!url) {
    throw new Error("SC_DATABASE_URL is not configured");
  }
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes("sslmode=require") || url.includes("ssl=true") ? { rejectUnauthorized: false } : undefined,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
  try {
    return await callback(pool);
  } finally {
    await pool.end().catch(() => {});
  }
}
