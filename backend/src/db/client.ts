import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Add it to backend/.env");
}

export const sql = postgres(url, { ssl: "require", max: 5 });
export const db = drizzle({ client: sql });