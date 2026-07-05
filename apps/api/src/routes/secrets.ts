import type { FastifyInstance } from "fastify";
import { requireSession } from "../middleware/auth.js";

export async function secretsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/apps/:id/secrets", { preHandler: requireSession }, async (_request, reply) => {
    // TODO: return secret key names only, never values
    reply.send({ todo: true });
  });

  app.put("/apps/:id/secrets/:key", { preHandler: requireSession }, async (_request, reply) => {
    // TODO: write secret value to Secrets Manager, never echo it back
    reply.send({ todo: true });
  });

  app.delete("/apps/:id/secrets/:key", { preHandler: requireSession }, async (_request, reply) => {
    // TODO: delete secret from Secrets Manager
    reply.send({ todo: true });
  });
}
