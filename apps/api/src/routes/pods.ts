import type { FastifyInstance } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { apps } from "../db/schema.js";
import { requireSession } from "../middleware/auth.js";
import { getPodLogs, isKubernetesConfigured, listPods } from "../services/kubernetes.js";

async function findActiveApp(id: string) {
  const [app] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, id), isNull(apps.deletedAt)))
    .limit(1);
  return app;
}

export async function podsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/apps/:id/pods", { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findActiveApp(id);
    if (!existing) {
      reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
      return;
    }

    if (!isKubernetesConfigured()) {
      reply.send({ pods: [] });
      return;
    }

    try {
      const pods = await listPods(id);
      reply.send({ pods });
    } catch (error) {
      request.log.error(error);
      reply.code(502).send({
        error: "upstream_error",
        detail: `Failed to list pods: ${error instanceof Error ? error.message : "unknown error"}`,
      });
    }
  });

  app.get(
    "/apps/:id/pods/:podName/logs",
    { preHandler: requireSession },
    async (request, reply) => {
      const { id, podName } = request.params as { id: string; podName: string };
      const { lines } = request.query as { lines?: string };

      const existing = await findActiveApp(id);
      if (!existing) {
        reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
        return;
      }

      if (!isKubernetesConfigured()) {
        reply.send({ logs: "" });
        return;
      }

      try {
        const logs = await getPodLogs(id, podName, lines ? Number(lines) : undefined);
        reply.send({ logs });
      } catch (error) {
        request.log.error(error);
        reply.code(502).send({
          error: "upstream_error",
          detail: `Failed to fetch pod logs: ${error instanceof Error ? error.message : "unknown error"}`,
        });
      }
    },
  );
}
