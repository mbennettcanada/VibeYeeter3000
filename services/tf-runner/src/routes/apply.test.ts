import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createFakeChild } from "../test-utils/fake-spawn.js";
import { createTestTeam, createTestApp, cleanupApp, cleanupTeam } from "../test-utils/fixtures.js";
import { db } from "../db/client.js";
import { tfRuns } from "../db/schema.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const { spawn } = await import("node:child_process");
const spawnMock = vi.mocked(spawn);

describe("POST /apply", () => {
  let app: FastifyInstance;
  let teamId: string;
  let appId: string;

  beforeAll(async () => {
    const Fastify = (await import("fastify")).default;
    const { applyRoute } = await import("./apply.js");

    app = Fastify();
    await app.register(applyRoute);

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

  afterEach(() => {
    spawnMock.mockReset();
  });

  it("returns 400 when the referenced run does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/apply",
      payload: { runId: randomUUID() },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when the referenced run is not a succeeded plan", async () => {
    const [failedPlan] = await db
      .insert(tfRuns)
      .values({ appId, type: "plan", status: "failed" })
      .returning();

    const response = await app.inject({
      method: "POST",
      url: "/apply",
      payload: { runId: failedPlan?.id },
    });

    expect(response.statusCode).toBe(400);
  });

  it("applies a succeeded plan and updates the same row", async () => {
    const [succeededPlan] = await db
      .insert(tfRuns)
      .values({ appId, type: "plan", status: "succeeded", output: "plan output\n" })
      .returning();
    const runId = succeededPlan?.id as string;

    spawnMock.mockImplementationOnce(
      () =>
        createFakeChild({
          stdout: '{"type":"change_summary","changes":{"add":1,"change":0,"remove":0}}\n',
          exitCode: 0,
        }) as never,
    );

    const response = await app.inject({
      method: "POST",
      url: "/apply",
      payload: { runId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { runId: string; status: string; rawOutput: string };
    expect(body.status).toBe("succeeded");
    expect(body.rawOutput).toContain("plan output");

    const [row] = await db.select().from(tfRuns).where(eq(tfRuns.id, runId)).limit(1);
    expect(row?.type).toBe("apply");
    expect(row?.status).toBe("succeeded");
  });

  it("returns 422 for an invalid body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/apply",
      payload: { runId: "not-a-uuid" },
    });

    expect(response.statusCode).toBe(422);
  });
});
