import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { appDomains } from "../../db/schema.js";
import { createTestTeam, createTestApp, cleanupApp, cleanupTeam } from "../../test-utils/fixtures.js";

const { buildApp } = await import("../../app.js");

describe("domains routes", () => {
  let app: FastifyInstance;
  let teamId: string;
  let appId: string;
  const createdDomainIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    const team = await createTestTeam();
    teamId = team.id;
    const testApp = await createTestApp(teamId);
    appId = testApp.id;
  });

  afterAll(async () => {
    for (const id of createdDomainIds) {
      await db.delete(appDomains).where(eq(appDomains.id, id));
    }
    await cleanupApp(appId);
    await cleanupTeam(teamId);
    await app.close();
  });

  it("POST /apps/:id/domains creates a domain in pending status when Cloudflare DNS isn't configured", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/apps/${appId}/domains`,
      payload: { hostname: "example-test-app.internal.co" },
    });
    expect(response.statusCode).toBe(201);

    const body = response.json() as { domain: { id: string; hostname: string; dnsStatus: string } };
    expect(body.domain.hostname).toBe("example-test-app.internal.co");
    expect(body.domain.dnsStatus).toBe("pending");
    createdDomainIds.push(body.domain.id);
  });

  it("POST /apps/:id/domains rejects an invalid hostname", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/apps/${appId}/domains`,
      payload: { hostname: "not a hostname!" },
    });
    expect(response.statusCode).toBe(422);
  });

  it("POST /apps/:id/domains rejects a duplicate hostname", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/apps/${appId}/domains`,
      payload: { hostname: "example-test-app.internal.co" },
    });
    expect(response.statusCode).toBe(422);
  });

  it("GET /apps/:id/domains lists domains for the app", async () => {
    const response = await app.inject({ method: "GET", url: `/apps/${appId}/domains` });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { domains: Array<{ hostname: string }> };
    expect(body.domains.some((d) => d.hostname === "example-test-app.internal.co")).toBe(true);
  });

  it("GET /settings/domains lists domains across all apps with the app name", async () => {
    const response = await app.inject({ method: "GET", url: "/settings/domains" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { domains: Array<{ hostname: string; appName: string }> };
    const found = body.domains.find((d) => d.hostname === "example-test-app.internal.co");
    expect(found).toBeDefined();
    expect(found?.appName).toBeDefined();
  });

  it("DELETE /apps/:id/domains/:domainId removes the domain", async () => {
    const domainId = createdDomainIds[0]!;
    const response = await app.inject({
      method: "DELETE",
      url: `/apps/${appId}/domains/${domainId}`,
    });
    expect(response.statusCode).toBe(204);

    const [row] = await db.select().from(appDomains).where(eq(appDomains.id, domainId)).limit(1);
    expect(row).toBeUndefined();
    createdDomainIds.pop();
  });

  it("POST /apps/:id/domains 404s for an unknown app", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/apps/00000000-0000-0000-0000-000000000000/domains",
      payload: { hostname: "orphan-test.internal.co" },
    });
    expect(response.statusCode).toBe(404);
  });
});
