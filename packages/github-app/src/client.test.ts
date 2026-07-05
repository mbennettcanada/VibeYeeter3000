import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getOctokit, resetOctokitCache } from "./client.js";

const ORIGINAL_ENV = { ...process.env };

describe("getOctokit", () => {
  beforeEach(() => {
    resetOctokitCache();
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetOctokitCache();
  });

  it("throws a clear error when env vars are missing", () => {
    expect(() => getOctokit()).toThrow(/GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID/);
  });

  it("throws a clear error when the private key does not decode to a PEM", () => {
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_PRIVATE_KEY = Buffer.from("not a pem").toString("base64");
    process.env.GITHUB_APP_INSTALLATION_ID = "456";

    expect(() => getOctokit()).toThrow(/does not decode to a PEM private key/);
  });

  it("returns the same instance on repeated calls once configured", () => {
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_PRIVATE_KEY = Buffer.from(
      "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
    ).toString("base64");
    process.env.GITHUB_APP_INSTALLATION_ID = "456";

    const first = getOctokit();
    const second = getOctokit();
    expect(first).toBe(second);
  });
});
