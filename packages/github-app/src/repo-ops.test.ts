import { generateKeyPairSync } from "node:crypto";
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { resetOctokitCache } from "./client.js";
import {
  createRepo,
  pushFile,
  openPR,
  createDeployment,
  updateDeploymentStatus,
} from "./repo-ops.js";

const server = setupServer();

beforeAll(() => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  process.env.GITHUB_APP_ID = "123";
  process.env.GITHUB_APP_PRIVATE_KEY = Buffer.from(privateKey).toString("base64");
  process.env.GITHUB_APP_INSTALLATION_ID = "456";

  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetOctokitCache();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

const installationAuthHandler = http.post(
  "https://api.github.com/app/installations/456/access_tokens",
  () =>
    HttpResponse.json(
      { token: "test-installation-token", expires_at: new Date(Date.now() + 60_000).toISOString() },
      { status: 200 },
    ),
);

describe("createRepo", () => {
  it("creates a private repo in the org", async () => {
    server.use(
      installationAuthHandler,
      http.post("https://api.github.com/orgs/acme/repos", async ({ request }) => {
        const body = (await request.json()) as { name: string; private: boolean };
        expect(body.name).toBe("widget-factory");
        expect(body.private).toBe(true);
        return HttpResponse.json(
          {
            name: "widget-factory",
            full_name: "acme/widget-factory",
            html_url: "https://github.com/acme/widget-factory",
            default_branch: "main",
          },
          { status: 201 },
        );
      }),
    );

    const result = await createRepo("widget-factory", "acme");

    expect(result).toEqual({
      name: "widget-factory",
      fullName: "acme/widget-factory",
      htmlUrl: "https://github.com/acme/widget-factory",
      defaultBranch: "main",
    });
  });
});

describe("pushFile", () => {
  it("creates a new file when none exists yet", async () => {
    server.use(
      installationAuthHandler,
      http.get("https://api.github.com/repos/acme/widget-factory/contents/CLAUDE.md", () =>
        HttpResponse.json({ message: "Not Found" }, { status: 404 }),
      ),
      http.put(
        "https://api.github.com/repos/acme/widget-factory/contents/CLAUDE.md",
        async ({ request }) => {
          const body = (await request.json()) as { sha?: string };
          expect(body.sha).toBeUndefined();
          return HttpResponse.json({}, { status: 201 });
        },
      ),
    );

    await expect(
      pushFile("acme/widget-factory", "CLAUDE.md", "# Widget Factory", "chore: add CLAUDE.md"),
    ).resolves.toBeUndefined();
  });

  it("updates an existing file using its sha", async () => {
    server.use(
      installationAuthHandler,
      http.get("https://api.github.com/repos/acme/widget-factory/contents/CLAUDE.md", () =>
        HttpResponse.json({ type: "file", sha: "abc123" }, { status: 200 }),
      ),
      http.put(
        "https://api.github.com/repos/acme/widget-factory/contents/CLAUDE.md",
        async ({ request }) => {
          const body = (await request.json()) as { sha?: string };
          expect(body.sha).toBe("abc123");
          return HttpResponse.json({}, { status: 200 });
        },
      ),
    );

    await expect(
      pushFile("acme/widget-factory", "CLAUDE.md", "# Widget Factory v2", "chore: update CLAUDE.md"),
    ).resolves.toBeUndefined();
  });
});

describe("openPR", () => {
  it("opens a pull request", async () => {
    server.use(
      installationAuthHandler,
      http.post("https://api.github.com/repos/acme/widget-factory/pulls", () =>
        HttpResponse.json(
          { number: 7, html_url: "https://github.com/acme/widget-factory/pull/7" },
          { status: 201 },
        ),
      ),
    );

    const result = await openPR("acme/widget-factory", "Add feature", "body", "feature", "main");

    expect(result).toEqual({ number: 7, htmlUrl: "https://github.com/acme/widget-factory/pull/7" });
  });
});

describe("createDeployment", () => {
  it("creates a deployment and returns its id", async () => {
    server.use(
      installationAuthHandler,
      http.post("https://api.github.com/repos/acme/widget-factory/deployments", () =>
        HttpResponse.json({ id: 999 }, { status: 201 }),
      ),
    );

    const result = await createDeployment("acme/widget-factory", "main", "production");

    expect(result).toEqual({ id: 999 });
  });
});

describe("updateDeploymentStatus", () => {
  it("posts a deployment status", async () => {
    server.use(
      installationAuthHandler,
      http.post(
        "https://api.github.com/repos/acme/widget-factory/deployments/999/statuses",
        async ({ request }) => {
          const body = (await request.json()) as { state: string };
          expect(body.state).toBe("success");
          return HttpResponse.json({}, { status: 201 });
        },
      ),
    );

    await expect(
      updateDeploymentStatus("acme/widget-factory", 999, "success", "https://logs.example.com/999"),
    ).resolves.toBeUndefined();
  });
});
