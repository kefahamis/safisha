CREATE TABLE "package_charges" (
	"company" text NOT NULL,
	"month" text NOT NULL,
	"amount" integer NOT NULL,
	"charged_at" text NOT NULL,
	CONSTRAINT "package_charges_company_month_pk" PRIMARY KEY("company","month")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "care_package" text DEFAULT 'basic' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "premium_fee" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "premium_since" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Companies already on the platform keep every SMS they send today: they start on Premium,
-- and their first monthly charge is for the month after this one.
UPDATE "companies" SET "care_package" = 'premium', "premium_since" = to_char(now() AT TIME ZONE 'UTC' + interval '3 hours', 'YYYY-MM-DD HH24:MI');
