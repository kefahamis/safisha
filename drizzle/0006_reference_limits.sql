CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"paybill" text DEFAULT '' NOT NULL,
	"care" text DEFAULT '' NOT NULL,
	"hours" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#0E7490' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estates" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius" integer DEFAULT 1500 NOT NULL,
	"days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"company" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);