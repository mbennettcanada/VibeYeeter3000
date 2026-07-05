import "./env.js";
import Fastify from "fastify";
import { config } from "./config.js";
import { isTofuAvailable } from "./tofu.js";
import { healthRoute } from "./routes/health.js";
import { planRoute } from "./routes/plan.js";
import { applyRoute } from "./routes/apply.js";
import { destroyRoute } from "./routes/destroy.js";
import { runsRoute } from "./routes/runs.js";

const app = Fastify({ logger: { level: config.logLevel } });

if (!(await isTofuAvailable())) {
  app.log.warn(
    `"${config.tofuBin}" was not found on PATH — /plan, /apply, and /destroy will fail until OpenTofu is installed. Set TOFU_BIN if it's installed under a different name.`,
  );
}

await app.register(healthRoute);
await app.register(planRoute);
await app.register(applyRoute);
await app.register(destroyRoute);
await app.register(runsRoute);

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`tf-runner listening on port ${config.port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
