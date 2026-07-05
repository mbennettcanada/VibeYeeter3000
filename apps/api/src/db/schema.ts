import { pgTable, text, timestamp, integer, uuid, boolean, primaryKey } from "drizzle-orm/pg-core";

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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
  triggeredBy: text("triggered_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  duration: integer("duration"),
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
