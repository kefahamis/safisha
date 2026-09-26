CREATE TABLE "fleet_days" (
	"truck" text NOT NULL,
	"day" text NOT NULL,
	"company" text NOT NULL,
	"driver" text NOT NULL,
	"km" double precision DEFAULT 0 NOT NULL,
	"moving_min" double precision DEFAULT 0 NOT NULL,
	"idle_min" double precision DEFAULT 0 NOT NULL,
	"max_kmh" double precision DEFAULT 0 NOT NULL,
	"dump_runs" integer DEFAULT 0 NOT NULL,
	"speeding" integer DEFAULT 0 NOT NULL,
	"after_hours" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "fleet_days_truck_day_pk" PRIMARY KEY("truck","day")
);
--> statement-breakpoint
CREATE TABLE "fleet_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject" text NOT NULL,
	"subject_name" text NOT NULL,
	"kind" text NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"expires_on" text NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"paid_from" text DEFAULT '1010' NOT NULL,
	"recorded_at" text NOT NULL,
	"recorded_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleet_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"truck" text NOT NULL,
	"driver" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"zone" text,
	"value" double precision
);
--> statement-breakpoint
CREATE TABLE "fuel_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"truck" text NOT NULL,
	"at" text NOT NULL,
	"litres" double precision NOT NULL,
	"amount" integer NOT NULL,
	"odometer_km" double precision NOT NULL,
	"station" text DEFAULT '' NOT NULL,
	"paid_from" text NOT NULL,
	"reference" text,
	"driver" text NOT NULL,
	"photo" text
);
--> statement-breakpoint
CREATE TABLE "gps_pings" (
	"id" serial PRIMARY KEY NOT NULL,
	"truck" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"kmh" double precision
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"truck" text NOT NULL,
	"driver" text NOT NULL,
	"at" text NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"photo" text,
	"police_ref" text,
	"status" text NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"truck" text NOT NULL,
	"driver" text NOT NULL,
	"at" text NOT NULL,
	"odometer_km" double precision NOT NULL,
	"items" jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"photo" text,
	"result" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"truck" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer NOT NULL,
	"capacity_kg" integer NOT NULL,
	"fuel" text DEFAULT 'diesel' NOT NULL,
	"tank_l" integer NOT NULL,
	"odometer_km" double precision NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"service_every_km" integer NOT NULL,
	"service_every_days" integer NOT NULL,
	"last_service_km" double precision NOT NULL,
	"last_service_date" text NOT NULL,
	"expected_km_per_l" double precision NOT NULL,
	"telemetry" jsonb
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"truck" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"opened_at" text NOT NULL,
	"opened_by" text NOT NULL,
	"closed_at" text,
	"inspection" integer,
	"critical" boolean DEFAULT false NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"parts_cost" integer DEFAULT 0 NOT NULL,
	"labour_cost" integer DEFAULT 0 NOT NULL,
	"paid_from" text DEFAULT '1010' NOT NULL,
	"odometer_km" double precision
);
--> statement-breakpoint
CREATE INDEX "fleet_events_company_at" ON "fleet_events" USING btree ("company","at");--> statement-breakpoint
CREATE INDEX "gps_pings_truck_at" ON "gps_pings" USING btree ("truck","at");--> statement-breakpoint
-- Existing databases: give the shipped roles the new fleet permissions. A fresh
-- database has no roles yet here; the seed writes them with these included.
UPDATE "roles" SET "permissions" = "permissions" || '["fleet.manage"]'::jsonb WHERE "id" = 'company_admin' AND NOT ("permissions" ? 'fleet.manage');--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || '["fleet.inspect"]'::jsonb WHERE "id" = 'collector' AND NOT ("permissions" ? 'fleet.inspect');
