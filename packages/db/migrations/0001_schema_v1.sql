CREATE TYPE "public"."business_source" AS ENUM('signup', 'discovery', 'admin');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."consent_purpose" AS ENUM('transactional', 'outreach');--> statement-breakpoint
CREATE TYPE "public"."contractor_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'changes_needed', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('license', 'insurance', 'other');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('open', 'upheld', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."introduction_status" AS ENUM('shortlisted', 'requested', 'accepted', 'declined', 'estimate_sent', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'retrying', 'dead');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'approved', 'contacted', 'claimed', 'rejected', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'dispatched');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'submitted', 'reviewing', 'options_ready', 'introduction_requested', 'in_progress', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('homeowner', 'contractor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'uploaded', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('open', 'approved', 'changes_needed', 'rejected');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"address" text,
	"location" geometry(point),
	"google_place_id" text,
	"source" "business_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_google_place_id_unique" UNIQUE("google_place_id")
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"channel" "channel" NOT NULL,
	"address" text NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"granted" boolean NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"status" "contractor_status" DEFAULT 'draft' NOT NULL,
	"bio" text,
	"years_in_business" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "contractor_trades" (
	"profile_id" uuid NOT NULL,
	"trade_slug" text NOT NULL,
	CONSTRAINT "contractor_trades_profile_id_trade_slug_pk" PRIMARY KEY("profile_id","trade_slug")
);
--> statement-breakpoint
CREATE TABLE "discovered_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"trade_slug" text NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"actor_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"introduction_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"scope" text NOT NULL,
	"start_date" date,
	"warranty" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "introductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" "introduction_status" DEFAULT 'shortlisted' NOT NULL,
	"match_reason" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"rerun_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"introduction_id" uuid NOT NULL,
	"raised_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "flag_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"introduction_id" uuid,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "project_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "upload_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_photos_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"homeowner_id" uuid NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"zip_code" text NOT NULL,
	"location" geometry(point),
	"trade_slug" text,
	"availability" text,
	"budget_range" text,
	"contact_preference" text,
	"ai_brief" jsonb,
	"brief_approved_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"center" geometry(point) NOT NULL,
	"radius_miles" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"channel" "channel" NOT NULL,
	"address" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppressions_channel_address_pk" PRIMARY KEY("channel","address")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_subject" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"phone" text,
	"role" "role" NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_subject_unique" UNIQUE("auth_subject"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" "verification_status" DEFAULT 'open' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"expires_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_profiles" ADD CONSTRAINT "contractor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_profiles" ADD CONSTRAINT "contractor_profiles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_trades" ADD CONSTRAINT "contractor_trades_profile_id_contractor_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."contractor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_trades" ADD CONSTRAINT "contractor_trades_trade_slug_trades_slug_fk" FOREIGN KEY ("trade_slug") REFERENCES "public"."trades"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_leads" ADD CONSTRAINT "discovered_leads_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_leads" ADD CONSTRAINT "discovered_leads_trade_slug_trades_slug_fk" FOREIGN KEY ("trade_slug") REFERENCES "public"."trades"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_leads" ADD CONSTRAINT "discovered_leads_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_introduction_id_introductions_id_fk" FOREIGN KEY ("introduction_id") REFERENCES "public"."introductions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_profile_id_contractor_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."contractor_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_flags" ADD CONSTRAINT "lead_flags_introduction_id_introductions_id_fk" FOREIGN KEY ("introduction_id") REFERENCES "public"."introductions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_flags" ADD CONSTRAINT "lead_flags_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_introduction_id_introductions_id_fk" FOREIGN KEY ("introduction_id") REFERENCES "public"."introductions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_homeowner_id_users_id_fk" FOREIGN KEY ("homeowner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_trade_slug_trades_slug_fk" FOREIGN KEY ("trade_slug") REFERENCES "public"."trades"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_profile_id_contractor_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."contractor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_profile_id_contractor_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."contractor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_case_id_verification_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."verification_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "businesses_location_gix" ON "businesses" USING gist ("location");--> statement-breakpoint
CREATE INDEX "consents_address_idx" ON "consents" USING btree ("channel","address");--> statement-breakpoint
CREATE UNIQUE INDEX "discovered_leads_business_trade_uq" ON "discovered_leads" USING btree ("business_id","trade_slug");--> statement-breakpoint
CREATE INDEX "domain_events_user_ids_gin" ON "domain_events" USING gin ("user_ids");--> statement-breakpoint
CREATE INDEX "domain_events_aggregate_idx" ON "domain_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "introductions_project_profile_uq" ON "introductions" USING btree ("project_id","profile_id");--> statement-breakpoint
CREATE INDEX "introductions_profile_idx" ON "introductions" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "job_runs_status_idx" ON "job_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_project_idx" ON "messages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("available_at") WHERE "outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "project_photos_project_idx" ON "project_photos" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_homeowner_idx" ON "projects" USING btree ("homeowner_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "service_areas_center_gix" ON "service_areas" USING gist ("center");