import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Vitest sets NODE_ENV to "test". In that mode we use ONLY the test database,
// and we refuse to start if it is missing or equals the real one.
const isTest = process.env.NODE_ENV === "test";
const url = isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    isTest
      ? "TEST_DATABASE_URL is not set. Add it to backend/.env"
      : "DATABASE_URL is not set. Add it to backend/.env",
  );
}
if (isTest && url === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must NOT equal DATABASE_URL. Refusing to run tests.");
}

export const sql = postgres(url, { ssl: "require", max: 5 });
export const db = drizzle({ client: sql });