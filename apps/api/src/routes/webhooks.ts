import type { FastifyInstance } from "fastify";
import { eq, and, isNull } from "drizzle-orm";
import { createWebhooks } from "@vibeyeeter/github-app";
import type {
  DeploymentStatusEvent,
  PullRequestEvent,
  PushEvent,
} from "@octokit/webhooks-types";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { apps, deployments } from "../db/schema.js";

function mapGithubStateToDeploymentStatus(
  state: DeploymentStatusEvent["deployment_status"]["state"],
): "pending" | "running" | "succeeded" | "failed" | "rolled_back" {
  switch (state) {
    case "success":
      return "succeeded";
    case "failure":
    case "error":
      return "failed";
    case "in_progress":
      return "running";
    case "queued":
    case "waiting":
    case "pending":
    default:
      return "pending";
  }
}

async function handlePush(request: { log: { info: (msg: string) => void; warn: (msg: string) => void } }, payload: PushEvent): Promise<void> {
  const defaultBranchRef = `refs/heads/${payload.repository.default_branch}`;
  if (payload.ref !== defaultBranchRef) {
    return;
  }

  const [app] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.repoUrl, payload.repository.html_url), isNull(apps.deletedAt)))
    .limit(1);

  if (!app) {
    request.log.warn(
      `push webhook for ${payload.repository.html_url} does not match any registered app`,
    );
    return;
  }

  const triggeredBy = payload.pusher.email ?? payload.pusher.name;

  await db.insert(deployments).values({
    appId: app.id,
    imageTag: payload.after.slice(0, 7),
    status: "pending",
    triggeredBy,
    // TODO: replace with a real queue (SQS/etc). githubDeploymentId stays
    // null until the enqueued job calls the GitHub Deployments API.
  });

  request.log.info(`would deploy here: app=${app.slug} imageTag=${payload.after.slice(0, 7)}`);
}

async function handleDeploymentStatus(
  request: { log: { warn: (msg: string) => void } },
  payload: DeploymentStatusEvent,
): Promise<void> {
  const [deployment] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.githubDeploymentId, payload.deployment.id))
    .limit(1);

  if (!deployment) {
    request.log.warn(
      `deployment_status webhook for GitHub deployment ${payload.deployment.id} does not match any tracked deployment`,
    );
    return;
  }

  await db
    .update(deployments)
    .set({ status: mapGithubStateToDeploymentStatus(payload.deployment_status.state) })
    .where(eq(deployments.id, deployment.id));
}

function handlePullRequest(
  request: { log: { info: (msg: string) => void } },
  payload: PullRequestEvent,
): void {
  request.log.info(
    `pull_request webhook: ${payload.repository.full_name}#${payload.number} ${payload.action}`,
  );
}

export async function webhooksRoutes(app: FastifyInstance): Promise<void> {
  app.post("/webhooks/github", async (request, reply) => {
    if (!config.github.webhookSecret) {
      reply
        .code(503)
        .send({ error: "not_configured", detail: "GITHUB_WEBHOOK_SECRET is not set" });
      return;
    }

    const signature = request.headers["x-hub-signature-256"];
    const eventName = request.headers["x-github-event"];
    const deliveryId = request.headers["x-github-delivery"];

    if (
      typeof signature !== "string" ||
      typeof eventName !== "string" ||
      typeof deliveryId !== "string"
    ) {
      reply
        .code(401)
        .send({ error: "unauthorized", detail: "missing required GitHub webhook headers" });
      return;
    }

    const webhooks = createWebhooks(
      { webhookSecret: config.github.webhookSecret },
      {
        onPush: (payload) => handlePush(request, payload),
        onDeploymentStatus: (payload) => handleDeploymentStatus(request, payload),
        onPullRequest: (payload) => Promise.resolve(handlePullRequest(request, payload)),
      },
    );

    try {
      await webhooks.verifyAndReceive({
        id: deliveryId,
        name: eventName as never,
        payload: request.rawBody ?? JSON.stringify(request.body),
        signature,
      });
    } catch (error) {
      request.log.warn(`webhook signature verification failed: ${(error as Error).message}`);
      reply.code(401).send({ error: "unauthorized", detail: "invalid signature" });
      return;
    }

    reply.send({ received: true });
  });
}
