import "./env.js";
import { isKubernetesConfigured } from "./services/kubernetes.js";
import { decryptValue } from "./lib/crypto.js";

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
  // AES-256-GCM key (32-byte hex) used to encrypt sensitive platform_config
  // values (e.g. CF_API_TOKEN) at rest. If unset, those values are stored in
  // plaintext instead — see logOptionalIntegrationWarnings.
  configEncryptionKey: process.env.CONFIG_ENCRYPTION_KEY,
};

export const hasGithubAppConfig = Boolean(
  config.github.appId &&
    config.github.privateKey &&
    config.github.installationId &&
    config.github.webhookSecret &&
    config.github.org,
);

// Functions (not consts) because config.cfAccess / config.cloudflare can be
// mutated in place by reloadConfig() after a /settings/config update — a
// const captured at import time would go stale.
export function hasCfAccessConfig(): boolean {
  return Boolean(config.cfAccess.teamDomain && config.cfAccess.aud);
}

export function hasCloudflareDnsConfig(): boolean {
  return Boolean(config.cloudflare.apiToken && config.cloudflare.zoneId);
}

// Reads a platform config value: DB override first (decrypting if the row is
// marked secret), falling back to the env var of the same name. Uses dynamic
// imports for the db/schema modules since db/client.ts imports `config` from
// this module at its own top level — a static import here would form a
// circular binding that isn't initialized yet at load time.
export async function getConfig(key: string): Promise<string | undefined> {
  const { db } = await import("./db/client.js");
  const { platformConfig } = await import("./db/schema.js");
  const { eq } = await import("drizzle-orm");

  const [row] = await db.select().from(platformConfig).where(eq(platformConfig.key, key)).limit(1);
  if (!row) {
    return process.env[key];
  }
  return row.isSecret ? decryptValue(row.value, config.configEncryptionKey) : row.value;
}

// Re-reads all DB-backed platform config and merges it into the in-memory
// config object so a /settings/config update takes effect without a restart.
export async function reloadConfig(): Promise<void> {
  config.platformDomain = await getConfig("PLATFORM_DOMAIN");
  config.cfAccess.teamDomain = await getConfig("CF_ACCESS_TEAM_DOMAIN");
  config.cfAccess.aud = await getConfig("CF_ACCESS_AUD");
  config.cloudflare.apiToken = await getConfig("CF_API_TOKEN");
  config.cloudflare.zoneId = await getConfig("CF_ZONE_ID");
}

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

  if (!hasCfAccessConfig()) {
    logger.warn(
      "Cloudflare Access is not configured (CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD) — /auth/cf-callback will not function. Use DEV_AUTH_BYPASS=true for local development.",
    );
  }

  if (!hasCloudflareDnsConfig()) {
    logger.warn(
      "Cloudflare DNS is not configured (CF_API_TOKEN / CF_ZONE_ID) — domain records will be tracked in the database but DNS records will not be created.",
    );
  }

  if (!config.configEncryptionKey) {
    logger.warn(
      "CONFIG_ENCRYPTION_KEY is not set — sensitive platform config values (e.g. CF_API_TOKEN) set via /settings/config will be stored in plaintext. Set a 32-byte hex key in production.",
    );
  }

  if (!isKubernetesConfigured()) {
    logger.warn(
      "No kubeconfig found (KUBECONFIG env var or ~/.kube/config) — Kubernetes-backed routes (deployments, pods, logs, namespace provisioning) will fail until one is configured.",
    );
  }
}
