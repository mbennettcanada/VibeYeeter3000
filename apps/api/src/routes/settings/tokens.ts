import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { platformTokens } from "../../db/schema.js";
import { requireAdmin, requireSession } from "../../middleware/auth.js";
import { generateApiToken } from "../../lib/tokens.js";

const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serializeToken(row: typeof platformTokens.$inferSelect) {
  const now = new Date();
  const status = row.revokedAt ? "revoked" : row.expiresAt && row.expiresAt < now ? "expired" : "active";

  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    status,
  };
}

export async function settingsTokensRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/settings/tokens",
    { preHandler: [requireSession, requireAdmin] },
    async (_request, reply) => {
      const rows = await db.select().from(platformTokens).orderBy(desc(platformTokens.createdAt));
      reply.send({ tokens: rows.map(serializeToken) });
    },
  );

  app.post(
    "/settings/tokens",
    { preHandler: [requireSession, requireAdmin] },
    async (request, reply) => {
      const parsed = createTokenSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
        return;
      }
      const { name, expiresAt } = parsed.data;

      const { token, prefix, hash } = generateApiToken();

      try {
        const [created] = await db
          .insert(platformTokens)
          .values({
            name,
            tokenHash: hash,
            tokenPrefix: prefix,
            // The dev-auth-bypass fake admin (id "local") isn't a real users
            // row, so skip the FK reference rather than fail the insert.
            createdBy: request.user?.id && UUID_RE.test(request.user.id) ? request.user.id : undefined,
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          })
          .returning();

        if (!created) {
          throw new Error("insert returned no row");
        }

        // The plaintext token is only ever available in this one response —
        // it is not derivable from tokenHash and is never logged or
        // returned again (see CLAUDE.md "Secrets — never log, never return
        // values", applied here to platform tokens too).
        reply.code(201).send({ token: { ...serializeToken(created), token } });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  app.delete(
    "/settings/tokens/:id",
    { preHandler: [requireSession, requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const [existing] = await db
        .select()
        .from(platformTokens)
        .where(eq(platformTokens.id, id))
        .limit(1);
      if (!existing) {
        reply.code(404).send({ error: "not_found", detail: `No token with id ${id}` });
        return;
      }

      if (existing.revokedAt) {
        reply.code(204).send();
        return;
      }

      try {
        await db
          .update(platformTokens)
          .set({ revokedAt: new Date() })
          .where(eq(platformTokens.id, id));
        reply.code(204).send();
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "internal_error" });
      }
    },
  );
}
