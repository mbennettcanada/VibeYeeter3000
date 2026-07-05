import type { FastifyInstance } from "fastify";
import { requireSession } from "../middleware/auth.js";

export async function deploymentsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/apps/:id/deployments", { preHandler: requireSession }, async (_request, reply) => {
    // TODO: list deployment history for app
    reply.send({ todo: true });
  });

  app.post(
    "/apps/:id/deployments/:deploymentId/rollback",
    { preHandler: requireSession },
    async (_request, reply) => {
      // TODO: trigger rollback to a prior image tag
      reply.send({ todo: true });
    },
  );
}
