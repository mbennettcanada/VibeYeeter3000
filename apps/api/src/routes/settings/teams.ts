import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { apps, teamExternalGroups, teamMembers, teams } from "../../db/schema.js";
import { requireAdmin, requireSession } from "../../middleware/auth.js";

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "must be lowercase alphanumeric with hyphens"),
});

const renameTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const addGroupSchema = z.object({
  groupName: z.string().trim().min(1).max(255),
});

async function findTeam(id: string) {
  const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return team;
}

async function serializeTeam(team: typeof teams.$inferSelect) {
  const [memberCountRow] = await db
    .select({ value: count() })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, team.id));

  const groupRows = await db
    .select()
    .from(teamExternalGroups)
    .where(eq(teamExternalGroups.teamId, team.id));

  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    createdAt: team.createdAt.toISOString(),
    memberCount: memberCountRow?.value ?? 0,
    groups: groupRows.map((row) => row.externalGroupId),
  };
}

export async function settingsTeamsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/settings/teams",
    { preHandler: [requireSession, requireAdmin] },
    async (_request, reply) => {
      const rows = await db.select().from(teams);
      reply.send({ teams: await Promise.all(rows.map(serializeTeam)) });
    },
  );

  app.post(
    "/settings/teams",
    { preHandler: [requireSession, requireAdmin] },
    async (request, reply) => {
      const parsed = createTeamSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
        return;
      }
      const { name, slug } = parsed.data;

      const [existing] = await db.select().from(teams).where(eq(teams.slug, slug)).limit(1);
      if (existing) {
        reply.code(422).send({ error: "validation_error", detail: `slug ${slug} is already in use` });
        return;
      }

      try {
        const [created] = await db.insert(teams).values({ name, slug }).returning();
        if (!created) {
          throw new Error("insert returned no row");
        }
        reply.code(201).send({ team: await serializeTeam(created) });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  app.patch(
    "/settings/teams/:id",
    { preHandler: [requireSession, requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await findTeam(id);
      if (!existing) {
        reply.code(404).send({ error: "not_found", detail: `No team with id ${id}` });
        return;
      }

      const parsed = renameTeamSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
        return;
      }

      try {
        const [updated] = await db
          .update(teams)
          .set({ name: parsed.data.name })
          .where(eq(teams.id, id))
          .returning();

        if (!updated) {
          throw new Error("update returned no row");
        }

        reply.send({ team: await serializeTeam(updated) });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  // Teams have no deletedAt column (unlike apps) — nothing besides an app
  // registration references a team in a way that needs historical lookback,
  // so this is a hard delete. It's blocked while the team still owns active
  // apps so those apps are never left pointing at a deleted team.
  app.delete(
    "/settings/teams/:id",
    { preHandler: [requireSession, requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await findTeam(id);
      if (!existing) {
        reply.code(404).send({ error: "not_found", detail: `No team with id ${id}` });
        return;
      }

      const [activeApp] = await db
        .select()
        .from(apps)
        .where(and(eq(apps.teamId, id), isNull(apps.deletedAt)))
        .limit(1);
      if (activeApp) {
        reply.code(422).send({
          error: "validation_error",
          detail: "team has active apps and cannot be deleted",
        });
        return;
      }

      try {
        await db.delete(teamExternalGroups).where(eq(teamExternalGroups.teamId, id));
        await db.delete(teamMembers).where(eq(teamMembers.teamId, id));
        await db.delete(teams).where(eq(teams.id, id));
        reply.code(204).send();
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  app.post(
    "/settings/teams/:id/groups",
    { preHandler: [requireSession, requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await findTeam(id);
      if (!existing) {
        reply.code(404).send({ error: "not_found", detail: `No team with id ${id}` });
        return;
      }

      const parsed = addGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
        return;
      }
      const { groupName } = parsed.data;

      const [conflict] = await db
        .select()
        .from(teamExternalGroups)
        .where(eq(teamExternalGroups.externalGroupId, groupName))
        .limit(1);
      if (conflict) {
        reply.code(422).send({
          error: "validation_error",
          detail: `group ${groupName} is already mapped to a team`,
        });
        return;
      }

      try {
        await db.insert(teamExternalGroups).values({ teamId: id, externalGroupId: groupName });
        reply.code(201).send({ team: await serializeTeam(existing) });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  app.delete(
    "/settings/teams/:id/groups/:groupName",
    { preHandler: [requireSession, requireAdmin] },
    async (request, reply) => {
      const { id, groupName } = request.params as { id: string; groupName: string };

      const existing = await findTeam(id);
      if (!existing) {
        reply.code(404).send({ error: "not_found", detail: `No team with id ${id}` });
        return;
      }

      const [mapping] = await db
        .select()
        .from(teamExternalGroups)
        .where(
          and(eq(teamExternalGroups.teamId, id), eq(teamExternalGroups.externalGroupId, groupName)),
        )
        .limit(1);
      if (!mapping) {
        reply.code(404).send({ error: "not_found", detail: `No group mapping ${groupName} for this team` });
        return;
      }

      try {
        await db
          .delete(teamExternalGroups)
          .where(
            and(eq(teamExternalGroups.teamId, id), eq(teamExternalGroups.externalGroupId, groupName)),
          );
        reply.code(204).send();
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "internal_error" });
      }
    },
  );
}
