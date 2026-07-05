import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Must be set before app.ts (and therefore config.ts) is imported, since
// config reads these once at module-load time. Vitest isolates each test
// file's module registry (and, with the default thread pool, its own copy
// of process.env), so this doesn't leak into other test files.
process.env.DEV_AUTH_BYPASS = "false";
process.env.CF_ACCESS_TEAM_DOMAIN = "vibeyeeter.cloudflareaccess.com";
process.env.CF_ACCESS_AUD = "test-aud-tag";

const joseMocks = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => "jwks-placeholder"),
}));

vi.mock("jose", () => ({
  jwtVerify: joseMocks.jwtVerify,
  createRemoteJWKSet: joseMocks.createRemoteJWKSet,
}));

const { buildApp } = await import("../app.js");
const { db } = await import("../db/client.js");
const { users } = await import("../db/schema.js");
const { eq } = await import("drizzle-orm");

function extractSessionCookie(response: { cookies: Array<{ name: string; value: string }> }): string {
  const cookie = response.cookies.find((c) => c.name === "sessionId");
  if (!cookie) throw new Error("no session cookie set on response");
  return `sessionId=${cookie.value}`;
}

describe("auth routes (Cloudflare Access)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /auth/cf-callback redirects to the error page when no CF_Authorization cookie is present", async () => {
    const response = await app.inject({ method: "GET", url: "/auth/cf-callback" });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("http://localhost:3000/auth/error");
  });

  it("GET /auth/cf-callback redirects to the error page when the JWT fails verification", async () => {
    joseMocks.jwtVerify.mockRejectedValueOnce(new Error("invalid signature"));
    const response = await app.inject({
      method: "GET",
      url: "/auth/cf-callback",
      headers: { cookie: "CF_Authorization=bad-jwt" },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("http://localhost:3000/auth/error");
  });

  it("GET /auth/cf-callback provisions the user and sets a session cookie on success", async () => {
    joseMocks.jwtVerify.mockResolvedValueOnce({
      payload: { email: "person@acme.com", aud: "test-aud-tag" },
    });

    const response = await app.inject({
      method: "GET",
      url: "/auth/cf-callback",
      headers: { cookie: "CF_Authorization=good-jwt" },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("http://localhost:3000");

    const [user] = await db.select().from(users).where(eq(users.email, "person@acme.com")).limit(1);
    expect(user).toBeDefined();
    expect(user?.isAdmin).toBe(false);
    expect(user?.lastLoginAt).not.toBeNull();

    const cookie = extractSessionCookie(response);
    const protectedResponse = await app.inject({
      method: "GET",
      url: "/apps",
      headers: { cookie },
    });
    expect(protectedResponse.statusCode).toBe(200);

    await db.delete(users).where(eq(users.id, user!.id));
  });

  it("GET /apps returns 401 without a session", async () => {
    const response = await app.inject({ method: "GET", url: "/apps" });
    expect(response.statusCode).toBe(401);
  });
});
