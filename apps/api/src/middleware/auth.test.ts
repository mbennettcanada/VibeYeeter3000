import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { platformTokens } from "../db/schema.js";
import { requireToken } from "./auth.js";

// requireToken doesn't consult config.devAuthBypass (only
// requireSessionOrToken does) so it's safe to test directly even with the
// local dev DEV_AUTH_BYPASS=true env in play — this exercises the actual
// bearer-token verification path in isolation.

function fakeRequest(authorization?: string): FastifyRequest {
  return {
    headers: authorization ? { authorization } : {},
    log: { warn: () => undefined },
  } as unknown as FastifyRequest;
}

function fakeReply(): FastifyReply & { statusCode?: number; body?: unknown } {
  const reply = {
    code(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(body: unknown) {
      reply.body = body;
      return reply;
    },
  } as FastifyReply & { statusCode?: number; body?: unknown };
  return reply;
}

describe("requireToken", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(platformTokens).where(eq(platformTokens.id, id));
    }
  });

  it("rejects a request with no Authorization header", async () => {
    const request = fakeRequest();
    const reply = fakeReply();
    await requireToken(request, reply);
    expect(reply.statusCode).toBe(401);
  });

  it("rejects an unknown bearer token", async () => {
    const request = fakeRequest("Bearer vyt_not-a-real-token");
    const reply = fakeReply();
    await requireToken(request, reply);
    expect(reply.statusCode).toBe(401);
  });

  it("accepts a valid, non-revoked token and updates lastUsedAt", async () => {
    const { generateApiToken } = await import("../lib/tokens.js");
    const { token, prefix, hash } = generateApiToken();
    const [row] = await db
      .insert(platformTokens)
      .values({ name: "test token", tokenHash: hash, tokenPrefix: prefix })
      .returning();
    createdIds.push(row!.id);

    const request = fakeRequest(`Bearer ${token}`);
    const reply = fakeReply();
    await requireToken(request, reply);

    expect(reply.statusCode).toBeUndefined();
    expect(request.user?.email).toBe("api-token:test token");

    const [updated] = await db.select().from(platformTokens).where(eq(platformTokens.id, row!.id));
    expect(updated?.lastUsedAt).not.toBeNull();
  });

  it("rejects a revoked token", async () => {
    const { generateApiToken } = await import("../lib/tokens.js");
    const { token, prefix, hash } = generateApiToken();
    const [row] = await db
      .insert(platformTokens)
      .values({
        name: "revoked token",
        tokenHash: hash,
        tokenPrefix: prefix,
        revokedAt: new Date(),
      })
      .returning();
    createdIds.push(row!.id);

    const request = fakeRequest(`Bearer ${token}`);
    const reply = fakeReply();
    await requireToken(request, reply);
    expect(reply.statusCode).toBe(401);
  });

  it("rejects an expired token", async () => {
    const { generateApiToken } = await import("../lib/tokens.js");
    const { token, prefix, hash } = generateApiToken();
    const [row] = await db
      .insert(platformTokens)
      .values({
        name: "expired token",
        tokenHash: hash,
        tokenPrefix: prefix,
        expiresAt: new Date(Date.now() - 1000 * 60 * 60),
      })
      .returning();
    createdIds.push(row!.id);

    const request = fakeRequest(`Bearer ${token}`);
    const reply = fakeReply();
    await requireToken(request, reply);
    expect(reply.statusCode).toBe(401);
  });
});
