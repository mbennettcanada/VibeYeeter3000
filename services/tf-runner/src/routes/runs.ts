import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tfRuns } from "../db/schema.js";

export async function runsRoute(app: FastifyInstance): Promise<void> {
  app.get("/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };

    const [run] = await db.select().from(tfRuns).where(eq(tfRuns.id, runId)).limit(1);
    if (!run) {
      reply.code(404).send({ error: "not_found", detail: `No tf_run with id ${runId}` });
      return;
    }

    reply.send({
      run: {
        id: run.id,
        appId: run.appId,
        type: run.type,
        status: run.status,
        planDiff: run.planDiff,
        output: run.output,
        createdAt: run.createdAt.toISOString(),
      },
    });
  });
}
