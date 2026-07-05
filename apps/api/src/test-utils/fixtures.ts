import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { apps, deployments, secrets, teams, tfRuns } from "../db/schema.js";
import { eq } from "drizzle-orm";

function unique(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export async function createTestTeam() {
  const [team] = await db
    .insert(teams)
    .values({ name: unique("Test Team"), slug: unique("test-team") })
    .returning();
  if (!team) throw new Error("failed to create test team");
  return team;
}

export async function createTestApp(teamId: string) {
  const slug = unique("test-app");
  const [app] = await db
    .insert(apps)
    .values({
      name: slug,
      slug,
      teamId,
      repoUrl: "https://github.com/acme/test-app",
      namespace: slug,
      subdomain: `${slug}.apps.internal.co`,
    })
    .returning();
  if (!app) throw new Error("failed to create test app");
  return app;
}

export async function cleanupApp(appId: string) {
  await db.delete(secrets).where(eq(secrets.appId, appId));
  await db.delete(deployments).where(eq(deployments.appId, appId));
  await db.delete(tfRuns).where(eq(tfRuns.appId, appId));
  await db.delete(apps).where(eq(apps.id, appId));
}

export async function cleanupTeam(teamId: string) {
  await db.delete(teams).where(eq(teams.id, teamId));
}
