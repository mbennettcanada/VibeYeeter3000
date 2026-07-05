import type { FastifyRequest, FastifyReply } from "fastify";
import type { User } from "@vibeyeeter/types";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
}

export async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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
