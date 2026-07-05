import "./env.js";
import { isKubernetesConfigured } from "./services/kubernetes.js";

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
// SESSION_SECRET is the dedicated secret for signing the session cookie —
// falls back to JWT_SECRET so existing local setups keep working.
const sessionSecret = required("SESSION_SECRET", jwtSecret).padEnd(32, "0");

export const config = {
  port: Number(process.env.PORT ?? 3002),
  logLevel: process.env.LOG_LEVEL ?? "info",
  databaseUrl: required("DATABASE_URL", "postgres://postgres:dev@localhost:5432/vibeyeeter"),
  jwtSecret,
  sessionSecret,
  devAuthBypass: process.env.DEV_AUTH_BYPASS === "true",
  tfRunnerUrl: process.env.TF_RUNNER_URL ?? "http://localhost:4001",
  webAppUrl: process.env.WEB_APP_URL ?? "http://localhost:3000",
  github: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    installationId: process.env.GITHUB_APP_INSTALLATION_ID,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    org: process.env.GITHUB_ORG ?? "acme",
  },
  saml: {
    entityId: process.env.SAML_ENTITY_ID,
    idpSsoUrl: process.env.SAML_IDP_SSO_URL,
    idpCert: process.env.SAML_IDP_CERT,
    callbackUrl: process.env.SAML_CALLBACK_URL,
    groupsAttribute: process.env.SAML_GROUPS_ATTRIBUTE ?? "memberOf",
    idpSloUrl: process.env.SAML_IDP_SLO_URL,
  },
};

export const hasGithubAppConfig = Boolean(
  config.github.appId &&
    config.github.privateKey &&
    config.github.installationId &&
    config.github.webhookSecret,
);

export const hasSamlConfig = Boolean(
  config.saml.entityId && config.saml.idpSsoUrl && config.saml.idpCert && config.saml.callbackUrl,
);

export function logOptionalIntegrationWarnings(logger: {
  warn: (msg: string) => void;
}): void {
  if (config.devAuthBypass) {
    logger.warn("DEV_AUTH_BYPASS is enabled — all requests are authenticated as a fake local admin. Do not use in production.");
  }

  if (!hasGithubAppConfig) {
    logger.warn(
      "GitHub App credentials are not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY / GITHUB_APP_INSTALLATION_ID / GITHUB_WEBHOOK_SECRET) — webhook and repo-op routes will not function.",
    );
  }

  if (!hasSamlConfig) {
    logger.warn(
      "SAML is not configured (SAML_ENTITY_ID / SAML_IDP_SSO_URL / SAML_IDP_CERT / SAML_CALLBACK_URL) — /saml/* routes will not function. Use DEV_AUTH_BYPASS=true for local development.",
    );
  }

  if (!isKubernetesConfigured()) {
    logger.warn(
      "No kubeconfig found (KUBECONFIG env var or ~/.kube/config) — Kubernetes-backed routes (deployments, pods, logs, namespace provisioning) will fail until one is configured.",
    );
  }
}
