import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { buildApp } from "../app.js";
import { db } from "../db/client.js";
import { tfRuns } from "../db/schema.js";
import { createTestTeam, createTestApp, cleanupApp, cleanupTeam } from "../test-utils/fixtures.js";
import type { FastifyInstance } from "fastify";

describe("terraform routes", () => {
  let app: FastifyInstance;
  let teamId: string;
  let appId: string;

  beforeAll(async () => {
    app = await buildApp();
    const team = await createTestTeam();
    teamId = team.id;
    const seeded = await createTestApp(teamId);
    appId = seeded.id;

    await db.insert(tfRuns).values([
      {
        appId,
        type: "plan",
        status: "succeeded",
        planDiff: "1 to add",
        createdAt: new Date(Date.now() - 60_000),
      },
      { appId, type: "apply", status: "succeeded", planDiff: null, createdAt: new Date() },
    ]);
  });

  afterAll(async () => {
    await db.delete(tfRuns).where(eq(tfRuns.appId, appId));
    await cleanupApp(appId);
    await cleanupTeam(teamId);
    await app.close();
  });

  it("GET /apps/:id/terraform returns runs ordered by newest first", async () => {
    const response = await app.inject({ method: "GET", url: `/apps/${appId}/terraform` });
    expect(response.statusCode).toBe(200);

    const body = response.json() as { runs: Array<{ type: string }> };
    expect(body.runs).toHaveLength(2);
    expect(body.runs[0]?.type).toBe("apply");
  });

  it("GET /apps/:id/terraform returns 404 for an unknown app", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/apps/00000000-0000-0000-0000-000000000000/terraform",
    });
    expect(response.statusCode).toBe(404);
  });
});
