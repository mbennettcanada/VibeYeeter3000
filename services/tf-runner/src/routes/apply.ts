import type { FastifyInstance } from "fastify";

export async function applyRoute(app: FastifyInstance): Promise<void> {
  app.post("/apply", async (_request, reply) => {
    // TODO: require a prior plan approval record, run `terraform apply`, stream output
    reply.send({ todo: true });
  });
}
