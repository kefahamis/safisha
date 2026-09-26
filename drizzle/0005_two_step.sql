CREATE TABLE "user_factors" (
	"id" serial PRIMARY KEY NOT NULL,
	"user" text NOT NULL,
	"method" text NOT NULL,
	"label" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"secret" text,
	"credential_id" text,
	"public_key" text,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verified_at" text,
	"created_at" text NOT NULL,
	"last_used_at" text
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;