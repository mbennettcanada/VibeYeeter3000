CREATE TABLE IF NOT EXISTS "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secrets_app_id_key_unique" UNIQUE("app_id","key")
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "subdomain" text NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "secrets" ADD CONSTRAINT "secrets_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_subdomain_unique" UNIQUE("subdomain");