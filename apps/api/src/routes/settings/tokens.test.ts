import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { platformTokens } from "../../db/schema.js";
import type { FastifyInstance } from "fastify";

const { buildApp } = await import("../../app.js");

describe("settings/tokens routes", () => {
  let app: FastifyInstance;
  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(platformTokens).where(eq(platformTokens.id, id));
    }
    await app.close();
  });

  it("POST /settings/tokens generates a token and returns the plaintext once", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/settings/tokens",
      payload: { name: "CI pipeline" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { token: { id: string; token: string; tokenPrefix: string; status: string } };
    expect(body.token.token).toMatch(/^vyt_[A-Za-z0-9]{32}$/);
    expect(body.token.tokenPrefix).toBe(body.token.token.slice(0, body.token.tokenPrefix.length));
    expect(body.token.status).toBe("active");
    createdIds.push(body.token.id);
  });

  it("POST /settings/tokens returns 422 for a blank name", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/settings/tokens",
      payload: { name: "" },
    });
    expect(response.statusCode).toBe(422);
  });

  it("GET /settings/tokens never returns the hash or plaintext", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/settings/tokens",
      payload: { name: "Listed token" },
    });
    const createBody = create.json() as { token: { id: string } };
    createdIds.push(createBody.token.id);

    const response = await app.inject({ method: "GET", url: "/settings/tokens" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { tokens: Array<Record<string, unknown>> };
    const found = body.tokens.find((t) => t.id === createBody.token.id);
    expect(found).toBeDefined();
    expect(found).not.toHaveProperty("token");
    expect(found).not.toHaveProperty("tokenHash");
  });

  it("DELETE /settings/tokens/:id revokes a token", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/settings/tokens",
      payload: { name: "To revoke" },
    });
    const createBody = create.json() as { token: { id: string } };
    createdIds.push(createBody.token.id);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/settings/tokens/${createBody.token.id}`,
    });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: "GET", url: "/settings/tokens" });
    const listBody = listResponse.json() as { tokens: Array<{ id: string; status: string }> };
    const found = listBody.tokens.find((t) => t.id === createBody.token.id);
    expect(found?.status).toBe("revoked");
  });

  it("DELETE /settings/tokens/:id returns 404 for an unknown id", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/settings/tokens/00000000-0000-0000-0000-000000000000",
    });
    expect(response.statusCode).toBe(404);
  });
});
