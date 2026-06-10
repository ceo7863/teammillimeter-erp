import fs from "fs";
import pg from "pg";

const envText = fs.readFileSync(process.argv[2] || ".env", "utf8");
const dbUrl = envText.match(/^SC_DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "") || "";
if (!dbUrl) {
  console.error("SC_DATABASE_URL missing");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl });
try {
  const tables = await pool.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('schedules', 'schedule_participants', 'projects', 'users')
    ORDER BY table_name, ordinal_position
  `);
  console.log("columns", JSON.stringify(tables.rows, null, 2));

  const mealCols = await pool.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (column_name ILIKE '%meal%' OR column_name ILIKE '%expense%' OR column_name ILIKE '%food%' OR column_name ILIKE '%cost%')
    ORDER BY table_name, column_name
  `);
  console.log("meal/expense columns", JSON.stringify(mealCols.rows, null, 2));

  if (mealCols.rows.length) {
    const sample = await pool.query(`
      SELECT *
      FROM ${mealCols.rows[0].table_name}
      WHERE ${mealCols.rows[0].column_name} IS NOT NULL AND ${mealCols.rows[0].column_name}::text <> '0'
      LIMIT 3
    `);
    console.log("sample rows", JSON.stringify(sample.rows, null, 2));
  }
} finally {
  await pool.end();
}
