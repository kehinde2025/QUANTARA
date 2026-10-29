CREATE TYPE "public"."contract_outcome" AS ENUM('win', 'loss', 'breakeven');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('open', 'awaiting_settlement', 'settled', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."intent_state" AS ENUM('created', 'risk_approved', 'proposal_obtained', 'purchase_sent', 'purchase_confirmed', 'purchase_uncertain', 'needs_review', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"account_type" text NOT NULL,
	"deriv_contract_id" bigint NOT NULL,
	"deriv_transaction_id" bigint NOT NULL,
	"symbol" text NOT NULL,
	"contract_type" text NOT NULL,
	"currency" text NOT NULL,
	"buy_price" numeric(20, 8) NOT NULL,
	"payout" numeric(20, 8),
	"status" "contract_status" DEFAULT 'open' NOT NULL,
	"outcome" "contract_outcome",
	"sell_price" numeric(20, 8),
	"profit" numeric(20, 8),
	"opened_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_settled_has_result" CHECK ("contracts"."status" <> 'settled' or ("contracts"."sell_price" is not null and "contracts"."profit" is not null and "contracts"."outcome" is not null and "contracts"."settled_at" is not null)),
	CONSTRAINT "contracts_outcome_matches_profit" CHECK ("contracts"."outcome" is null or ("contracts"."outcome" = 'win' and "contracts"."profit" > 0) or ("contracts"."outcome" = 'loss' and "contracts"."profit" < 0) or ("contracts"."outcome" = 'breakeven' and "contracts"."profit" = 0))
);
--> statement-breakpoint
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trade_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trade_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trade_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"signal_id" uuid,
	"account_id" text NOT NULL,
	"account_type" text NOT NULL,
	"symbol" text NOT NULL,
	"contract_type" text NOT NULL,
	"stake" numeric(20, 8) NOT NULL,
	"currency" text NOT NULL,
	"duration" integer NOT NULL,
	"duration_unit" text NOT NULL,
	"state" "intent_state" DEFAULT 'created' NOT NULL,
	"state_reason" text,
	"proposal_id" text,
	"ask_price" numeric(20, 8),
	"payout" numeric(20, 8),
	"purchase_sent_at" timestamp with time zone,
	"deriv_contract_id" bigint,
	"deriv_transaction_id" bigint,
	"buy_price" numeric(20, 8),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_intents_stake_positive" CHECK ("trade_intents"."stake" > 0),
	CONSTRAINT "trade_intents_account_type" CHECK ("trade_intents"."account_type" in ('demo', 'real')),
	CONSTRAINT "trade_intents_confirmed_has_contract" CHECK ("trade_intents"."state" <> 'purchase_confirmed' or ("trade_intents"."deriv_contract_id" is not null and "trade_intents"."deriv_transaction_id" is not null and "trade_intents"."buy_price" is not null))
);
--> statement-breakpoint
ALTER TABLE "trade_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_intent_id_trade_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."trade_intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_events" ADD CONSTRAINT "trade_events_intent_id_trade_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."trade_intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_intents" ADD CONSTRAINT "trade_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_intents" ADD CONSTRAINT "trade_intents_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_intent_unique" ON "contracts" USING btree ("intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_account_contract_unique" ON "contracts" USING btree ("account_id","deriv_contract_id");--> statement-breakpoint
CREATE INDEX "contracts_user_opened_idx" ON "contracts" USING btree ("user_id","opened_at");--> statement-breakpoint
CREATE INDEX "contracts_status_idx" ON "contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trade_events_intent_idx" ON "trade_events" USING btree ("intent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trade_intents_one_per_signal_account" ON "trade_intents" USING btree ("signal_id","account_id") WHERE "trade_intents"."signal_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "trade_intents_contract_unique" ON "trade_intents" USING btree ("account_id","deriv_contract_id") WHERE "trade_intents"."deriv_contract_id" is not null;--> statement-breakpoint
CREATE INDEX "trade_intents_user_created_idx" ON "trade_intents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "trade_intents_state_idx" ON "trade_intents" USING btree ("state");