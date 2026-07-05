import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { apps, deployments, secrets } from "../db/schema.js";
import { requireSession } from "../middleware/auth.js";
import { putSecretValue } from "../services/aws.js";
import { applyDeployment, isKubernetesConfigured } from "../services/kubernetes.js";

const createSecretSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Z0-9_]+$/, "must be SCREAMING_SNAKE_CASE"),
  value: z.string().min(1),
});

const updateSecretSchema = z.object({
  value: z.string().min(1),
});

async function findActiveApp(id: string) {
  const [app] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, id), isNull(apps.deletedAt)))
    .limit(1);
  return app;
}

export async function secretsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/apps/:id/secrets", { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findActiveApp(id);
    if (!existing) {
      reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
      return;
    }

    const rows = await db.select().from(secrets).where(eq(secrets.appId, id));

    // Keys only — never return values. See CLAUDE.md "Secrets — never log,
    // never return values" and the schema comment on the secrets table.
    reply.send({
      secrets: rows.map((row) => ({
        key: row.key,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  });

  app.post("/apps/:id/secrets", { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existingApp = await findActiveApp(id);
    if (!existingApp) {
      reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
      return;
    }

    const parsed = createSecretSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
      return;
    }
    const { key, value } = parsed.data;

    try {
      // The value is written to Secrets Manager (stubbed for now) and never
      // persisted to the platform database — only the key name is tracked
      // here so the dashboard can list/rotate/delete it.
      await putSecretValue(`${existingApp.namespace}/${key}`, value);

      const now = new Date();
      const [row] = await db
        .insert(secrets)
        .values({ appId: id, key, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [secrets.appId, secrets.key],
          set: { updatedAt: now },
        })
        .returning();

      if (!row) {
        throw new Error("insert returned no row");
      }

      reply.code(201).send({
        secret: {
          key: row.key,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: "internal_error" });
    }
  });

  app.put("/apps/:id/secrets/:key", { preHandler: requireSession }, async (request, reply) => {
    const { id, key } = request.params as { id: string; key: string };

    const existingApp = await findActiveApp(id);
    if (!existingApp) {
      reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
      return;
    }

    const [existingSecret] = await db
      .select()
      .from(secrets)
      .where(and(eq(secrets.appId, id), eq(secrets.key, key)))
      .limit(1);
    if (!existingSecret) {
      reply.code(404).send({ error: "not_found", detail: `No secret with key ${key}` });
      return;
    }

    const parsed = updateSecretSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
      return;
    }
    const { value } = parsed.data;

    try {
      await putSecretValue(`${existingApp.namespace}/${key}`, value);

      const now = new Date();
      const [row] = await db
        .update(secrets)
        .set({ updatedAt: now })
        .where(and(eq(secrets.appId, id), eq(secrets.key, key)))
        .returning();

      if (!row) {
        throw new Error("update returned no row");
      }

      // Rotating a secret's value doesn't change the pod's image, so a
      // normal re-apply wouldn't pick it up — force a rolling restart of
      // whatever image is currently running so the new value takes effect.
      const [runningDeployment] = await db
        .select()
        .from(deployments)
        .where(and(eq(deployments.appId, id), eq(deployments.status, "running")))
        .orderBy(desc(deployments.createdAt))
        .limit(1);

      let restart: { deploymentId: string } | undefined;

      if (runningDeployment && isKubernetesConfigured()) {
        await applyDeployment(id, runningDeployment.imageTag);

        const [restartRow] = await db
          .insert(deployments)
          .values({
            appId: id,
            imageTag: runningDeployment.imageTag,
            status: "running",
            type: "restart",
            triggeredBy: request.user?.email ?? "unknown",
          })
          .returning();

        if (!restartRow) {
          throw new Error("insert returned no row");
        }
        restart = { deploymentId: restartRow.id };
      }

      reply.send({
        secret: {
          key: row.key,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
        ...(restart ? { restart } : {}),
      });
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: "internal_error" });
    }
  });

  app.delete("/apps/:id/secrets/:key", { preHandler: requireSession }, async (request, reply) => {
    const { id, key } = request.params as { id: string; key: string };

    const existingApp = await findActiveApp(id);
    if (!existingApp) {
      reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
      return;
    }

    const [existingSecret] = await db
      .select()
      .from(secrets)
      .where(and(eq(secrets.appId, id), eq(secrets.key, key)))
      .limit(1);
    if (!existingSecret) {
      reply.code(404).send({ error: "not_found", detail: `No secret with key ${key}` });
      return;
    }

    try {
      // TODO: delete the value from Secrets Manager once that client exists
      await db.delete(secrets).where(and(eq(secrets.appId, id), eq(secrets.key, key)));
      reply.code(204).send();
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: "internal_error" });
    }
  });
}
