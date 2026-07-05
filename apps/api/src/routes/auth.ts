import type { FastifyInstance } from "fastify";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { config, hasCfAccessConfig } from "../config.js";

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedTeamDomain: string | undefined;

// Cached per team domain since createRemoteJWKSet keeps its own key cache —
// rebuilding it on every request would defeat that caching.
function getJwks() {
  if (!cachedJwks || cachedTeamDomain !== config.cfAccess.teamDomain) {
    cachedTeamDomain = config.cfAccess.teamDomain;
    cachedJwks = createRemoteJWKSet(
      new URL(`https://${config.cfAccess.teamDomain}/cdn-cgi/access/certs`),
    );
  }
  return cachedJwks;
}

async function upsertUser(email: string) {
  const now = new Date();
  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    [user] = await db.insert(users).values({ email, lastLoginAt: now }).returning();
  } else {
    [user] = await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id)).returning();
  }
  if (!user) {
    throw new Error("failed to create or load user");
  }
  return user;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/auth/cf-callback", async (request, reply) => {
    if (!hasCfAccessConfig) {
      reply.code(503).send({ error: "not_configured", detail: "Cloudflare Access is not configured" });
      return;
    }

    const token = request.cookies["CF_Authorization"];
    if (!token) {
      reply.redirect(`${config.webAppUrl}/auth/error`);
      return;
    }

    try {
      const { payload } = await jwtVerify(token, getJwks(), {
        issuer: `https://${config.cfAccess.teamDomain}`,
        audience: config.cfAccess.aud,
      });

      const email = typeof payload.email === "string" ? payload.email : undefined;
      if (!email) {
        reply.redirect(`${config.webAppUrl}/auth/error`);
        return;
      }

      const user = await upsertUser(email);

      request.session.user = {
        id: user.id,
        email: user.email,
        teams: [],
        isAdmin: user.isAdmin,
      };
      await request.session.save();

      reply.redirect(config.webAppUrl);
    } catch (error) {
      request.log.error(error);
      reply.redirect(`${config.webAppUrl}/auth/error`);
    }
  });
}
