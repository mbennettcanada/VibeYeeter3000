import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  boolean,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";

export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apps = pgTable("apps", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id),
  repoUrl: text("repo_url").notNull(),
  namespace: text("namespace").notNull(),
  subdomain: text("subdomain").notNull().unique(),
  // Gates the pre-deploy migration Job (see services/kubernetes.ts
  // ensureMigrationJob) — apps without a migrate script should leave this false.
  migrationsEnabled: boolean("migrations_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const deployments = pgTable("deployments", {
  id: uuid("id").defaultRandom().primaryKey(),
  appId: uuid("app_id")
    .notNull()
    .references(() => apps.id),
  imageTag: text("image_tag").notNull(),
  status: text("status", {
    enum: ["pending", "running", "succeeded", "failed", "rolled_back"],
  })
    .notNull()
    .default("pending"),
  // "restart" rows are created when a secret change triggers a rolling
  // restart of the existing image — no new image tag, just a re-apply.
  type: text("type", { enum: ["deploy", "rollback", "restart"] })
    .notNull()
    .default("deploy"),
  triggeredBy: text("triggered_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  duration: integer("duration"),
  // GitHub's numeric deployment id, set once we call the Deployments API for
  // this row. Used to reconcile inbound deployment_status webhooks back to
  // the right row. Null until that call happens (see webhook push handler).
  githubDeploymentId: integer("github_deployment_id"),
});

// Owned by apps/api (migrations live here), but also read/written directly
// by services/tf-runner against the same Postgres instance — see
// services/tf-runner/src/db/schema.ts, which mirrors this table definition
// since that service has no dependency on apps/api.
export const tfRuns = pgTable("tf_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  appId: uuid("app_id")
    .notNull()
    .references(() => apps.id),
  type: text("type", { enum: ["plan", "apply", "destroy"] }).notNull(),
  status: text("status", { enum: ["pending", "running", "succeeded", "failed"] })
    .notNull()
    .default("pending"),
  planDiff: text("plan_diff"),
  // Full combined stdout/stderr from the tofu invocation(s) for this run.
  output: text("output"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Secret VALUES are never stored here — see CLAUDE.md "Secrets — never log,
// never return values". This table only tracks which keys exist per app so
// the dashboard can list/manage them; actual values live in AWS Secrets
// Manager (services/aws.ts, currently stubbed).
export const secrets = pgTable(
  "secrets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    appKeyUnique: unique().on(table.appId, table.key),
  }),
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.userId] }),
  }),
);

// Maps a team to the SAML IdP group (JumpCloud "memberOf" value, or
// whichever attribute SAML_GROUPS_ATTRIBUTE points at) that should be
// synced into membership on every SSO login. A team may have zero or more
// external groups mapped to it.
export const teamExternalGroups = pgTable("team_external_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id),
  externalGroupId: text("external_group_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
