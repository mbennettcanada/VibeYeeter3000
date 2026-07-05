import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// This service has no dependency on apps/api (see CLAUDE.md dependency
// order: types ← tf-runner), so these table definitions are a mirror of
// apps/api/src/db/schema.ts rather than an import from it. apps/api owns
// migrations for these tables — this service only ever reads/writes rows,
// it never runs `db:generate` or `db:migrate` itself.
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

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
  output: text("output"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
