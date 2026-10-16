import { sql } from "./client.js";

try {
  const [row] = await sql`select now() as server_time, current_database() as db`;
  console.log("Database reachable:", row);
} catch (err) {
  console.error("Database connection failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}