import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { apps, tfRuns } from "../db/schema.js";
import { requireSession } from "../middleware/auth.js";

async function findActiveApp(id: string) {
  const [app] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, id), isNull(apps.deletedAt)))
    .limit(1);
  return app;
}

export async function terraformRoutes(app: FastifyInstance): Promise<void> {
  app.get("/apps/:id/terraform", { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findActiveApp(id);
    if (!existing) {
      reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
      return;
    }

    const rows = await db
      .select()
      .from(tfRuns)
      .where(eq(tfRuns.appId, id))
      .orderBy(desc(tfRuns.createdAt));

    reply.send({
      runs: rows.map((row) => ({
        id: row.id,
        appId: row.appId,
        type: row.type,
        status: row.status,
        planDiff: row.planDiff,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  app.post("/apps/:id/terraform", { preHandler: requireSession }, async (_request, reply) => {
    // TODO: trigger a plan/apply/destroy via tf-runner; require prior plan approval for apply
    reply.send({ todo: true });
  });

  // Streams a tf_run's combined stdout/stderr as it's written, via SSE. Polls
  // the DB every 500ms and only sends the bytes appended since the last
  // poll, since tf-runner (a separate service/process) is what's actually
  // appending to the `output` column. Sends `event: done` once the run
  // reaches a terminal status, then closes the stream.
  app.get(
    "/apps/:id/terraform/stream",
    { preHandler: requireSession },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { runId } = request.query as { runId?: string };

      const existingApp = await findActiveApp(id);
      if (!existingApp) {
        reply.code(404).send({ error: "not_found", detail: `No app with id ${id}` });
        return;
      }

      const targetRun = runId
        ? await db
            .select()
            .from(tfRuns)
            .where(and(eq(tfRuns.id, runId), eq(tfRuns.appId, id)))
            .limit(1)
            .then((rows) => rows[0])
        : await db
            .select()
            .from(tfRuns)
            .where(eq(tfRuns.appId, id))
            .orderBy(desc(tfRuns.createdAt))
            .limit(1)
            .then((rows) => rows[0]);

      if (!targetRun) {
        reply.code(404).send({ error: "not_found", detail: "No terraform run found to stream" });
        return;
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      let sentLength = 0;
      let closed = false;
      let timer: NodeJS.Timeout | undefined;

      const finish = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        reply.raw.end();
      };

      const poll = async () => {
        if (closed) return;

        const [current] = await db.select().from(tfRuns).where(eq(tfRuns.id, targetRun.id)).limit(1);
        if (!current) {
          finish();
          return;
        }

        const output = current.output ?? "";
        if (output.length > sentLength) {
          const chunk = output.slice(sentLength);
          sentLength = output.length;
          for (const line of chunk.split("\n")) {
            reply.raw.write(`data: ${line}\n`);
          }
          reply.raw.write("\n");
        }

        if (current.status === "succeeded" || current.status === "failed") {
          reply.raw.write(`event: done\ndata: ${current.status}\n\n`);
          finish();
          return;
        }

        timer = setTimeout(poll, 500);
      };

      request.raw.on("close", finish);

      await poll();
    },
  );
}
