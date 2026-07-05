import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tfRuns } from "../db/schema.js";
import { runTofuCommand, parseChangeSummary, varsToArgs } from "../tofu.js";
import { prepareRunDir } from "../lib/run-dir.js";

const planSchema = z.object({
  appId: z.string().uuid(),
  workingDir: z.string().min(1),
  vars: z.record(z.string()).optional(),
});

export async function planRoute(app: FastifyInstance): Promise<void> {
  app.post("/plan", async (request, reply) => {
    const parsed = planSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
      return;
    }
    const { appId, workingDir, vars } = parsed.data;

    const runId = randomUUID();
    const [run] = await db
      .insert(tfRuns)
      .values({ id: runId, appId, type: "plan", status: "running" })
      .returning();

    if (!run) {
      reply.code(500).send({ error: "internal_error" });
      return;
    }

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

      const planArgs = [
        "plan",
        "-input=false",
        "-out=tfplan.bin",
        "-json",
        ...varsToArgs(vars),
      ];
      const plan = await runTofuCommand(runDir, planArgs);
      combinedOutput += plan.stdout + plan.stderr;

      const status = plan.exitCode === 0 ? "succeeded" : "failed";
      const changeSummary = parseChangeSummary(plan.stdout);

      await db
        .update(tfRuns)
        .set({
          status,
          output: combinedOutput,
          planDiff: changeSummary
            ? `Plan: ${changeSummary.toAdd} to add, ${changeSummary.toChange} to change, ${changeSummary.toDestroy} to destroy.`
            : null,
        })
        .where(eq(tfRuns.id, runId));

      reply.send({
        runId,
        status,
        planSummary: changeSummary ?? { toAdd: 0, toChange: 0, toDestroy: 0 },
        rawOutput: combinedOutput,
      });
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
