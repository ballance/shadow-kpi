CREATE TABLE "bet" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"user_id" text NOT NULL,
	"side" text NOT NULL,
	"amount" integer NOT NULL,
	"placed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"lockup_at" timestamp NOT NULL,
	"resolves_at" timestamp NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "bet" ADD CONSTRAINT "bet_market_id_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."market"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet" ADD CONSTRAINT "bet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market" ADD CONSTRAINT "market_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market" ADD CONSTRAINT "market_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bet_market_idx" ON "bet" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "market_team_status_lockup_idx" ON "market" USING btree ("team_id","status","lockup_at");--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_market_id_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."market"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_bet_id_bet_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."bet"("id") ON DELETE set null ON UPDATE no action;