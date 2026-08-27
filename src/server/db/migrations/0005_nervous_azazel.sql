CREATE TABLE "contest_guess" (
	"id" text PRIMARY KEY NOT NULL,
	"contest_id" text NOT NULL,
	"user_id" text NOT NULL,
	"guess_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_contest" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"symbol" text NOT NULL,
	"contest_date" date NOT NULL,
	"submissions_close_at" timestamp NOT NULL,
	"resolves_after" timestamp NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"actual_close_cents" integer,
	"prize_tiers" text NOT NULL,
	"resolution_source" text,
	"resolved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "team_contest_config" (
	"team_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"symbols" text DEFAULT '[]' NOT NULL,
	"prize_tiers" text DEFAULT '[25,15,10]' NOT NULL,
	"rotation_cursor" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD COLUMN "contest_id" text;--> statement-breakpoint
ALTER TABLE "contest_guess" ADD CONSTRAINT "contest_guess_contest_id_price_contest_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."price_contest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_guess" ADD CONSTRAINT "contest_guess_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_contest" ADD CONSTRAINT "price_contest_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_contest" ADD CONSTRAINT "price_contest_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_contest_config" ADD CONSTRAINT "team_contest_config_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contest_guess_contest_user_idx" ON "contest_guess" USING btree ("contest_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_contest_team_date_symbol_idx" ON "price_contest" USING btree ("team_id","contest_date","symbol");--> statement-breakpoint
CREATE INDEX "price_contest_team_status_date_idx" ON "price_contest" USING btree ("team_id","status","contest_date");--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_contest_id_price_contest_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."price_contest"("id") ON DELETE set null ON UPDATE no action;