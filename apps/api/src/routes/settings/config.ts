import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PlatformConfigKey } from "@vibeyeeter/types";
import { db } from "../../db/client.js";
import { platformConfig } from "../../db/schema.js";
import { requireAdmin, requireSession } from "../../middleware/auth.js";
import { config, reloadConfig } from "../../config.js";
import { encryptValue } from "../../lib/crypto.js";

const SECRET_PLACEHOLDER = "••••••••";

const CONFIG_KEY_DEFS: Record<PlatformConfigKey, { isSecret: boolean }> = {
  CF_ACCESS_TEAM_DOMAIN: { isSecret: false },
  CF_ACCESS_AUD: { isSecret: false },
  CF_API_TOKEN: { isSecret: true },
  CF_ZONE_ID: { isSecret: false },
  PLATFORM_DOMAIN: { isSecret: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const updateConfigSchema = z.object({
  value: z.string().trim().min(1).max(2000),
});

function serialize(key: PlatformConfigKey, row: typeof platformConfig.$inferSelect | undefined) {
  const def = CONFIG_KEY_DEFS[key];

  if (!row) {
    // No DB override yet — surface the env var so admins can see the
    // effective value the platform is currently running with.
    const envValue = process.env[key];
    return {
      key,
      value: envValue ? (def.isSecret ? SECRET_PLACEHOLDER : envValue) : null,
      isSecret: def.isSecret,
      updatedAt: null,
    };
  }

  return {
    key,
    value: def.isSecret ? SECRET_PLACEHOLDER : row.value,
    isSecret: def.isSecret,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function settingsConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/settings/config",
    { preHandler: [requireSession, requireAdmin] },
    async (_request, reply) => {
      const rows = await db.select().from(platformConfig);
      const rowsByKey = new Map(rows.map((row) => [row.key, row]));
      const items = (Object.keys(CONFIG_KEY_DEFS) as PlatformConfigKey[]).map((key) =>
        serialize(key, rowsByKey.get(key)),
      );
      reply.send({ config: items });
    },
  );

  app.put(
    "/settings/config/:key",
    { preHandler: [requireSession, requireAdmin] },
    async (request, reply) => {
      const { key } = request.params as { key: string };
      const def = CONFIG_KEY_DEFS[key as PlatformConfigKey];
      if (!def) {
        reply.code(404).send({ error: "not_found", detail: `Unknown config key ${key}` });
        return;
      }
      const typedKey = key as PlatformConfigKey;

      const parsed = updateConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
        return;
      }

      const storedValue = def.isSecret
        ? encryptValue(parsed.data.value, config.configEncryptionKey)
        : parsed.data.value;
      const updatedBy =
        request.user?.id && UUID_RE.test(request.user.id) ? request.user.id : undefined;

      try {
        const [updated] = await db
          .insert(platformConfig)
          .values({ key: typedKey, value: storedValue, isSecret: def.isSecret, updatedBy })
          .onConflictDoUpdate({
            target: platformConfig.key,
            set: { value: storedValue, isSecret: def.isSecret, updatedAt: new Date(), updatedBy },
          })
          .returning();

        if (!updated) {
          throw new Error("upsert returned no row");
        }

        await reloadConfig();

        reply.send({ config: serialize(typedKey, updated) });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "internal_error" });
      }
    },
  );
}
