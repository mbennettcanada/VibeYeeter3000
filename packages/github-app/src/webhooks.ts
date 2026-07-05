import { Webhooks } from "@octokit/webhooks";

export interface GithubAppWebhooksConfig {
  webhookSecret: string;
}

export function createWebhooks(config: GithubAppWebhooksConfig): Webhooks {
  const webhooks = new Webhooks({ secret: config.webhookSecret });

  webhooks.on("push", async ({ payload }) => {
    // TODO: detect app repo from payload.repository, trigger a deployment record
    void payload;
  });

  webhooks.on("pull_request", async ({ payload }) => {
    // TODO: handle PR opened/synchronize/closed for preview environments
    void payload;
  });

  webhooks.on("deployment_status", async ({ payload }) => {
    // TODO: reconcile GitHub deployment status with platform deployment record
    void payload;
  });

  return webhooks;
}
