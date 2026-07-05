import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pod } from "@vibeyeeter/types";
import { createTestTeam, createTestApp, cleanupApp, cleanupTeam } from "../test-utils/fixtures.js";

const k8sMocks = vi.hoisted(() => ({
  isKubernetesConfigured: vi.fn(() => true),
  listPods: vi.fn(async (): Promise<Pod[]> => []),
  getPodLogs: vi.fn(async () => ""),
}));

vi.mock("../services/kubernetes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/kubernetes.js")>();
  return { ...actual, ...k8sMocks };
});

const { buildApp } = await import("../app.js");

describe("pods routes", () => {
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
    k8sMocks.listPods.mockReset().mockResolvedValue([
      { name: "app-abc123", status: "Running", restarts: 0, age: "5m", image: "registry/app:abc123" },
    ]);
    k8sMocks.getPodLogs.mockReset().mockResolvedValue("log line 1\nlog line 2\n");
  });

  describe("GET /apps/:id/pods", () => {
    it("returns pods from the kubernetes service", async () => {
      const response = await app.inject({ method: "GET", url: `/apps/${appId}/pods` });

      expect(response.statusCode).toBe(200);
      expect(k8sMocks.listPods).toHaveBeenCalledWith(appId);
      const body = response.json() as { pods: Array<{ name: string }> };
      expect(body.pods).toHaveLength(1);
      expect(body.pods[0]?.name).toBe("app-abc123");
    });

    it("returns an empty list when Kubernetes is not configured", async () => {
      k8sMocks.isKubernetesConfigured.mockReturnValue(false);

      const response = await app.inject({ method: "GET", url: `/apps/${appId}/pods` });

      expect(response.statusCode).toBe(200);
      expect(k8sMocks.listPods).not.toHaveBeenCalled();
      expect(response.json()).toEqual({ pods: [] });
    });

    it("returns 404 for an unknown app", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/apps/00000000-0000-0000-0000-000000000000/pods",
      });
      expect(response.statusCode).toBe(404);
    });

    it("returns 502 when listing pods fails", async () => {
      k8sMocks.listPods.mockRejectedValueOnce(new Error("cluster unreachable"));

      const response = await app.inject({ method: "GET", url: `/apps/${appId}/pods` });
      expect(response.statusCode).toBe(502);
    });
  });

  describe("GET /apps/:id/pods/:podName/logs", () => {
    it("returns logs from the kubernetes service", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/apps/${appId}/pods/app-abc123/logs`,
      });

      expect(response.statusCode).toBe(200);
      expect(k8sMocks.getPodLogs).toHaveBeenCalledWith(appId, "app-abc123", undefined);
      expect(response.json()).toEqual({ logs: "log line 1\nlog line 2\n" });
    });

    it("passes a custom line count through", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/apps/${appId}/pods/app-abc123/logs?lines=50`,
      });

      expect(response.statusCode).toBe(200);
      expect(k8sMocks.getPodLogs).toHaveBeenCalledWith(appId, "app-abc123", 50);
    });

    it("returns 404 for an unknown app", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/apps/00000000-0000-0000-0000-000000000000/pods/app-abc123/logs",
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
