CREATE TYPE "public"."connection_status" AS ENUM('active', 'invalid');--> statement-breakpoint
CREATE TABLE "deriv_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_token" text NOT NULL,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"selected_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "deriv_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deriv_connections" ADD CONSTRAINT "deriv_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deriv_connections_user_unique" ON "deriv_connections" USING btree ("user_id");