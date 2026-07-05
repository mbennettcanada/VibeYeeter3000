import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { createRepo, pushFile, pushAppTemplates } from "@vibeyeeter/github-app";
import { db } from "../db/client.js";
import { apps, teams } from "../db/schema.js";
import { requireSession } from "../middleware/auth.js";
import { slugify } from "../lib/slug.js";
import { config, hasGithubAppConfig } from "../config.js";
import { parseGithubRepoUrl } from "../lib/github-url.js";
import { renderClaudeMdTemplate } from "../lib/claude-md-template.js";
import {
  isKubernetesConfigured,
  ensureNamespace,
  ensureService,
  ensureIngress,
  deleteNamespace,
  listPods,
} from "../services/kubernetes.js";

const createAppSchema = z.object({
  name: z.string().trim().min(1).max(100),
  teamId: z.string().uuid(),
  subdomain: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/, "must be a valid subdomain"),
  repoUrl: z.string().trim().url(),
});

const updateAppSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    subdomain: z
      .string()
      .trim()
      .min(1)
      .max(253)
      .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/, "must be a valid subdomain"),
    repoUrl: z.string().trim().url(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "at least one field is required",
  });

export async function appsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/apps", { preHandler: requireSession }, async (_request, reply) => {
    const rows = await db
      .select()
      .from(apps)
      .innerJoin(teams, eq(apps.teamId, teams.id))
      .where(isNull(apps.deletedAt));

    reply.send({
      apps: rows.map(({ apps: appRow, teams: teamRow }) => ({
        id: appRow.id,
        name: appRow.name,
        slug: appRow.slug,
        teamId: appRow.teamId,
        repoUrl: appRow.repoUrl,
        namespace: appRow.namespace,
        subdomain: appRow.subdomain,
        createdAt: appRow.createdAt.toISOString(),
        updatedAt: appRow.updatedAt.toISOString(),
        teamName: teamRow.name,
      })),
    });
  });

  app.get("/apps/:id", { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select()
      .from(apps)
      .innerJoin(teams, eq(apps.teamId, teams.id))
      .where(and(eq(apps.id, id), isNull(apps.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
      return;
    }

    let pods: Awaited<ReturnType<typeof listPods>> = [];
    if (isKubernetesConfigured()) {
      try {
        pods = await listPods(row.apps.id);
      } catch (error) {
        request.log.error(error);
      }
    }

    reply.send({
      app: {
        id: row.apps.id,
        name: row.apps.name,
        slug: row.apps.slug,
        teamId: row.apps.teamId,
        repoUrl: row.apps.repoUrl,
        namespace: row.apps.namespace,
        subdomain: row.apps.subdomain,
        createdAt: row.apps.createdAt.toISOString(),
        updatedAt: row.apps.updatedAt.toISOString(),
        teamName: row.teams.name,
      },
      pods,
    });
  });

  app.post("/apps", { preHandler: requireSession }, async (request, reply) => {
    const parsed = createAppSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
      return;
    }
    const { name, teamId, subdomain, repoUrl } = parsed.data;

    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) {
      reply.code(422).send({ error: "validation_error", detail: `No team with id ${teamId}` });
      return;
    }

    const slug = slugify(name);

    try {
      const [created] = await db
        .insert(apps)
        .values({
          name,
          slug,
          teamId,
          repoUrl,
          namespace: slug,
          subdomain,
        })
        .returning();

      if (!created) {
        throw new Error("insert returned no row");
      }

      const warnings: string[] = [];

      if (!hasGithubAppConfig) {
        warnings.push("GitHub App is not configured — skipped repo provisioning.");
      } else {
        try {
          const { owner, repo } = parseGithubRepoUrl(repoUrl);
          await createRepo(repo, owner);
          await pushFile(
            `${owner}/${repo}`,
            "CLAUDE.md",
            renderClaudeMdTemplate(name),
            "chore: add CLAUDE.md",
          );
        } catch (error) {
          request.log.error(error);
          warnings.push(
            `GitHub repo provisioning failed: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }

        try {
          const { owner, repo } = parseGithubRepoUrl(repoUrl);
          await pushAppTemplates(
            `${owner}/${repo}`,
            owner,
            created.id,
            subdomain,
            config.platformUrl ?? config.webAppUrl,
          );
        } catch (error) {
          request.log.error(error);
          warnings.push(
            `App template provisioning failed: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }

      if (!isKubernetesConfigured()) {
        warnings.push("Kubernetes is not configured — skipped namespace/service/ingress provisioning.");
      } else {
        try {
          await ensureNamespace(created.id);
          await ensureService(created.id);
          await ensureIngress(created.id, subdomain);
        } catch (error) {
          request.log.error(error);
          warnings.push(
            `Kubernetes provisioning failed: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }

      reply.code(201).send({
        app: {
          id: created.id,
          name: created.name,
          slug: created.slug,
          teamId: created.teamId,
          repoUrl: created.repoUrl,
          namespace: created.namespace,
          subdomain: created.subdomain,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
        ...(warnings.length > 0 ? { warnings } : {}),
      });
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: "internal_error" });
    }
  });

  app.patch("/apps/:id", { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateAppSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(apps)
      .where(and(eq(apps.id, id), isNull(apps.deletedAt)))
      .limit(1);
    if (!existing) {
      reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
      return;
    }

    try {
      const [updated] = await db
        .update(apps)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(apps.id, id))
        .returning();

      if (!updated) {
        throw new Error("update returned no row");
      }

      reply.send({
        app: {
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
          teamId: updated.teamId,
          repoUrl: updated.repoUrl,
          namespace: updated.namespace,
          subdomain: updated.subdomain,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: "internal_error" });
    }
  });

  // Soft delete: sets deleted_at rather than removing the row, so deployment
  // and Terraform run history remain intact for audit purposes. Excluded
  // apps are filtered out of GET /apps and GET /apps/:id via isNull(deletedAt).
  app.delete("/apps/:id", { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(apps)
      .where(and(eq(apps.id, id), isNull(apps.deletedAt)))
      .limit(1);
    if (!existing) {
      reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
      return;
    }

    try {
      await db.update(apps).set({ deletedAt: new Date() }).where(eq(apps.id, id));

      if (isKubernetesConfigured()) {
        try {
          await deleteNamespace(id);
        } catch (error) {
          // Best-effort: the app record is already soft-deleted, and a
          // stranded namespace can be cleaned up manually — don't fail the
          // request over it.
          request.log.error(error);
        }
      }

      reply.code(204).send();
    } catch (error) {
      request.log.error(error);
      reply.code(500).send({ error: "internal_error" });
    }
  });
}
