import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sign } from "@octokit/webhooks-methods";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { db as Db } from "../db/client.js";
import type { deployments as Deployments } from "../db/schema.js";
import type * as Fixtures from "../test-utils/fixtures.js";

const SECRET = "test-webhook-secret";

describe("POST /webhooks/github", () => {
  let app: FastifyInstance;
  let db: typeof Db;
  let deployments: typeof Deployments;
  let fixtures: typeof Fixtures;
  let teamId: string;
  let appId: string;
  let repoUrl: string;

  beforeAll(async () => {
    // GITHUB_WEBHOOK_SECRET must be set before config.js (and anything that
    // transitively imports it, including db/client.js) is first evaluated —
    // so every import that touches config.js happens dynamically here,
    // after the env var is set, rather than as a static top-level import.
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;

    const { buildApp } = await import("../app.js");
    const dbModule = await import("../db/client.js");
    const schema = await import("../db/schema.js");
    fixtures = await import("../test-utils/fixtures.js");

    db = dbModule.db;
    deployments = schema.deployments;
    app = await buildApp();

    const team = await fixtures.createTestTeam();
    teamId = team.id;
    const seeded = await fixtures.createTestApp(teamId);
    appId = seeded.id;
    repoUrl = seeded.repoUrl;
  });

  afterAll(async () => {
    await fixtures.cleanupApp(appId);
    await fixtures.cleanupTeam(teamId);
    await app.close();
  });

  it("returns 401 when the signature header is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "x-github-event": "push",
        "x-github-delivery": "test-delivery-1",
      },
      payload: { ref: "refs/heads/main" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 401 when the signature is invalid", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "x-github-event": "push",
        "x-github-delivery": "test-delivery-2",
        "x-hub-signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      },
      payload: { ref: "refs/heads/main" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("creates a deployment row on a push to the default branch", async () => {
    const payload = {
      ref: "refs/heads/main",
      after: "abc1234567890",
      repository: { full_name: "acme/test-app", html_url: repoUrl, default_branch: "main" },
      pusher: { name: "octocat", email: "octocat@example.com" },
    };
    const body = JSON.stringify(payload);
    const signature = await sign(SECRET, body);

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-github-delivery": "test-delivery-3",
        "x-hub-signature-256": signature,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);

    const rows = await db.select().from(deployments).where(eq(deployments.appId, appId));
    expect(rows.some((row) => row.imageTag === "abc1234")).toBe(true);
  });

  it("ignores a push to a non-default branch", async () => {
    const payload = {
      ref: "refs/heads/feature-branch",
      after: "def4567890123",
      repository: { full_name: "acme/test-app", html_url: repoUrl, default_branch: "main" },
      pusher: { name: "octocat", email: "octocat@example.com" },
    };
    const body = JSON.stringify(payload);
    const signature = await sign(SECRET, body);

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-github-delivery": "test-delivery-4",
        "x-hub-signature-256": signature,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);

    const rows = await db.select().from(deployments).where(eq(deployments.appId, appId));
    expect(rows.some((row) => row.imageTag === "def4567")).toBe(false);
  });
});
