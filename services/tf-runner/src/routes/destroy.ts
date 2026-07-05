import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tfRuns } from "../db/schema.js";
import { runTofuCommand, varsToArgs } from "../tofu.js";
import { prepareRunDir } from "../lib/run-dir.js";

const destroySchema = z.object({
  appId: z.string().uuid(),
  workingDir: z.string().min(1),
  vars: z.record(z.string()).optional(),
});

export async function destroyRoute(app: FastifyInstance): Promise<void> {
  app.post("/destroy", async (request, reply) => {
    const parsed = destroySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
      return;
    }
    const { appId, workingDir, vars } = parsed.data;

    const runId = randomUUID();
    await db.insert(tfRuns).values({ id: runId, appId, type: "destroy", status: "running" });

    try {
      const runDir = await prepareRunDir(runId, workingDir);

      const init = await runTofuCommand(runDir, ["init", "-input=false"]);
      let combinedOutput = init.stdout + init.stderr;

      if (init.exitCode !== 0) {
        await db
          .update(tfRuns)
          .set({ status: "failed", output: combinedOutput })
          .where(eq(tfRuns.id, runId));
        reply.send({ runId, status: "failed", rawOutput: combinedOutput });
        return;
      }

      const destroyArgs = ["destroy", "-auto-approve", "-input=false", "-json", ...varsToArgs(vars)];
      const destroyResult = await runTofuCommand(runDir, destroyArgs);
      combinedOutput += destroyResult.stdout + destroyResult.stderr;

      const status = destroyResult.exitCode === 0 ? "succeeded" : "failed";
      await db.update(tfRuns).set({ status, output: combinedOutput }).where(eq(tfRuns.id, runId));

      reply.send({ runId, status, rawOutput: combinedOutput });
    } catch (error) {
      request.log.error(error);
      await db
        .update(tfRuns)
        .set({ status: "failed", output: (error as Error).message })
        .where(eq(tfRuns.id, runId));
      reply.code(500).send({ error: "internal_error", detail: (error as Error).message });
    }
  });
}
