import { Webhooks } from "@octokit/webhooks";
import type {
  DeploymentStatusEvent,
  PullRequestEvent,
  PushEvent,
} from "@octokit/webhooks-types";

export interface GithubAppWebhooksConfig {
  webhookSecret: string;
}

// Business logic (DB writes, enqueueing deploys, etc.) lives in apps/api, not
// in this package — these handlers are injected so @vibeyeeter/github-app
// stays a thin, testable wrapper around signature verification + event
// parsing. See CLAUDE.md: packages/github-app is "GitHub App integration",
// the platform DB access belongs to apps/api.
export interface WebhookHandlers {
  onPush?: (payload: PushEvent) => Promise<void>;
  onDeploymentStatus?: (payload: DeploymentStatusEvent) => Promise<void>;
  onPullRequest?: (payload: PullRequestEvent) => Promise<void>;
}

export function createWebhooks(
  config: GithubAppWebhooksConfig,
  handlers: WebhookHandlers = {},
): Webhooks {
  const webhooks = new Webhooks({ secret: config.webhookSecret });

  webhooks.on("push", async ({ payload }) => {
    await handlers.onPush?.(payload);
  });

  webhooks.on("pull_request", async ({ payload }) => {
    await handlers.onPullRequest?.(payload);
  });

  webhooks.on("deployment_status", async ({ payload }) => {
    await handlers.onDeploymentStatus?.(payload);
  });

  return webhooks;
}
