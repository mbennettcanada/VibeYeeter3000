import type { FastifyInstance } from "fastify";
import { requireSession } from "../middleware/auth.js";

export async function terraformRoutes(app: FastifyInstance): Promise<void> {
  app.get("/apps/:id/terraform", { preHandler: requireSession }, async (_request, reply) => {
    // TODO: list plan/apply/destroy run history for app
    reply.send({ todo: true });
  });

  app.post("/apps/:id/terraform", { preHandler: requireSession }, async (_request, reply) => {
    // TODO: trigger a plan/apply/destroy via tf-runner; require prior plan approval for apply
    reply.send({ todo: true });
  });
}
