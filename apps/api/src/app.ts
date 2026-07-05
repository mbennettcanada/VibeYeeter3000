import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import session from "@fastify/session";
import { config, logOptionalIntegrationWarnings } from "./config.js";
import { registerRawBodyCapture } from "./plugins/raw-body.js";
import { healthRoutes } from "./routes/health.js";
import { samlRoutes } from "./routes/saml.js";
import { appsRoutes } from "./routes/apps.js";
import { deploymentsRoutes } from "./routes/deployments.js";
import { podsRoutes } from "./routes/pods.js";
import { secretsRoutes } from "./routes/secrets.js";
import { terraformRoutes } from "./routes/terraform.js";
import { webhooksRoutes } from "./routes/webhooks.js";
import { settingsTeamsRoutes } from "./routes/settings/teams.js";
import { settingsTokensRoutes } from "./routes/settings/tokens.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  logOptionalIntegrationWarnings(app.log);
  registerRawBodyCapture(app);

  await app.register(cors, {
    origin: config.webAppUrl,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(formbody);
  await app.register(session, {
    secret: config.sessionSecret,
    cookie: { secure: process.env.NODE_ENV === "production" },
  });

  await app.register(healthRoutes);
  await app.register(samlRoutes);
  await app.register(appsRoutes);
  await app.register(deploymentsRoutes);
  await app.register(podsRoutes);
  await app.register(secretsRoutes);
  await app.register(terraformRoutes);
  await app.register(webhooksRoutes);
  await app.register(settingsTeamsRoutes);
  await app.register(settingsTokensRoutes);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.code(error.statusCode ?? 500).send({ error: "internal_error" });
  });

  return app;
}
