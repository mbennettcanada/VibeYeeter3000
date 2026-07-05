import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

export interface GithubAppEnvConfig {
  appId: string;
  privateKey: string;
  installationId: string;
}

function decodePrivateKey(base64PrivateKey: string): string {
  const decoded = Buffer.from(base64PrivateKey, "base64").toString("utf-8");
  if (!decoded.includes("BEGIN") || !decoded.includes("PRIVATE KEY")) {
    throw new Error(
      "GITHUB_APP_PRIVATE_KEY does not decode to a PEM private key. It must be the base64 " +
        "encoding of the .pem file downloaded from the GitHub App settings page.",
    );
  }
  return decoded;
}

export function readGithubAppEnvConfig(): GithubAppEnvConfig {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  const missing = [
    !appId && "GITHUB_APP_ID",
    !privateKey && "GITHUB_APP_PRIVATE_KEY",
    !installationId && "GITHUB_APP_INSTALLATION_ID",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Cannot authenticate the GitHub App: missing env var(s) ${missing.join(", ")}. ` +
        "Set these to real values from the vibeyeeter-bot GitHub App settings, or avoid " +
        "calling getOctokit() in environments where GitHub integration isn't configured.",
    );
  }

  return { appId: appId as string, privateKey: privateKey as string, installationId: installationId as string };
}

let cachedOctokit: Octokit | undefined;

// Singleton installation-authenticated Octokit client. Throws immediately
// (rather than returning a client that will fail on first use) if the app
// isn't configured, so callers get a clear error instead of a confusing
// 401 deep inside some unrelated request.
export function getOctokit(): Octokit {
  if (cachedOctokit) {
    return cachedOctokit;
  }

  const { appId, privateKey, installationId } = readGithubAppEnvConfig();

  cachedOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey: decodePrivateKey(privateKey),
      installationId,
    },
  });

  return cachedOctokit;
}

// Test-only: clears the cached client so tests can reconfigure env vars and
// verify getOctokit() re-reads them.
export function resetOctokitCache(): void {
  cachedOctokit = undefined;
}
