import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { apps, tfRuns } from "../db/schema.js";
import { requireSession } from "../middleware/auth.js";

async function findActiveApp(id: string) {
  const [app] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, id), isNull(apps.deletedAt)))
    .limit(1);
  return app;
}

export async function terraformRoutes(app: FastifyInstance): Promise<void> {
  app.get("/apps/:id/terraform", { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findActiveApp(id);
    if (!existing) {
      reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
      return;
    }

    const rows = await db
      .select()
      .from(tfRuns)
      .where(eq(tfRuns.appId, id))
      .orderBy(desc(tfRuns.createdAt));

    reply.send({
      runs: rows.map((row) => ({
        id: row.id,
        appId: row.appId,
        type: row.type,
        status: row.status,
        planDiff: row.planDiff,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  app.post("/apps/:id/terraform", { preHandler: requireSession }, async (_request, reply) => {
    // TODO: trigger a plan/apply/destroy via tf-runner; require prior plan approval for apply
    reply.send({ todo: true });
  });
}
