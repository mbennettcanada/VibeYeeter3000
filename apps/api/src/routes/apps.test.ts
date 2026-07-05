import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createTestTeam, createTestApp, cleanupApp, cleanupTeam } from "../test-utils/fixtures.js";
import type { FastifyInstance } from "fastify";

// This machine may have a real ~/.kube/config, which would otherwise make
// isKubernetesConfigured() true and send these tests through real (slow,
// failing) cluster calls. Kubernetes behavior itself is covered by
// services/kubernetes.test.ts and routes/deployments.test.ts — here we just
// force the "not configured" branch so app creation/deletion stay fast and
// host-independent.
vi.mock("../services/kubernetes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/kubernetes.js")>();
  return { ...actual, isKubernetesConfigured: () => false };
});

const { buildApp } = await import("../app.js");

describe("apps routes", () => {
  let app: FastifyInstance;
  let teamId: string;
  const createdAppIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    const team = await createTestTeam();
    teamId = team.id;
  });

  afterAll(async () => {
    for (const id of createdAppIds) {
      await cleanupApp(id);
    }
    await cleanupTeam(teamId);
    await app.close();
  });

  it("GET /apps returns a list including a seeded app", async () => {
    const seeded = await createTestApp(teamId);
    createdAppIds.push(seeded.id);

    const response = await app.inject({ method: "GET", url: "/apps" });
    expect(response.statusCode).toBe(200);

    const body = response.json() as { apps: Array<{ id: string }> };
    expect(body.apps.some((a) => a.id === seeded.id)).toBe(true);
  });

  it("POST /apps creates an app", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/apps",
      payload: {
        name: "Widget Factory",
        teamId,
        subdomain: "widget-factory.apps.internal.co",
        repoUrl: "https://github.com/acme/widget-factory",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { app: { id: string; slug: string; name: string } };
    expect(body.app.name).toBe("Widget Factory");
    expect(body.app.slug).toBe("widget-factory");
    createdAppIds.push(body.app.id);
  });

  it("POST /apps returns 422 for an invalid body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/apps",
      payload: { name: "", teamId: "not-a-uuid" },
    });

    expect(response.statusCode).toBe(422);
  });

  it("GET /apps/:id returns a single app", async () => {
    const seeded = await createTestApp(teamId);
    createdAppIds.push(seeded.id);

    const response = await app.inject({ method: "GET", url: `/apps/${seeded.id}` });
    expect(response.statusCode).toBe(200);

    const body = response.json() as { app: { id: string } };
    expect(body.app.id).toBe(seeded.id);
  });

  it("GET /apps/:id returns 404 for an unknown id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/apps/00000000-0000-0000-0000-000000000000",
    });
    expect(response.statusCode).toBe(404);
  });

  it("PATCH /apps/:id updates fields", async () => {
    const seeded = await createTestApp(teamId);
    createdAppIds.push(seeded.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/apps/${seeded.id}`,
      payload: { name: "Renamed App" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { app: { name: string } };
    expect(body.app.name).toBe("Renamed App");
  });

  it("PATCH /apps/:id returns 404 for an unknown id", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/apps/00000000-0000-0000-0000-000000000000",
      payload: { name: "Nope" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("DELETE /apps/:id soft-deletes the app", async () => {
    const seeded = await createTestApp(teamId);
    createdAppIds.push(seeded.id);

    const deleteResponse = await app.inject({ method: "DELETE", url: `/apps/${seeded.id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const getResponse = await app.inject({ method: "GET", url: `/apps/${seeded.id}` });
    expect(getResponse.statusCode).toBe(404);
  });

  it("DELETE /apps/:id returns 404 for an unknown id", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/apps/00000000-0000-0000-0000-000000000000",
    });
    expect(response.statusCode).toBe(404);
  });
});
