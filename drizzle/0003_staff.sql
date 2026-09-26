CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
-- Existing databases: company admins manage their own staff. (A fresh database
-- has no roles yet here; the seed writes them with this included.)
UPDATE "roles" SET "permissions" = "permissions" || '["staff.manage"]'::jsonb WHERE "id" = 'company_admin' AND NOT ("permissions" ? 'staff.manage');
