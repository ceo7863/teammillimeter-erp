#!/usr/bin/env node
import pg from "pg";
import { config } from "../server/config.mjs";

const targetIds = [300002, 300006, 300027];
const targetNames = ["박정우", "김명진", "김준영"];

const pool = new pg.Pool({ connectionString: config.sc.databaseUrl });
try {
  const users = await pool.query(
    `SELECT id, name, phone, "loginId", "isActive"
     FROM users
     WHERE id = ANY($1::int[])
        OR name ILIKE ANY($2::text[])
     ORDER BY id`,
    [targetIds, targetNames.map((n) => `%${n}%`)],
  );
  console.log("users:", JSON.stringify(users.rows, null, 2));

  const userIds = users.rows.map((row) => Number(row.id));
  if (!userIds.length) {
    console.log("No matching SC users found");
    process.exit(0);
  }

  const parts = await pool.query(
    `SELECT sp."scheduleId", sp."userId", u.name, s."workDate"
     FROM schedule_participants sp
     JOIN users u ON u.id = sp."userId"
     JOIN schedules s ON s.id = sp."scheduleId"
     WHERE sp."userId" = ANY($1::int[])
     ORDER BY s."workDate" DESC`,
    [userIds],
  );
  console.log("participantRows:", parts.rowCount);
  console.log(JSON.stringify(parts.rows.slice(0, 15), null, 2));
} finally {
  await pool.end();
}
