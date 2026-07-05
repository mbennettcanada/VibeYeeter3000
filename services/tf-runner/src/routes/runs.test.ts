import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { createTestTeam, createTestApp, cleanupApp, cleanupTeam } from "../test-utils/fixtures.js";
import { db } from "../db/client.js";
import { tfRuns } from "../db/schema.js";
import { runsRoute } from "./runs.js";

describe("GET /runs/:runId", () => {
  let app: FastifyInstance;
  let teamId: string;
  let appId: string;

  beforeAll(async () => {
    app = Fastify();
    await app.register(runsRoute);

    const team = await createTestTeam();
    teamId = team.id;
    const seeded = await createTestApp(teamId);
    appId = seeded.id;
  });

  afterAll(async () => {
    await cleanupApp(appId);
    await cleanupTeam(teamId);
    await app.close();
  });

  it("returns the full run details", async () => {
    const [run] = await db
      .insert(tfRuns)
      .values({ appId, type: "plan", status: "succeeded", output: "some output", planDiff: "Plan: 1 to add." })
      .returning();

    const response = await app.inject({ method: "GET", url: `/runs/${run?.id}` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { run: { id: string; output: string; planDiff: string } };
    expect(body.run.id).toBe(run?.id);
    expect(body.run.output).toBe("some output");
    expect(body.run.planDiff).toBe("Plan: 1 to add.");
  });

  it("returns 404 for an unknown run id", async () => {
    const response = await app.inject({ method: "GET", url: `/runs/${randomUUID()}` });
    expect(response.statusCode).toBe(404);
  });
});
