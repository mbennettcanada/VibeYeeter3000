import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { appDomains, apps } from "../../db/schema.js";
import { requireAdmin, requireSession } from "../../middleware/auth.js";
import { addDomainToApp, removeDomain } from "../../lib/domains.js";

const hostnameRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

const createDomainSchema = z.object({
  hostname: z.string().trim().toLowerCase().max(253).regex(hostnameRegex, "must be a valid hostname"),
});

function serializeDomain(row: typeof appDomains.$inferSelect) {
  return {
    id: row.id,
    appId: row.appId,
    hostname: row.hostname,
    domainType: row.domainType,
    dnsStatus: row.dnsStatus,
    certStatus: row.certStatus,
    createdAt: row.createdAt.toISOString(),
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
}

export async function domainsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/settings/domains",
    { preHandler: [requireSession, requireAdmin] },
    async (_request, reply) => {
      const rows = await db
        .select()
        .from(appDomains)
        .innerJoin(apps, eq(appDomains.appId, apps.id));

      reply.send({
        domains: rows.map(({ app_domains: domainRow, apps: appRow }) => ({
          ...serializeDomain(domainRow),
          appName: appRow.name,
        })),
      });
    },
  );

  app.get("/apps/:id/domains", { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db.select().from(appDomains).where(eq(appDomains.appId, id));
    reply.send({ domains: rows.map(serializeDomain) });
  });

  app.post(
    "/apps/:id/domains",
    { preHandler: [requireSession, requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const [existingApp] = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
      if (!existingApp) {
        reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
        return;
      }

      const parsed = createDomainSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
        return;
      }

      const [conflict] = await db
        .select()
        .from(appDomains)
        .where(eq(appDomains.hostname, parsed.data.hostname))
        .limit(1);
      if (conflict) {
        reply.code(422).send({
          error: "validation_error",
          detail: `hostname ${parsed.data.hostname} is already in use`,
        });
        return;
      }

      try {
        const domain = await addDomainToApp(id, parsed.data.hostname, request.log);
        reply.code(201).send({ domain: serializeDomain(domain) });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  app.delete(
    "/apps/:id/domains/:domainId",
    { preHandler: [requireSession, requireAdmin] },
    async (request, reply) => {
      const { id, domainId } = request.params as { id: string; domainId: string };

      const [existing] = await db
        .select()
        .from(appDomains)
        .where(eq(appDomains.id, domainId))
        .limit(1);
      if (!existing || existing.appId !== id) {
        reply.code(404).send({ error: "not_found", detail: `No domain with id ${domainId} for this app` });
        return;
      }

      try {
        await removeDomain(existing, request.log);
        reply.code(204).send();
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "internal_error" });
      }
    },
  );
}
