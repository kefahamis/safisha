CREATE TABLE "ticket_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket" text NOT NULL,
	"at" text NOT NULL,
	"actor" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "channel" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "assignee" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "resolved_at" text;--> statement-breakpoint
-- Tickets raised before channels existed: the crew's no-access reports and USSD.
UPDATE "tickets" SET "channel" = 'crew' WHERE "subject" = 'Crew could not access your gate';--> statement-breakpoint
UPDATE "tickets" SET "channel" = 'ussd' WHERE "subject" LIKE '%(reported by USSD)';
