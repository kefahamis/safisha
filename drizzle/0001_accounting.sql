CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"date" text NOT NULL,
	"memo" text NOT NULL,
	"reference" text,
	"reverses" text,
	"posted_by" text NOT NULL,
	"posted_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry" text NOT NULL,
	"account" text NOT NULL,
	"debit" integer DEFAULT 0 NOT NULL,
	"credit" integer DEFAULT 0 NOT NULL,
	"memo" text
);
--> statement-breakpoint
-- Existing databases: give the shipped roles the new accounting permissions.
-- (A fresh database is seeded after migrating, from DEFAULT_ROLES.)
UPDATE "roles" SET "permissions" = "permissions" || '["finance.view", "finance.journal"]'::jsonb
WHERE "id" = 'company_admin' AND NOT "permissions" @> '["finance.view"]'::jsonb;
--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || '["finance.view"]'::jsonb
WHERE "id" = 'platform_admin' AND NOT "permissions" @> '["finance.view"]'::jsonb;
