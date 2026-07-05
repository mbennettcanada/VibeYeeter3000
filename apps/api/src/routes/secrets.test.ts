import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { createTestTeam, createTestApp, cleanupApp, cleanupTeam } from "../test-utils/fixtures.js";
import type { FastifyInstance } from "fastify";

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
