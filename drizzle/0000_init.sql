CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"actor_name" text NOT NULL,
	"company" text,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"user_id" text,
	"target" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_seq" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"estate" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"plan" integer NOT NULL,
	"phone" text NOT NULL,
	"joined" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dump_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter" text NOT NULL,
	"company" text,
	"estate" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"description" text NOT NULL,
	"size" text DEFAULT 'small' NOT NULL,
	"photo" text,
	"status" text NOT NULL,
	"created_at" text NOT NULL,
	"cleared_at" text
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"owner" text NOT NULL,
	"company" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"client" text NOT NULL,
	"company" text NOT NULL,
	"kind" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"preferred_date" text NOT NULL,
	"price" integer NOT NULL,
	"status" text NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"truck" text,
	"scheduled_for" text,
	"photo" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickups" (
	"id" serial PRIMARY KEY NOT NULL,
	"client" text NOT NULL,
	"when" text NOT NULL,
	"truck" text NOT NULL,
	"status" text NOT NULL,
	"weight_kg" double precision,
	"stream" text,
	"photo" text,
	"lat" double precision,
	"lng" double precision
);
--> statement-breakpoint
CREATE TABLE "reminder_log" (
	"client" text NOT NULL,
	"month" text NOT NULL,
	"stage" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" text,
	CONSTRAINT "reminder_log_client_month_stage_pk" PRIMARY KEY("client","month","stage")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"workspace" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"system" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_orders" (
	"truck" text NOT NULL,
	"day" text NOT NULL,
	"order" jsonb NOT NULL,
	"distance_m" integer NOT NULL,
	"baseline_m" integer NOT NULL,
	CONSTRAINT "route_orders_truck_day_pk" PRIMARY KEY("truck","day")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'unconfigured' NOT NULL,
	"status_detail" text,
	"tested_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "settings_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE TABLE "sms_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"company" text,
	"to" text NOT NULL,
	"body" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text NOT NULL,
	"provider_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stk_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_request_id" text,
	"company" text NOT NULL,
	"client" text NOT NULL,
	"phone" text NOT NULL,
	"amount" integer NOT NULL,
	"purpose" text DEFAULT 'account' NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"result_code" integer,
	"result_desc" text,
	"receipt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"truck" text NOT NULL,
	"client" text NOT NULL,
	"day" text NOT NULL,
	"status" text NOT NULL,
	"at" text NOT NULL,
	"photo" text,
	"lat" double precision,
	"lng" double precision,
	"weight_kg" double precision,
	"stream" text,
	"note" text,
	CONSTRAINT "stops_truck_client_day_pk" PRIMARY KEY("truck","client","day")
);
--> statement-breakpoint
CREATE TABLE "suspense" (
	"id" text PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"amount" integer NOT NULL,
	"payer" text NOT NULL,
	"date" text NOT NULL,
	"company" text NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket" text NOT NULL,
	"from" text NOT NULL,
	"text" text NOT NULL,
	"at" text NOT NULL,
	"photo" text,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"client" text NOT NULL,
	"company" text NOT NULL,
	"cat" text NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trucks" (
	"id" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"driver" text NOT NULL,
	"route" jsonb NOT NULL,
	"d" double precision DEFAULT 0 NOT NULL,
	"speed" double precision DEFAULT 90 NOT NULL,
	"status" text DEFAULT 'route' NOT NULL,
	"sharing" boolean DEFAULT true NOT NULL,
	"last_seen" text,
	"gps_lat" double precision,
	"gps_lng" double precision,
	"gps_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "txns" (
	"id" text PRIMARY KEY NOT NULL,
	"client" text NOT NULL,
	"date" text NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"desc" text NOT NULL,
	"channel" text,
	"payer" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"name" text NOT NULL,
	"role_id" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"denies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"password_hash" text NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"created_at" text NOT NULL,
	"last_login_at" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
