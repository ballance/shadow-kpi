CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" text,
	"market_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_market_id_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."market"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_market_id_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."market"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_market_created_idx" ON "comment" USING btree ("market_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_user_read_idx" ON "notification" USING btree ("user_id","read_at");