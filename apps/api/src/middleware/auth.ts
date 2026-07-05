import type { FastifyRequest, FastifyReply } from "fastify";
import type { User } from "@vibeyeeter/types";
import { config } from "../config.js";

declare module "fastify" {
  interface FastifyRequest {
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

  // TODO: validate session cookie, load user + team memberships, attach to request.user
  const session = request.session as { userId?: string } | undefined;

  if (!session?.userId) {
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user?.isAdmin) {
    reply.code(403).send({ error: "unauthorized" });
    return;
  }
}
