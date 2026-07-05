import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { deployments } from "../db/schema.js";
import { createTestTeam, createTestApp, cleanupApp, cleanupTeam } from "../test-utils/fixtures.js";

const k8sMocks = vi.hoisted(() => ({
  isKubernetesConfigured: vi.fn(() => true),
  applyDeployment: vi.fn(async () => undefined),
  rollbackDeployment: vi.fn(async () => undefined),
}));

vi.mock("../services/kubernetes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/kubernetes.js")>();
  return { ...actual, ...k8sMocks };
});

const { buildApp } = await import("../app.js");

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

  beforeEach(() => {
    k8sMocks.isKubernetesConfigured.mockReturnValue(true);
    k8sMocks.applyDeployment.mockReset().mockResolvedValue(undefined);
    k8sMocks.rollbackDeployment.mockReset().mockResolvedValue(undefined);
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

  describe("POST /apps/:id/deployments", () => {
    it("applies the deployment and inserts a running deployment row", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/apps/${appId}/deployments`,
        payload: { imageTag: "newtag1" },
      });

      expect(response.statusCode).toBe(201);
      expect(k8sMocks.applyDeployment).toHaveBeenCalledWith(appId, "newtag1");

      const body = response.json() as { deployment: { imageTag: string; status: string } };
      expect(body.deployment.imageTag).toBe("newtag1");
      expect(body.deployment.status).toBe("running");
    });

    it("returns 404 for an unknown app", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/apps/00000000-0000-0000-0000-000000000000/deployments",
        payload: { imageTag: "newtag1" },
      });
      expect(response.statusCode).toBe(404);
    });

    it("returns 422 for an invalid body", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/apps/${appId}/deployments`,
        payload: {},
      });
      expect(response.statusCode).toBe(422);
    });

    it("returns 502 when applying the deployment fails", async () => {
      k8sMocks.applyDeployment.mockRejectedValueOnce(new Error("cluster unreachable"));

      const response = await app.inject({
        method: "POST",
        url: `/apps/${appId}/deployments`,
        payload: { imageTag: "newtag2" },
      });

      expect(response.statusCode).toBe(502);
    });

    it("skips applying and returns a warning when Kubernetes is not configured", async () => {
      k8sMocks.isKubernetesConfigured.mockReturnValue(false);

      const response = await app.inject({
        method: "POST",
        url: `/apps/${appId}/deployments`,
        payload: { imageTag: "newtag3" },
      });

      expect(response.statusCode).toBe(201);
      expect(k8sMocks.applyDeployment).not.toHaveBeenCalled();
      const body = response.json() as { warnings?: string[] };
      expect(body.warnings?.[0]).toMatch(/Kubernetes is not configured/);
    });
  });

  describe("POST /apps/:id/deployments/:deploymentId/rollback", () => {
    it("rolls back to the target deployment's image tag", async () => {
      const [target] = await db
        .insert(deployments)
        .values({ appId, imageTag: "rollback-target", status: "succeeded", triggeredBy: "test@acme.com" })
        .returning();

      const response = await app.inject({
        method: "POST",
        url: `/apps/${appId}/deployments/${target?.id}/rollback`,
      });

      expect(response.statusCode).toBe(200);
      expect(k8sMocks.rollbackDeployment).toHaveBeenCalledWith(appId, "rollback-target");

      const body = response.json() as { deployment: { imageTag: string; status: string } };
      expect(body.deployment.imageTag).toBe("rollback-target");
      expect(body.deployment.status).toBe("rolled_back");
    });

    it("returns 404 for an unknown deployment id", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/apps/${appId}/deployments/00000000-0000-0000-0000-000000000000/rollback`,
      });
      expect(response.statusCode).toBe(404);
    });

    it("returns 404 for an unknown app", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/apps/00000000-0000-0000-0000-000000000000/deployments/00000000-0000-0000-0000-000000000000/rollback",
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
