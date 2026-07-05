import type { FastifyRequest, FastifyReply } from "fastify";
import type { User } from "@vibeyeeter/types";
import { config } from "../config.js";

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
