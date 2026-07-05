import type { FastifyInstance } from "fastify";

export async function webhooksRoutes(app: FastifyInstance): Promise<void> {
  app.post("/webhooks/github", async (_request, reply) => {
    // TODO: verify GitHub webhook signature, dispatch to @vibeyeeter/github-app handlers
    reply.send({ todo: true });
  });
}
