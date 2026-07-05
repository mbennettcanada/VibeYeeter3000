import type { FastifyInstance } from "fastify";
import { requireSession } from "../middleware/auth.js";

export async function appsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/apps", { preHandler: requireSession }, async (_request, reply) => {
    // TODO: list apps for request.user's teams
    reply.send({ todo: true });
  });

  app.get("/apps/:id", { preHandler: requireSession }, async (_request, reply) => {
    // TODO: fetch app record + live pod status
    reply.send({ todo: true });
  });

  app.post("/apps", { preHandler: requireSession }, async (_request, reply) => {
    // TODO: provision repo from template, namespace, register app
    reply.send({ todo: true });
  });

  app.delete("/apps/:id", { preHandler: requireSession }, async (_request, reply) => {
    // TODO: deregister app, tear down namespace/infra
    reply.send({ todo: true });
  });
}
