CREATE TABLE "slack_install" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"workspace_name" text NOT NULL,
	"bot_token_ciphertext" text NOT NULL,
	"bot_token_iv" text NOT NULL,
	"bot_user_id" text NOT NULL,
	"installer_user_id" text,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "slack_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"payload" text NOT NULL,
	"dedup_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_team_channel" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text NOT NULL,
	"configured_by_user_id" text,
	"configured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_user_link" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"slack_user_id" text NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_install" ADD CONSTRAINT "slack_install_installer_user_id_user_id_fk" FOREIGN KEY ("installer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_team_channel" ADD CONSTRAINT "slack_team_channel_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_team_channel" ADD CONSTRAINT "slack_team_channel_configured_by_user_id_user_id_fk" FOREIGN KEY ("configured_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_user_link" ADD CONSTRAINT "slack_user_link_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_install_workspace_id_idx" ON "slack_install" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "slack_outbox_pending_idx" ON "slack_outbox" USING btree ("status","next_attempt_at") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "slack_outbox_dedup_key_idx" ON "slack_outbox" USING btree ("dedup_key") WHERE dedup_key IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_team_channel_team_id_idx" ON "slack_team_channel" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_user_link_user_workspace_idx" ON "slack_user_link" USING btree ("user_id","workspace_id");