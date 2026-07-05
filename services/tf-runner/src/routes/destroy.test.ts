import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createFakeChild } from "../test-utils/fake-spawn.js";
import { createTestTeam, createTestApp, cleanupApp, cleanupTeam } from "../test-utils/fixtures.js";
import { db } from "../db/client.js";
import { tfRuns } from "../db/schema.js";
import { runDirFor } from "../lib/run-dir.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const { spawn } = await import("node:child_process");
const spawnMock = vi.mocked(spawn);

describe("POST /destroy", () => {
  let app: FastifyInstance;
  let teamId: string;
  let appId: string;
  let sourceDir: string;
  const runIds: string[] = [];

  beforeAll(async () => {
    const Fastify = (await import("fastify")).default;
    const { destroyRoute } = await import("./destroy.js");

    app = Fastify();
    await app.register(destroyRoute);

    const team = await createTestTeam();
    teamId = team.id;
    const seeded = await createTestApp(teamId);
    appId = seeded.id;

    sourceDir = mkdtempSync(path.join(os.tmpdir(), "tf-runner-test-destroy-"));
    writeFileSync(path.join(sourceDir, "main.tf"), "# placeholder\n");
  });

  afterAll(async () => {
    await cleanupApp(appId);
    await cleanupTeam(teamId);
    rmSync(sourceDir, { recursive: true, force: true });
    for (const runId of runIds) {
      rmSync(runDirFor(runId), { recursive: true, force: true });
    }
    await app.close();
  });

  afterEach(() => {
    spawnMock.mockReset();
  });

  it("runs init + destroy and stores a succeeded run", async () => {
    spawnMock
      .mockImplementationOnce(() => createFakeChild({ stdout: "Initialized\n", exitCode: 0 }) as never)
      .mockImplementationOnce(
        () =>
          createFakeChild({
            stdout: '{"type":"change_summary","changes":{"add":0,"change":0,"remove":2}}\n',
            exitCode: 0,
          }) as never,
      );

    const response = await app.inject({
      method: "POST",
      url: "/destroy",
      payload: { appId, workingDir: sourceDir },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { runId: string; status: string };
    expect(body.status).toBe("succeeded");
    runIds.push(body.runId);

    const [row] = await db.select().from(tfRuns).where(eq(tfRuns.id, body.runId)).limit(1);
    expect(row?.type).toBe("destroy");
    expect(row?.status).toBe("succeeded");
  });

  it("marks the run failed when tofu destroy fails", async () => {
    spawnMock
      .mockImplementationOnce(() => createFakeChild({ stdout: "Initialized\n", exitCode: 0 }) as never)
      .mockImplementationOnce(() => createFakeChild({ stderr: "destroy error", exitCode: 1 }) as never);

    const response = await app.inject({
      method: "POST",
      url: "/destroy",
      payload: { appId, workingDir: sourceDir },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { runId: string; status: string };
    expect(body.status).toBe("failed");
    runIds.push(body.runId);
  });

  it("returns 422 for an invalid body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/destroy",
      payload: {},
    });

    expect(response.statusCode).toBe(422);
  });
});
