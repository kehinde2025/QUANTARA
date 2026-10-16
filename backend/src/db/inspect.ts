import { sql } from "./client.js";

try {
  const tables = await sql`
    select tablename, rowsecurity
    from pg_tables
    where schemaname = 'public'
    order by tablename`;
  console.log("Tables in public schema:");
  console.table(tables);

  const cols = await sql`
    select table_name, count(*)::int as columns
    from information_schema.columns
    where table_schema = 'public'
    group by table_name
    order by table_name`;
  console.log("Column counts:");
  console.table(cols);

  try {
    const [row] = await sql`select count(*)::int as applied from drizzle.__drizzle_migrations`;
    console.log("Migrations recorded:", row);
  } catch {
    console.log("Migration journal table not found.");
  }
} catch (err) {
  console.error("Inspect failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}