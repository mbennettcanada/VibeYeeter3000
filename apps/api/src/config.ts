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
  // Base domain for per-app subdomains (e.g. internal.yourcompany.com) and
  // the platform's own public URL (templated into app deploy workflows as
  // the deployment webhook target). No default — both are
  // environment-specific; when unset locally, the affected
  // features simply fall back or no-op.
  platformDomain: process.env.PLATFORM_DOMAIN,
  platformUrl: process.env.PLATFORM_URL,
  github: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    installationId: process.env.GITHUB_APP_INSTALLATION_ID,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    // No default — every deployment provisions into a different GitHub
    // org, so silently falling back to a placeholder would provision real
    // repos into the wrong place.
    org: process.env.GITHUB_ORG,
    // Org used for container image pushes; usually the same as GITHUB_ORG
    // but can differ (e.g. a separate org/user owns the GHCR packages).
    ghcrOrg: process.env.GHCR_ORG ?? process.env.GITHUB_ORG,
  },
  // Deprecated: a single static token accepted by requireToken alongside
  // platform_tokens rows, for callers that haven't migrated to per-token
  // credentials from /settings/tokens yet.
  legacyApiToken: process.env.VIBEYEETER_API_TOKEN,
  // Cloudflare Access — validates the CF_Authorization cookie JWT set by
  // Cloudflare once a user authenticates through the Zero Trust login flow.
  cfAccess: {
    teamDomain: process.env.CF_ACCESS_TEAM_DOMAIN,
    aud: process.env.CF_ACCESS_AUD,
  },
  // Cloudflare API — used to create/delete DNS records for app hostnames.
  cloudflare: {
    apiToken: process.env.CF_API_TOKEN,
    zoneId: process.env.CF_ZONE_ID,
  },
};

export const hasGithubAppConfig = Boolean(
  config.github.appId &&
    config.github.privateKey &&
    config.github.installationId &&
    config.github.webhookSecret &&
    config.github.org,
);

export const hasCfAccessConfig = Boolean(config.cfAccess.teamDomain && config.cfAccess.aud);

export const hasCloudflareDnsConfig = Boolean(config.cloudflare.apiToken && config.cloudflare.zoneId);

export function logOptionalIntegrationWarnings(logger: {
  warn: (msg: string) => void;
}): void {
  if (config.devAuthBypass) {
    logger.warn("DEV_AUTH_BYPASS is enabled — all requests are authenticated as a fake local admin. Do not use in production.");
  }

  if (!hasGithubAppConfig) {
    logger.warn(
      "GitHub App credentials are not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY / GITHUB_APP_INSTALLATION_ID / GITHUB_WEBHOOK_SECRET / GITHUB_ORG) — webhook and repo-op routes will not function.",
    );
  }

  if (!config.platformUrl) {
    logger.warn(
      "PLATFORM_URL is not configured — generated app deploy workflows will not know where to POST deployment webhooks.",
    );
  }

  if (!hasCfAccessConfig) {
    logger.warn(
      "Cloudflare Access is not configured (CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD) — /auth/cf-callback will not function. Use DEV_AUTH_BYPASS=true for local development.",
    );
  }

  if (!hasCloudflareDnsConfig) {
    logger.warn(
      "Cloudflare DNS is not configured (CF_API_TOKEN / CF_ZONE_ID) — domain records will be tracked in the database but DNS records will not be created.",
    );
  }

  if (!isKubernetesConfigured()) {
    logger.warn(
      "No kubeconfig found (KUBECONFIG env var or ~/.kube/config) — Kubernetes-backed routes (deployments, pods, logs, namespace provisioning) will fail until one is configured.",
    );
  }
}
