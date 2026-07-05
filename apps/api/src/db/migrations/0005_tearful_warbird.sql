CREATE TABLE IF NOT EXISTS "team_external_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"external_group_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_external_groups_external_group_id_unique" UNIQUE("external_group_id")
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "type" text DEFAULT 'deploy' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_external_groups" ADD CONSTRAINT "team_external_groups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
