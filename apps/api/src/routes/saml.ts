import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import type { Profile } from "@node-saml/node-saml";
import { db } from "../db/client.js";
import { users, teams, teamMembers, teamExternalGroups } from "../db/schema.js";
import { config, hasSamlConfig } from "../config.js";
import { getSamlClient } from "../lib/saml-client.js";

function extractGroups(profile: Profile): string[] {
  const raw = profile[config.saml.groupsAttribute];
  if (!raw) {
    return [];
  }
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

async function syncUserAndTeams(email: string, groups: string[]) {
  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    [user] = await db.insert(users).values({ email }).returning();
  }
  if (!user) {
    throw new Error("failed to create or load user");
  }

  let teamSlugs: string[] = [];

  if (groups.length > 0) {
    const mappings = await db
      .select({ teamId: teamExternalGroups.teamId })
      .from(teamExternalGroups)
      .where(inArray(teamExternalGroups.externalGroupId, groups));

    const teamIds = [...new Set(mappings.map((m) => m.teamId))];

    for (const teamId of teamIds) {
      await db.insert(teamMembers).values({ teamId, userId: user.id }).onConflictDoNothing();
    }

    if (teamIds.length > 0) {
      const rows = await db.select({ slug: teams.slug }).from(teams).where(inArray(teams.id, teamIds));
      teamSlugs = rows.map((row) => row.slug);
    }
  }

  return { user, teamSlugs };
}

export async function samlRoutes(app: FastifyInstance): Promise<void> {
  app.get("/saml/metadata", async (_request, reply) => {
    if (!hasSamlConfig) {
      reply.code(503).send({ error: "not_configured", detail: "SAML is not configured" });
      return;
    }

    const xml = getSamlClient().generateServiceProviderMetadata(null, null);
    reply.type("application/xml").send(xml);
  });

  app.get("/saml/login", async (_request, reply) => {
    if (!hasSamlConfig) {
      reply.code(503).send({ error: "not_configured", detail: "SAML is not configured" });
      return;
    }

    const url = await getSamlClient().getAuthorizeUrlAsync("", undefined, {});
    reply.redirect(url);
  });

  app.post("/saml/callback", async (request, reply) => {
    if (!hasSamlConfig) {
      reply.code(503).send({ error: "not_configured", detail: "SAML is not configured" });
      return;
    }

    try {
      const { profile } = await getSamlClient().validatePostResponseAsync(
        request.body as Record<string, string>,
      );

      const email = profile?.email ?? profile?.nameID;
      if (!profile || !email) {
        reply
          .code(401)
          .send({ error: "unauthenticated", detail: "SAML response contained no usable assertion" });
        return;
      }

      const groups = extractGroups(profile);
      const { user, teamSlugs } = await syncUserAndTeams(email, groups);

      request.session.user = {
        id: user.id,
        email: user.email,
        teams: teamSlugs,
        isAdmin: user.isAdmin,
      };
      await request.session.save();

      reply.redirect(config.webAppUrl);
    } catch (error) {
      request.log.error(error);
      reply.code(401).send({ error: "unauthenticated", detail: "Failed to validate SAML response" });
    }
  });

  app.post("/saml/logout", async (request, reply) => {
    await request.session.destroy();

    if (config.saml.idpSloUrl) {
      reply.redirect(config.saml.idpSloUrl);
      return;
    }
    reply.redirect(config.webAppUrl);
  });
}
