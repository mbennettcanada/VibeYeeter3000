import { App } from "@octokit/app";

export interface RepoOpsConfig {
  appId: string;
  privateKey: string;
}

export function createRepoOps(config: RepoOpsConfig): App {
  return new App({ appId: config.appId, privateKey: config.privateKey });
}

export async function pushFile(
  _app: App,
  _params: { owner: string; repo: string; path: string; content: string; message: string },
): Promise<void> {
  // TODO: create or update a file via the contents API
}

export async function openPR(
  _app: App,
  _params: { owner: string; repo: string; title: string; head: string; base: string },
): Promise<{ number: number }> {
  // TODO: open a pull request via the pulls API
  return { number: 0 };
}

export async function createDeployment(
  _app: App,
  _params: { owner: string; repo: string; ref: string; environment: string },
): Promise<{ id: number }> {
  // TODO: create a GitHub deployment via the deployments API
  return { id: 0 };
}
