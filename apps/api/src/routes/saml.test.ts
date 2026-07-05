import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";

// This file intentionally does not set SAML_* env vars, so hasSamlConfig is
// false here — exercising the "SAML isn't configured" degrade path. See
// saml-configured.test.ts for the fully-configured happy path.
describe("saml routes (unconfigured)", () => {
  it("GET /saml/metadata returns 503 when SAML is not configured", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/saml/metadata" });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("GET /saml/login returns 503 when SAML is not configured", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/saml/login" });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("POST /saml/callback returns 503 when SAML is not configured", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/saml/callback", payload: {} });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("POST /saml/logout destroys the session and redirects even when SAML is not configured", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/saml/logout" });
    expect(response.statusCode).toBe(302);
    await app.close();
  });
});
