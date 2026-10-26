import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "suspended"]);
export const connectionStatus = pgEnum("connection_status", ["active", "invalid"]);


export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(), // always stored lowercase; the database enforces it
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("user"),
    status: userStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
).enableRLS();

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(), // hash of the cookie token, never the token itself
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("user_sessions_token_hash_unique").on(t.tokenHash),
    index("user_sessions_user_id_idx").on(t.userId),
    index("user_sessions_expires_at_idx").on(t.expiresAt),
  ],
).enableRLS();

// One saved Deriv token per user. The token is stored ENCRYPTED, never as plain text.
export const derivConnections = pgTable(
  "deriv_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    encryptedToken: text("encrypted_token").notNull(),
    status: connectionStatus("status").notNull().default("active"),
    selectedAccountId: text("selected_account_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("deriv_connections_user_unique").on(t.userId)],
).enableRLS();

export const signalStatus = pgEnum("signal_status", [
  "new",
  "valid",
  "executed",
  "expired",
  "cancelled",
  "rejected",
  "failed",
]);

export const signalDirection = pgEnum("signal_direction", ["rise", "fall"]);

// Platform-wide market signals. They describe a market, not a customer.
// One idea per strategy, market, timeframe and candle: the unique index stops
// duplicates after a restart.
export const signals = pgTable(
  "signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategy: text("strategy").notNull(),
    symbol: text("symbol").notNull(),
    direction: signalDirection("direction").notNull(),
    contractType: text("contract_type").notNull(),
    timeframeSeconds: integer("timeframe_seconds").notNull(),
    candleEpoch: bigint("candle_epoch", { mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    details: jsonb("details").$type<Record<string, number>>().notNull(),
    status: signalStatus("status").notNull().default("valid"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("signals_once_per_candle").on(t.strategy, t.symbol, t.timeframeSeconds, t.candleEpoch),
    index("signals_symbol_created_idx").on(t.symbol, t.createdAt),
    index("signals_status_expires_idx").on(t.status, t.expiresAt),
    check("signals_expiry_after_creation", sql`${t.expiresAt} > ${t.createdAt}`),
  ],
).enableRLS();
