import type { FastifyInstance } from "fastify";

export async function destroyRoute(app: FastifyInstance): Promise<void> {
  app.post("/destroy", async (_request, reply) => {
    // TODO: run `terraform destroy`, stream output
    reply.send({ todo: true });
  });
}
