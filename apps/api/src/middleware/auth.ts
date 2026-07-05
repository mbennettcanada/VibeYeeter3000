import type { FastifyRequest, FastifyReply } from "fastify";
import type { User } from "@vibeyeeter/types";
import { and, eq, isNull } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { platformTokens } from "../db/schema.js";
import { hashApiToken } from "../lib/tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
  interface Session {
    user?: User;
  }
}

const DEV_BYPASS_USER: User = {
  id: "local",
  email: "dev@local",
  teams: ["dev"],
  isAdmin: true,
};

export async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (config.devAuthBypass) {
    request.user = DEV_BYPASS_USER;
    return;
  }

  // The SAML callback (routes/saml.ts) is what populates session.user on
  // successful SSO login — this middleware just checks it's still there.
  const user = request.session.user;
  if (!user) {
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }

  request.user = user;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user?.isAdmin) {
    reply.code(403).send({ error: "unauthorized" });
    return;
  }
}

// For machine callers (e.g. CI) that authenticate with a platform token
// instead of a session cookie. Populates request.user with a synthetic
// identity so downstream handlers (e.g. deployments.triggeredBy) still have
// something to record.
export async function requireToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }

  if (config.legacyApiToken && token === config.legacyApiToken) {
    request.log.warn(
      "Request authenticated via deprecated VIBEYEETER_API_TOKEN env var — issue a token from /settings/tokens instead.",
    );
    request.user = { id: "legacy-token", email: "legacy-api-token", teams: [], isAdmin: true };
    return;
  }

  const tokenHash = hashApiToken(token);
  const now = new Date();
  const [row] = await db
    .select()
    .from(platformTokens)
    .where(and(eq(platformTokens.tokenHash, tokenHash), isNull(platformTokens.revokedAt)))
    .limit(1);

  if (!row || (row.expiresAt && row.expiresAt < now)) {
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }

  await db.update(platformTokens).set({ lastUsedAt: now }).where(eq(platformTokens.id, row.id));

  request.user = { id: `token:${row.id}`, email: `api-token:${row.name}`, teams: [], isAdmin: true };
}

// Accepts either a browser session or a bearer token — used by routes that
// both the web dashboard and machine callers (e.g. CI pipelines) hit.
export async function requireSessionOrToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (config.devAuthBypass) {
    request.user = DEV_BYPASS_USER;
    return;
  }

  if (request.session.user) {
    request.user = request.session.user;
    return;
  }

  await requireToken(request, reply);
}
