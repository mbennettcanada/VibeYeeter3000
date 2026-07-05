import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Profile } from "@node-saml/node-saml";

// Must be set before app.ts (and therefore config.ts) is imported, since
// config reads these once at module-load time. Vitest isolates each test
// file's module registry (and, with the default thread pool, its own copy
// of process.env), so this doesn't leak into other test files.
process.env.DEV_AUTH_BYPASS = "false";
process.env.SAML_ENTITY_ID = "https://vibeyeeter.test/saml/metadata";
process.env.SAML_IDP_SSO_URL = "https://idp.example.com/sso";
process.env.SAML_IDP_CERT = "test-idp-cert";
process.env.SAML_CALLBACK_URL = "https://vibeyeeter.test/saml/callback";
process.env.SAML_GROUPS_ATTRIBUTE = "memberOf";

const samlMocks = vi.hoisted(() => ({
  generateServiceProviderMetadata: vi.fn(() => "<EntityDescriptor/>"),
  getAuthorizeUrlAsync: vi.fn(async () => "https://idp.example.com/sso?SAMLRequest=abc"),
  validatePostResponseAsync: vi.fn(
    async (): Promise<{ profile: Profile | null; loggedOut: boolean }> => ({
      profile: null,
      loggedOut: false,
    }),
  ),
}));

vi.mock("../lib/saml-client.js", () => ({
  getSamlClient: () => samlMocks,
}));

const { buildApp } = await import("../app.js");
const { db } = await import("../db/client.js");
const { users, teamMembers, teamExternalGroups } = await import("../db/schema.js");
const { eq } = await import("drizzle-orm");
const { createTestTeam, cleanupTeam } = await import("../test-utils/fixtures.js");

function extractSessionCookie(response: { cookies: Array<{ name: string; value: string }> }): string {
  const cookie = response.cookies.find((c) => c.name === "sessionId");
  if (!cookie) throw new Error("no session cookie set on response");
  return `sessionId=${cookie.value}`;
}

describe("saml routes (configured)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let teamId: string;

  beforeAll(async () => {
    app = await buildApp();
    const team = await createTestTeam();
    teamId = team.id;
    await db.insert(teamExternalGroups).values({ teamId, externalGroupId: "eng-group" });
  });

  afterAll(async () => {
    await db.delete(teamExternalGroups).where(eq(teamExternalGroups.teamId, teamId));
    await cleanupTeam(teamId);
    await app.close();
  });

  it("GET /saml/metadata returns SP metadata XML", async () => {
    const response = await app.inject({ method: "GET", url: "/saml/metadata" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/xml/);
    expect(response.body).toBe("<EntityDescriptor/>");
  });

  it("GET /saml/login redirects to the IdP SSO URL", async () => {
    const response = await app.inject({ method: "GET", url: "/saml/login" });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("https://idp.example.com/sso?SAMLRequest=abc");
  });

  it("POST /saml/callback returns 401 when the response has no usable assertion", async () => {
    samlMocks.validatePostResponseAsync.mockResolvedValueOnce({ profile: null, loggedOut: false });
    const response = await app.inject({ method: "POST", url: "/saml/callback", payload: {} });
    expect(response.statusCode).toBe(401);
  });

  it("POST /saml/callback provisions the user, syncs team membership, and sets a session cookie", async () => {
    samlMocks.validatePostResponseAsync.mockResolvedValueOnce({
      profile: {
        issuer: "https://idp.example.com",
        nameID: "person@acme.com",
        email: "person@acme.com",
        nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        memberOf: "eng-group",
      },
      loggedOut: false,
    });

    const response = await app.inject({ method: "POST", url: "/saml/callback", payload: {} });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("http://localhost:3000");

    const [user] = await db.select().from(users).where(eq(users.email, "person@acme.com")).limit(1);
    expect(user).toBeDefined();
    expect(user?.isAdmin).toBe(false);

    const [membership] = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.userId, user!.id))
      .limit(1);
    expect(membership?.teamId).toBe(teamId);

    const cookie = extractSessionCookie(response);
    const protectedResponse = await app.inject({
      method: "GET",
      url: "/apps",
      headers: { cookie },
    });
    expect(protectedResponse.statusCode).toBe(200);

    await db.delete(teamMembers).where(eq(teamMembers.userId, user!.id));
    await db.delete(users).where(eq(users.id, user!.id));
  });

  it("GET /apps returns 401 without a session", async () => {
    const response = await app.inject({ method: "GET", url: "/apps" });
    expect(response.statusCode).toBe(401);
  });

  it("POST /saml/logout destroys the session so subsequent requests are unauthenticated", async () => {
    samlMocks.validatePostResponseAsync.mockResolvedValueOnce({
      profile: {
        issuer: "https://idp.example.com",
        nameID: "logout-test@acme.com",
        email: "logout-test@acme.com",
        nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      },
      loggedOut: false,
    });
    const loginResponse = await app.inject({ method: "POST", url: "/saml/callback", payload: {} });
    const cookie = extractSessionCookie(loginResponse);

    const logoutResponse = await app.inject({ method: "POST", url: "/saml/logout", headers: { cookie } });
    expect(logoutResponse.statusCode).toBe(302);
    expect(logoutResponse.headers.location).toBe("http://localhost:3000");

    const afterLogout = await app.inject({ method: "GET", url: "/apps", headers: { cookie } });
    expect(afterLogout.statusCode).toBe(401);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, "logout-test@acme.com"))
      .limit(1);
    if (user) {
      await db.delete(users).where(eq(users.id, user.id));
    }
  });
});
