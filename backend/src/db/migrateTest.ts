import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const testUrl = process.env.TEST_DATABASE_URL;
const realUrl = process.env.DATABASE_URL;

if (!testUrl) {
  throw new Error("TEST_DATABASE_URL is not set in backend/.env");
}
if (testUrl === realUrl) {
  throw new Error("TEST_DATABASE_URL must NOT equal DATABASE_URL. Refusing to continue.");
}

const client = postgres(testUrl, { ssl: "require", max: 1 });
try {
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  console.log("Test database migrated.");
} finally {
  await client.end();
}