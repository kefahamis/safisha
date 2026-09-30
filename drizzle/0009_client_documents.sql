CREATE TABLE "client_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"client" text NOT NULL,
	"company" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"file" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_at" text NOT NULL,
	"uploaded_by" text NOT NULL
);
