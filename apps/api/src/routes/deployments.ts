import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { apps, deployments } from "../db/schema.js";
import { requireSession } from "../middleware/auth.js";
import { applyDeployment, isKubernetesConfigured, rollbackDeployment } from "../services/kubernetes.js";

async function findActiveApp(id: string) {
  const [app] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, id), isNull(apps.deletedAt)))
    .limit(1);
  return app;
}

function serializeDeployment(row: typeof deployments.$inferSelect) {
  return {
    id: row.id,
    appId: row.appId,
    imageTag: row.imageTag,
    status: row.status,
    triggeredBy: row.triggeredBy,
    createdAt: row.createdAt.toISOString(),
    duration: row.duration,
  };
}

const createDeploymentSchema = z.object({
  imageTag: z.string().trim().min(1),
});

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

    reply.send({ deployments: rows.map(serializeDeployment) });
  });

  // The main "deploy" trigger: applies the Deployment manifest for the given
  // image tag and records the attempt as a deployment row.
  app.post("/apps/:id/deployments", { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existingApp = await findActiveApp(id);
    if (!existingApp) {
      reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
      return;
    }

    const parsed = createDeploymentSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
      return;
    }
    const { imageTag } = parsed.data;
    const triggeredBy = request.user?.email ?? "unknown";

    const warnings: string[] = [];

    if (!isKubernetesConfigured()) {
      warnings.push("Kubernetes is not configured — skipped applying the deployment manifest.");
    } else {
      try {
        await applyDeployment(id, imageTag);
      } catch (error) {
        request.log.error(error);
        reply.code(502).send({
          error: "upstream_error",
          detail: `Failed to apply deployment: ${error instanceof Error ? error.message : "unknown error"}`,
        });
        return;
      }
    }

    try {
      const [created] = await db
        .insert(deployments)
        .values({ appId: id, imageTag, status: "running", triggeredBy })
        .returning();

      if (!created) {
        throw new Error("insert returned no row");
      }

      reply.code(201).send({
        deployment: serializeDeployment(created),
        ...(warnings.length > 0 ? { warnings } : {}),
      });
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: "internal_error" });
    }
  });

  app.post(
    "/apps/:id/deployments/:deploymentId/rollback",
    { preHandler: requireSession },
    async (request, reply) => {
      const { id, deploymentId } = request.params as { id: string; deploymentId: string };

      const existingApp = await findActiveApp(id);
      if (!existingApp) {
        reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
        return;
      }

      const [target] = await db
        .select()
        .from(deployments)
        .where(and(eq(deployments.id, deploymentId), eq(deployments.appId, id)))
        .limit(1);
      if (!target) {
        reply.code(404).send({ error: "not_found", detail: `No deployment with id ${deploymentId}` });
        return;
      }

      const triggeredBy = request.user?.email ?? "unknown";
      const warnings: string[] = [];

      if (!isKubernetesConfigured()) {
        warnings.push("Kubernetes is not configured — skipped applying the rollback.");
      } else {
        try {
          await rollbackDeployment(id, target.imageTag);
        } catch (error) {
          request.log.error(error);
          reply.code(502).send({
            error: "upstream_error",
            detail: `Failed to roll back deployment: ${error instanceof Error ? error.message : "unknown error"}`,
          });
          return;
        }
      }

      try {
        const [created] = await db
          .insert(deployments)
          .values({ appId: id, imageTag: target.imageTag, status: "rolled_back", triggeredBy })
          .returning();

        if (!created) {
          throw new Error("insert returned no row");
        }

        reply.send({
          deployment: serializeDeployment(created),
          ...(warnings.length > 0 ? { warnings } : {}),
        });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "internal_error" });
      }
    },
  );
}
