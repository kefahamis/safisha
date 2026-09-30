CREATE TABLE "care_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "care_package" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "care_package" DROP NOT NULL;--> statement-breakpoint
-- Premium becomes the first package in the catalogue, at the fee the platform had set.
INSERT INTO "care_packages" ("id", "name", "description", "price", "features", "active", "sort", "created_at")
VALUES (
  'premium',
  'Premium',
  'The full care desk: tickets, SMS and email to clients, and clients replying by SMS or email.',
  coalesce((SELECT nullif("config"->>'premiumFee', '')::int FROM "settings" WHERE "scope" = 'platform' AND "key" = 'packages'), 5000),
  '["tickets","sms","email","twoWay"]'::jsonb,
  true,
  0,
  to_char(now() AT TIME ZONE 'UTC' + interval '3 hours', 'YYYY-MM-DD HH24:MI')
);--> statement-breakpoint
-- Basic was the assistant alone, which is now having no package.
UPDATE "companies" SET "care_package" = NULL WHERE "care_package" = 'basic';
