import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tfRuns } from "../db/schema.js";
import { runTofuCommand } from "../tofu.js";
import { runDirFor } from "../lib/run-dir.js";

const applySchema = z.object({
  runId: z.string().uuid(),
});

export async function applyRoute(app: FastifyInstance): Promise<void> {
  app.post("/apply", async (request, reply) => {
    const parsed = applySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(422).send({ error: "validation_error", detail: parsed.error.message });
      return;
    }
    const { runId } = parsed.data;

    const [run] = await db.select().from(tfRuns).where(eq(tfRuns.id, runId)).limit(1);
    if (!run) {
      reply.code(400).send({ error: "invalid_run", detail: `No tf_run with id ${runId}` });
      return;
    }
    if (run.type !== "plan" || run.status !== "succeeded") {
      reply.code(400).send({
        error: "invalid_run",
        detail: `tf_run ${runId} is not a succeeded plan (type=${run.type}, status=${run.status})`,
      });
      return;
    }

    const runDir = runDirFor(runId);
    await db.update(tfRuns).set({ type: "apply", status: "running" }).where(eq(tfRuns.id, runId));

    try {
      const result = await runTofuCommand(runDir, ["apply", "-input=false", "-json", "tfplan.bin"]);
      const combinedOutput = `${run.output ?? ""}${result.stdout}${result.stderr}`;
      const status = result.exitCode === 0 ? "succeeded" : "failed";

      await db.update(tfRuns).set({ status, output: combinedOutput }).where(eq(tfRuns.id, runId));

      reply.send({ runId, status, rawOutput: combinedOutput });
    } catch (error) {
      request.log.error(error);
      await db
        .update(tfRuns)
        .set({ status: "failed", output: `${run.output ?? ""}${(error as Error).message}` })
        .where(eq(tfRuns.id, runId));
      reply.code(500).send({ error: "internal_error", detail: (error as Error).message });
    }
  });
}
