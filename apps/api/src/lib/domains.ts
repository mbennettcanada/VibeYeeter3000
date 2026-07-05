import type { FastifyBaseLogger } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { appDomains } from "../db/schema.js";
import { config, hasCloudflareDnsConfig } from "../config.js";
import { createDnsRecord, deleteDnsRecord } from "../services/cloudflare.js";

// All apps currently share a single ingress controller (see
// services/kubernetes.ts ensureIngress), reachable at the platform domain —
// so every app hostname CNAMEs to it regardless of app.
function ingressTarget(): string | undefined {
  return config.platformDomain;
}

export async function addDomainToApp(
  appId: string,
  hostname: string,
  logger: Pick<FastifyBaseLogger, "warn" | "error">,
  domainType: "platform" | "custom" = "custom",
): Promise<typeof appDomains.$inferSelect> {
  const [created] = await db
    .insert(appDomains)
    .values({ appId, hostname, domainType, dnsStatus: "pending" })
    .returning();
  if (!created) {
    throw new Error("insert returned no row");
  }

  const target = ingressTarget();
  if (!hasCloudflareDnsConfig || !target) {
    logger.warn(
      `Cloudflare DNS is not configured — skipped DNS record creation for ${hostname}. Domain left in "pending" status.`,
    );
    return created;
  }

  try {
    const { id: cfRecordId } = await createDnsRecord(hostname, target);
    const [updated] = await db
      .update(appDomains)
      .set({ cfRecordId, dnsStatus: "active" })
      .where(eq(appDomains.id, created.id))
      .returning();
    return updated ?? created;
  } catch (error) {
    logger.error(error);
    const [updated] = await db
      .update(appDomains)
      .set({ dnsStatus: "error" })
      .where(eq(appDomains.id, created.id))
      .returning();
    return updated ?? created;
  }
}

export async function removeDomain(
  domain: typeof appDomains.$inferSelect,
  logger: Pick<FastifyBaseLogger, "error">,
): Promise<void> {
  if (domain.cfRecordId) {
    try {
      await deleteDnsRecord(domain.cfRecordId);
    } catch (error) {
      // Best-effort: the DB row is the source of truth for app<->hostname
      // assignment; a stranded DNS record can be cleaned up manually.
      logger.error(error);
    }
  }

  await db.delete(appDomains).where(eq(appDomains.id, domain.id));
}
