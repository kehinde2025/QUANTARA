CREATE TYPE "public"."signal_direction" AS ENUM('rise', 'fall');--> statement-breakpoint
CREATE TYPE "public"."signal_status" AS ENUM('new', 'valid', 'executed', 'expired', 'cancelled', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy" text NOT NULL,
	"symbol" text NOT NULL,
	"direction" "signal_direction" NOT NULL,
	"contract_type" text NOT NULL,
	"timeframe_seconds" integer NOT NULL,
	"candle_epoch" bigint NOT NULL,
	"reason" text NOT NULL,
	"details" jsonb NOT NULL,
	"status" "signal_status" DEFAULT 'valid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "signals_expiry_after_creation" CHECK ("signals"."expires_at" > "signals"."created_at")
);
--> statement-breakpoint
ALTER TABLE "signals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "signals_once_per_candle" ON "signals" USING btree ("strategy","symbol","timeframe_seconds","candle_epoch");--> statement-breakpoint
CREATE INDEX "signals_symbol_created_idx" ON "signals" USING btree ("symbol","created_at");--> statement-breakpoint
CREATE INDEX "signals_status_expires_idx" ON "signals" USING btree ("status","expires_at");