ALTER TABLE "companies" ADD COLUMN "pickup_commission" double precision;--> statement-breakpoint
ALTER TABLE "pickup_requests" ADD COLUMN "commission_rate" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pickup_requests" ADD COLUMN "paid_at" text;