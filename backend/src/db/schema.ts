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
  numeric,
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


export const intentState = pgEnum("intent_state", [
  "created",
  "risk_approved",
  "proposal_obtained",
  "purchase_sent",
  "purchase_confirmed",
  "purchase_uncertain",
  "needs_review",
  "rejected",
  "failed",
]);

export const contractStatus = pgEnum("contract_status", ["open", "awaiting_settlement", "settled", "unknown"]);

export const contractOutcome = pgEnum("contract_outcome", ["win", "loss", "breakeven"]);

// One row per trade attempt. Written BEFORE a purchase is sent to Deriv.
// Money is exact decimal text, never a floating-point number.
export const tradeIntents = pgTable(
  "trade_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    signalId: uuid("signal_id").references(() => signals.id, { onDelete: "set null" }),
    accountId: text("account_id").notNull(),
    accountType: text("account_type").notNull(),
    symbol: text("symbol").notNull(),
    contractType: text("contract_type").notNull(),
    stake: numeric("stake", { precision: 20, scale: 8 }).notNull(),
    currency: text("currency").notNull(),
    duration: integer("duration").notNull(),
    durationUnit: text("duration_unit").notNull(),
    state: intentState("state").notNull().default("created"),
    stateReason: text("state_reason"),
    proposalId: text("proposal_id"),
    askPrice: numeric("ask_price", { precision: 20, scale: 8 }),
    payout: numeric("payout", { precision: 20, scale: 8 }),
    purchaseSentAt: timestamp("purchase_sent_at", { withTimezone: true }),
    derivContractId: bigint("deriv_contract_id", { mode: "number" }),
    derivTransactionId: bigint("deriv_transaction_id", { mode: "number" }),
    buyPrice: numeric("buy_price", { precision: 20, scale: 8 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A signal can only be traded once per Deriv account.
    uniqueIndex("trade_intents_one_per_signal_account")
      .on(t.signalId, t.accountId)
      .where(sql`${t.signalId} is not null`),
    // A Deriv contract belongs to exactly one attempt.
    uniqueIndex("trade_intents_contract_unique")
      .on(t.accountId, t.derivContractId)
      .where(sql`${t.derivContractId} is not null`),
    index("trade_intents_user_created_idx").on(t.userId, t.createdAt),
    index("trade_intents_state_idx").on(t.state),
    check("trade_intents_stake_positive", sql`${t.stake} > 0`),
    check("trade_intents_account_type", sql`${t.accountType} in ('demo', 'real')`),
    check(
      "trade_intents_confirmed_has_contract",
      sql`${t.state} <> 'purchase_confirmed' or (${t.derivContractId} is not null and ${t.derivTransactionId} is not null and ${t.buyPrice} is not null)`,
    ),
  ],
).enableRLS();

// One row per purchased contract, followed until Deriv says it is settled.
export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => tradeIntents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    accountType: text("account_type").notNull(),
    derivContractId: bigint("deriv_contract_id", { mode: "number" }).notNull(),
    derivTransactionId: bigint("deriv_transaction_id", { mode: "number" }).notNull(),
    symbol: text("symbol").notNull(),
    contractType: text("contract_type").notNull(),
    currency: text("currency").notNull(),
    buyPrice: numeric("buy_price", { precision: 20, scale: 8 }).notNull(),
    payout: numeric("payout", { precision: 20, scale: 8 }),
    status: contractStatus("status").notNull().default("open"),
    outcome: contractOutcome("outcome"),
    sellPrice: numeric("sell_price", { precision: 20, scale: 8 }),
    profit: numeric("profit", { precision: 20, scale: 8 }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contracts_intent_unique").on(t.intentId),
    uniqueIndex("contracts_account_contract_unique").on(t.accountId, t.derivContractId),
    index("contracts_user_opened_idx").on(t.userId, t.openedAt),
    index("contracts_status_idx").on(t.status),
    check(
      "contracts_settled_has_result",
      sql`${t.status} <> 'settled' or (${t.sellPrice} is not null and ${t.profit} is not null and ${t.outcome} is not null and ${t.settledAt} is not null)`,
    ),
    check(
      "contracts_outcome_matches_profit",
      sql`${t.outcome} is null or (${t.outcome} = 'win' and ${t.profit} > 0) or (${t.outcome} = 'loss' and ${t.profit} < 0) or (${t.outcome} = 'breakeven' and ${t.profit} = 0)`,
    ),
  ],
).enableRLS();

// Append-only diary of everything that happens to an attempt.
// Never put secrets (tokens, passwords) in the payload.
export const tradeEvents = pgTable(
  "trade_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => tradeIntents.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trade_events_intent_idx").on(t.intentId, t.createdAt)],
).enableRLS();