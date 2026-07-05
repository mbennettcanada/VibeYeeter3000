import "./env.js";

function required(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  return value;
}

const jwtSecret = required("JWT_SECRET", "local-dev-secret");

// @fastify/session requires a secret of at least 32 characters; pad short
// (e.g. local dev) secrets deterministically rather than rejecting them.
const sessionSecret = jwtSecret.padEnd(32, "0");

export const config = {
  port: Number(process.env.PORT ?? 3001),
  logLevel: process.env.LOG_LEVEL ?? "info",
  databaseUrl: required("DATABASE_URL", "postgres://postgres:dev@localhost:5432/vibeyeeter"),
  jwtSecret,
  sessionSecret,
  devAuthBypass: process.env.DEV_AUTH_BYPASS === "true",
  tfRunnerUrl: process.env.TF_RUNNER_URL ?? "http://localhost:4000",
  github: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  },
  saml: {
    cert: process.env.JUMPCLOUD_SAML_CERT,
    spEntityId: process.env.SAML_SP_ENTITY_ID,
    callbackUrl: process.env.SAML_CALLBACK_URL,
  },
};

export const hasGithubAppConfig = Boolean(
  config.github.appId && config.github.privateKey && config.github.webhookSecret,
);

export const hasSamlConfig = Boolean(
  config.saml.cert && config.saml.spEntityId && config.saml.callbackUrl,
);

export function logOptionalIntegrationWarnings(logger: {
  warn: (msg: string) => void;
}): void {
  if (config.devAuthBypass) {
    logger.warn("DEV_AUTH_BYPASS is enabled — all requests are authenticated as a fake local admin. Do not use in production.");
  }

  if (!hasGithubAppConfig) {
    logger.warn(
      "GitHub App credentials are not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY / GITHUB_WEBHOOK_SECRET) — webhook and repo-op routes will not function.",
    );
  }

  if (!hasSamlConfig) {
    logger.warn(
      "JumpCloud SAML is not configured (JUMPCLOUD_SAML_CERT / SAML_SP_ENTITY_ID / SAML_CALLBACK_URL) — /saml/* routes will not function. Use DEV_AUTH_BYPASS=true for local development.",
    );
  }
}
