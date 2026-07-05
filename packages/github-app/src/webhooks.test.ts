import { describe, it, expect, vi } from "vitest";
import { sign } from "@octokit/webhooks-methods";
import { createWebhooks } from "./webhooks.js";

const SECRET = "test-webhook-secret";

async function deliver(webhooks: ReturnType<typeof createWebhooks>, name: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const signature = await sign(SECRET, body);
  await webhooks.verifyAndReceive({
    id: "test-delivery-id",
    name: name as never,
    payload: body,
    signature,
  });
}

describe("createWebhooks", () => {
  it("calls onPush for a push event", async () => {
    const onPush = vi.fn().mockResolvedValue(undefined);
    const webhooks = createWebhooks({ webhookSecret: SECRET }, { onPush });

    const payload = { ref: "refs/heads/main", repository: { full_name: "acme/widget-factory" } };
    await deliver(webhooks, "push", payload);

    expect(onPush).toHaveBeenCalledWith(expect.objectContaining({ ref: "refs/heads/main" }));
  });

  it("calls onDeploymentStatus for a deployment_status event", async () => {
    const onDeploymentStatus = vi.fn().mockResolvedValue(undefined);
    const webhooks = createWebhooks({ webhookSecret: SECRET }, { onDeploymentStatus });

    const payload = {
      deployment: { id: 999 },
      deployment_status: { state: "success" },
      repository: { full_name: "acme/widget-factory" },
    };
    await deliver(webhooks, "deployment_status", payload);

    expect(onDeploymentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ deployment: expect.objectContaining({ id: 999 }) }),
    );
  });

  it("calls onPullRequest for a pull_request event", async () => {
    const onPullRequest = vi.fn().mockResolvedValue(undefined);
    const webhooks = createWebhooks({ webhookSecret: SECRET }, { onPullRequest });

    const payload = { action: "opened", number: 7, repository: { full_name: "acme/widget-factory" } };
    await deliver(webhooks, "pull_request", payload);

    expect(onPullRequest).toHaveBeenCalledWith(expect.objectContaining({ number: 7 }));
  });

  it("rejects a payload with an invalid signature", async () => {
    const onPush = vi.fn();
    const webhooks = createWebhooks({ webhookSecret: SECRET }, { onPush });

    const body = JSON.stringify({ ref: "refs/heads/main", repository: {} });

    await expect(
      webhooks.verifyAndReceive({
        id: "test-delivery-id",
        name: "push" as never,
        payload: body,
        signature: "sha256=not-a-valid-signature",
      }),
    ).rejects.toThrow();

    expect(onPush).not.toHaveBeenCalled();
  });
});
