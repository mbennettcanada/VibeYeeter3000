import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { buildApp } from "../app.js";
import { db } from "../db/client.js";
import { deployments } from "../db/schema.js";
import { createTestTeam, createTestApp, cleanupApp, cleanupTeam } from "../test-utils/fixtures.js";
import type { FastifyInstance } from "fastify";

describe("deployments routes", () => {
  let app: FastifyInstance;
  let teamId: string;
  let appId: string;

  beforeAll(async () => {
    app = await buildApp();
    const team = await createTestTeam();
    teamId = team.id;
    const seeded = await createTestApp(teamId);
    appId = seeded.id;

    await db.insert(deployments).values([
      {
        appId,
        imageTag: "abc1234",
        status: "succeeded",
        triggeredBy: "test@acme.com",
        duration: 42,
        createdAt: new Date(Date.now() - 60_000),
      },
      {
        appId,
        imageTag: "def5678",
        status: "failed",
        triggeredBy: "test@acme.com",
        duration: 12,
        createdAt: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(deployments).where(eq(deployments.appId, appId));
    await cleanupApp(appId);
    await cleanupTeam(teamId);
    await app.close();
  });

  it("GET /apps/:id/deployments returns deployments ordered by newest first", async () => {
    const response = await app.inject({ method: "GET", url: `/apps/${appId}/deployments` });
    expect(response.statusCode).toBe(200);

    const body = response.json() as { deployments: Array<{ imageTag: string }> };
    expect(body.deployments).toHaveLength(2);
    expect(body.deployments[0]?.imageTag).toBe("def5678");
  });

  it("GET /apps/:id/deployments returns 404 for an unknown app", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/apps/00000000-0000-0000-0000-000000000000/deployments",
    });
    expect(response.statusCode).toBe(404);
  });
});
