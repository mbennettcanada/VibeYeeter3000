import "./env.js";
import Fastify from "fastify";
import { healthRoute } from "./routes/health.js";
import { planRoute } from "./routes/plan.js";
import { applyRoute } from "./routes/apply.js";
import { destroyRoute } from "./routes/destroy.js";

const port = Number(process.env.PORT ?? 4000);

const app = Fastify({ logger: true });

await app.register(healthRoute);
await app.register(planRoute);
await app.register(applyRoute);
await app.register(destroyRoute);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`tf-runner listening on port ${port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
