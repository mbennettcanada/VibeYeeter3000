import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { apps, deployments } from "../db/schema.js";
import { requireSession } from "../middleware/auth.js";

async function findActiveApp(id: string) {
  const [app] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, id), isNull(apps.deletedAt)))
    .limit(1);
  return app;
}

export async function deploymentsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/apps/:id/deployments", { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findActiveApp(id);
    if (!existing) {
      reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
      return;
    }

    const rows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.appId, id))
      .orderBy(desc(deployments.createdAt));

    reply.send({
      deployments: rows.map((row) => ({
        id: row.id,
        appId: row.appId,
        imageTag: row.imageTag,
        status: row.status,
        triggeredBy: row.triggeredBy,
        createdAt: row.createdAt.toISOString(),
        duration: row.duration,
      })),
    });
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
