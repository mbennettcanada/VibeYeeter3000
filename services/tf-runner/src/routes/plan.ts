import type { FastifyInstance } from "fastify";

export async function planRoute(app: FastifyInstance): Promise<void> {
  app.post("/plan", async (_request, reply) => {
    // TODO: clone repo, run `terraform plan`, stream output, store plan diff
    reply.send({ todo: true });
  });
}
