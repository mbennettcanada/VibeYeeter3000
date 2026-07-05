import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { deployments } from "../db/schema.js";
import { createTestTeam, createTestApp, cleanupApp, cleanupTeam } from "../test-utils/fixtures.js";
import type { FastifyInstance } from "fastify";

const k8sMocks = vi.hoisted(() => ({
  isKubernetesConfigured: vi.fn(() => true),
  applyDeployment: vi.fn(async () => undefined),
}));

vi.mock("../services/kubernetes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/kubernetes.js")>();
  return { ...actual, ...k8sMocks };
});

const { buildApp } = await import("../app.js");

describe("secrets routes", () => {
  let app: FastifyInstance;
  let teamId: string;
  let appId: string;

  beforeAll(async () => {
    app = await buildApp();
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

  beforeEach(() => {
    k8sMocks.isKubernetesConfigured.mockReturnValue(true);
    k8sMocks.applyDeployment.mockReset().mockResolvedValue(undefined);
  });

  it("GET /apps/:id/secrets starts empty", async () => {
    const response = await app.inject({ method: "GET", url: `/apps/${appId}/secrets` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ secrets: [] });
  });

  it("POST /apps/:id/secrets creates a secret and never returns the value", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/apps/${appId}/secrets`,
      payload: { key: "DATABASE_URL", value: "postgres://example" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { secret: Record<string, unknown> };
    expect(body.secret.key).toBe("DATABASE_URL");
    expect(body.secret).not.toHaveProperty("value");

    const listResponse = await app.inject({ method: "GET", url: `/apps/${appId}/secrets` });
    const listBody = listResponse.json() as { secrets: Array<{ key: string }> };
    expect(listBody.secrets.map((s) => s.key)).toContain("DATABASE_URL");
  });

  it("POST /apps/:id/secrets returns 422 for an invalid key", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/apps/${appId}/secrets`,
      payload: { key: "not-valid", value: "x" },
    });
    expect(response.statusCode).toBe(422);
  });

  it("POST /apps/:id/secrets returns 404 for an unknown app", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/apps/00000000-0000-0000-0000-000000000000/secrets",
      payload: { key: "FOO", value: "bar" },
    });
    expect(response.statusCode).toBe(404);
  });

  describe("PUT /apps/:id/secrets/:key", () => {
    it("rotates the value and bumps updatedAt without triggering a restart", async () => {
      await app.inject({
        method: "POST",
        url: `/apps/${appId}/secrets`,
        payload: { key: "ROTATE_ME", value: "old" },
      });

      const response = await app.inject({
        method: "PUT",
        url: `/apps/${appId}/secrets/ROTATE_ME`,
        payload: { value: "new" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { secret: Record<string, unknown>; restart?: unknown };
      expect(body.secret.key).toBe("ROTATE_ME");
      expect(body.secret).not.toHaveProperty("value");
      expect(body.restart).toBeUndefined();
      expect(k8sMocks.applyDeployment).not.toHaveBeenCalled();
    });

    it("triggers a rolling restart when the app has a running deployment", async () => {
      await app.inject({
        method: "POST",
        url: `/apps/${appId}/secrets`,
        payload: { key: "RESTART_ME", value: "old" },
      });

      const [running] = await db
        .insert(deployments)
        .values({ appId, imageTag: "restart-tag", status: "running", triggeredBy: "test@acme.com" })
        .returning();

      const response = await app.inject({
        method: "PUT",
        url: `/apps/${appId}/secrets/RESTART_ME`,
        payload: { value: "new" },
      });

      expect(response.statusCode).toBe(200);
      expect(k8sMocks.applyDeployment).toHaveBeenCalledWith(appId, "restart-tag");

      const body = response.json() as { restart?: { deploymentId: string } };
      expect(body.restart?.deploymentId).toBeDefined();
      expect(body.restart?.deploymentId).not.toBe(running?.id);

      await db.delete(deployments).where(eq(deployments.appId, appId));
    });

    it("returns 404 for an unknown key", async () => {
      const response = await app.inject({
        method: "PUT",
        url: `/apps/${appId}/secrets/DOES_NOT_EXIST`,
        payload: { value: "x" },
      });
      expect(response.statusCode).toBe(404);
    });

    it("returns 422 for an empty value", async () => {
      await app.inject({
        method: "POST",
        url: `/apps/${appId}/secrets`,
        payload: { key: "VALIDATE_ME", value: "old" },
      });

      const response = await app.inject({
        method: "PUT",
        url: `/apps/${appId}/secrets/VALIDATE_ME`,
        payload: { value: "" },
      });
      expect(response.statusCode).toBe(422);
    });
  });

  it("DELETE /apps/:id/secrets/:key removes the secret", async () => {
    await app.inject({
      method: "POST",
      url: `/apps/${appId}/secrets`,
      payload: { key: "TO_DELETE", value: "x" },
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/apps/${appId}/secrets/TO_DELETE`,
    });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: "GET", url: `/apps/${appId}/secrets` });
    const listBody = listResponse.json() as { secrets: Array<{ key: string }> };
    expect(listBody.secrets.map((s) => s.key)).not.toContain("TO_DELETE");
  });

  it("DELETE /apps/:id/secrets/:key returns 404 for an unknown key", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/apps/${appId}/secrets/DOES_NOT_EXIST`,
    });
    expect(response.statusCode).toBe(404);
  });
});
