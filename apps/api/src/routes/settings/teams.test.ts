import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { teamExternalGroups, teamMembers, users } from "../../db/schema.js";
import { createTestTeam, createTestApp, cleanupApp, cleanupTeam } from "../../test-utils/fixtures.js";
import type { FastifyInstance } from "fastify";

const { buildApp } = await import("../../app.js");

describe("settings/teams routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /settings/teams lists teams with member count and groups", async () => {
    const team = await createTestTeam();
    try {
      const response = await app.inject({ method: "GET", url: "/settings/teams" });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { teams: Array<{ id: string; memberCount: number; groups: string[] }> };
      const found = body.teams.find((t) => t.id === team.id);
      expect(found).toBeDefined();
      expect(found?.memberCount).toBe(0);
      expect(found?.groups).toEqual([]);
    } finally {
      await cleanupTeam(team.id);
    }
  });

  it("POST /settings/teams creates a team", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/settings/teams",
      payload: { name: "Growth", slug: `growth-${Date.now()}` },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { team: { id: string; name: string; slug: string } };
    expect(body.team.name).toBe("Growth");
    await cleanupTeam(body.team.id);
  });

  it("POST /settings/teams returns 422 for a duplicate slug", async () => {
    const team = await createTestTeam();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/settings/teams",
        payload: { name: "Duplicate", slug: team.slug },
      });
      expect(response.statusCode).toBe(422);
    } finally {
      await cleanupTeam(team.id);
    }
  });

  it("POST /settings/teams returns 422 for an invalid slug", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/settings/teams",
      payload: { name: "Bad Slug", slug: "Not Valid!" },
    });
    expect(response.statusCode).toBe(422);
  });

  it("PATCH /settings/teams/:id renames a team", async () => {
    const team = await createTestTeam();
    try {
      const response = await app.inject({
        method: "PATCH",
        url: `/settings/teams/${team.id}`,
        payload: { name: "Renamed Team" },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { team: { name: string } };
      expect(body.team.name).toBe("Renamed Team");
    } finally {
      await cleanupTeam(team.id);
    }
  });

  it("PATCH /settings/teams/:id returns 404 for an unknown team", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/settings/teams/00000000-0000-0000-0000-000000000000",
      payload: { name: "Nope" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("DELETE /settings/teams/:id removes a team with no active apps", async () => {
    const team = await createTestTeam();
    const response = await app.inject({ method: "DELETE", url: `/settings/teams/${team.id}` });
    expect(response.statusCode).toBe(204);

    const getResponse = await app.inject({ method: "GET", url: "/settings/teams" });
    const body = getResponse.json() as { teams: Array<{ id: string }> };
    expect(body.teams.map((t) => t.id)).not.toContain(team.id);
  });

  it("DELETE /settings/teams/:id returns 422 when the team has an active app", async () => {
    const team = await createTestTeam();
    const seededApp = await createTestApp(team.id);
    try {
      const response = await app.inject({ method: "DELETE", url: `/settings/teams/${team.id}` });
      expect(response.statusCode).toBe(422);
    } finally {
      await cleanupApp(seededApp.id);
      await cleanupTeam(team.id);
    }
  });

  describe("group mappings", () => {
    it("adds and removes a SAML group mapping", async () => {
      const team = await createTestTeam();
      const groupName = `group-${Date.now()}`;
      try {
        const addResponse = await app.inject({
          method: "POST",
          url: `/settings/teams/${team.id}/groups`,
          payload: { groupName },
        });
        expect(addResponse.statusCode).toBe(201);
        const addBody = addResponse.json() as { team: { groups: string[] } };
        expect(addBody.team.groups).toContain(groupName);

        const removeResponse = await app.inject({
          method: "DELETE",
          url: `/settings/teams/${team.id}/groups/${groupName}`,
        });
        expect(removeResponse.statusCode).toBe(204);

        const remaining = await db
          .select()
          .from(teamExternalGroups)
          .where(eq(teamExternalGroups.teamId, team.id));
        expect(remaining).toHaveLength(0);
      } finally {
        await cleanupTeam(team.id);
      }
    });

    it("returns 422 when the group is already mapped to another team", async () => {
      const teamA = await createTestTeam();
      const teamB = await createTestTeam();
      const groupName = `group-${Date.now()}`;
      try {
        await app.inject({
          method: "POST",
          url: `/settings/teams/${teamA.id}/groups`,
          payload: { groupName },
        });

        const response = await app.inject({
          method: "POST",
          url: `/settings/teams/${teamB.id}/groups`,
          payload: { groupName },
        });
        expect(response.statusCode).toBe(422);
      } finally {
        await db.delete(teamExternalGroups).where(eq(teamExternalGroups.teamId, teamA.id));
        await cleanupTeam(teamA.id);
        await cleanupTeam(teamB.id);
      }
    });

    it("returns 404 when removing a mapping that doesn't exist", async () => {
      const team = await createTestTeam();
      try {
        const response = await app.inject({
          method: "DELETE",
          url: `/settings/teams/${team.id}/groups/does-not-exist`,
        });
        expect(response.statusCode).toBe(404);
      } finally {
        await cleanupTeam(team.id);
      }
    });
  });

  it("counts members correctly", async () => {
    const team = await createTestTeam();
    const [user] = await db
      .insert(users)
      .values({ email: `member-${Date.now()}@acme.com` })
      .returning();
    try {
      await db.insert(teamMembers).values({ teamId: team.id, userId: user!.id });

      const response = await app.inject({ method: "GET", url: "/settings/teams" });
      const body = response.json() as { teams: Array<{ id: string; memberCount: number }> };
      const found = body.teams.find((t) => t.id === team.id);
      expect(found?.memberCount).toBe(1);
    } finally {
      await db.delete(teamMembers).where(eq(teamMembers.teamId, team.id));
      await db.delete(users).where(eq(users.id, user!.id));
      await cleanupTeam(team.id);
    }
  });
});
