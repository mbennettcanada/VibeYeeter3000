#!/usr/bin/env tsx
/**
 * Rancher Desktop end-to-end smoke test for VibeYeeter3000.
 *
 * Exercises the full app lifecycle against the real local k3s cluster:
 *   1. Verify rancher-desktop kubectl context is active
 *   2. Verify cluster is reachable
 *   3. Seed a smoke-test team row in the DB (idempotent)
 *   4. POST /apps  → create test app
 *   5. Verify namespace vibeyeeter-<appId> exists in cluster
 *   6. POST /apps/:id/deployments  { imageTag: "nginx:latest" }
 *   7. Poll GET /apps/:id/pods every 5 s until all pods are Running (timeout 120 s)
 *   8. Print final pod status
 *   9. DELETE /apps/:id  (soft-deletes record + deletes namespace)
 *  10. Verify namespace is gone (timeout 30 s)
 *
 * Prerequisites:
 *   - Rancher Desktop installed and running (rancher-desktop context active)
 *   - kubectl on PATH
 *   - psql on PATH (postgres CLI — brew install libpq)
 *   - Platform API running on localhost:3002 with DEV_AUTH_BYPASS=true
 *   - Postgres running on localhost:5432 (docker compose -f docker-compose.dev.yml up -d)
 *
 * Usage:
 *   npx tsx scripts/k8s-smoke-test.ts
 */

import { spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = process.env.API_URL ?? "http://localhost:3002";
const DB_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:dev@localhost:5432/vibeyeeter";
const POLL_INTERVAL_MS = 5_000;
const POD_TIMEOUT_MS = 120_000;
const NS_DELETE_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string): void {
  console.log(`[smoke] ${msg}`);
}

class SmokeTestError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SmokeTestError";
  }
}

/** Throw a SmokeTestError so the outer catch in main() can run cleanup before exit. */
function fail(msg: string): never {
  throw new SmokeTestError(msg);
}

// ---------------------------------------------------------------------------
// kubectl helpers
// ---------------------------------------------------------------------------

function kubectl(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("kubectl", args, { encoding: "utf-8" });
  if (result.error) {
    fail(
      `kubectl not found on PATH: ${result.error.message}\n` +
        "Install via Rancher Desktop or brew install kubectl",
    );
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

function kubectlOrFail(args: string[]): string {
  const r = kubectl(args);
  if (!r.ok) fail(`kubectl ${args.join(" ")} failed:\n${r.stderr}`);
  return r.stdout;
}

function namespaceExists(ns: string): boolean {
  const r = kubectl(["get", "namespace", ns, "--output=name", "--ignore-not-found"]);
  return r.ok && r.stdout.length > 0;
}

// ---------------------------------------------------------------------------
// DB helper (psql)
// ---------------------------------------------------------------------------

function sql(query: string): string {
  const result = spawnSync("psql", [DB_URL, "--tuples-only", "--no-align", "-c", query], {
    encoding: "utf-8",
  });
  if (result.error) {
    fail(
      `psql not found on PATH: ${result.error.message}\n` +
        "Install via: brew install libpq && brew link --force libpq",
    );
  }
  if (result.status !== 0) {
    fail(`psql query failed:\n${result.stderr}\nQuery: ${query}`);
  }
  return result.stdout?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

interface ApiResponse {
  status: number;
  body: unknown;
}

async function api(method: string, path: string, body?: unknown): Promise<ApiResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

// ---------------------------------------------------------------------------
// Poll helper
// ---------------------------------------------------------------------------

type Pod = { name: string; status: string; restarts: number; image: string };

async function pollPodsUntilRunning(appId: string): Promise<Pod[]> {
  const deadline = Date.now() + POD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { status, body } = await api("GET", `/apps/${appId}/pods`);
    if (status === 200) {
      const pods = (body as { pods: Pod[] }).pods;
      if (pods.length > 0 && pods.every((p) => p.status === "Running")) {
        return pods;
      }
      if (pods.length === 0) {
        log("  waiting for pods to be scheduled...");
      } else {
        const summary = pods.map((p) => `${p.name}=${p.status}`).join(", ");
        log(`  pods: [${summary}]`);
      }
    } else {
      log(`  GET /pods returned ${status}, retrying...`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  fail(`Timed out after ${POD_TIMEOUT_MS / 1000}s waiting for pods to reach Running phase`);
}

// ---------------------------------------------------------------------------
// Cleanup (best-effort, called in finally)
// ---------------------------------------------------------------------------

async function cleanup(appId: string | undefined): Promise<void> {
  if (!appId) return;
  log("(cleanup) deleting app record...");
  try {
    await api("DELETE", `/apps/${appId}`);
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("=".repeat(60));
  log("VibeYeeter3000 Rancher Desktop smoke test");
  log("=".repeat(60));

  let appId: string | undefined;

  try {
    // -----------------------------------------------------------------------
    // 1. Verify rancher-desktop context
    // -----------------------------------------------------------------------
    log("\n[1] Checking kubectl context...");
    const ctx = kubectlOrFail(["config", "current-context"]);
    if (ctx !== "rancher-desktop") {
      fail(
        `Expected context "rancher-desktop" but got "${ctx}".\n` +
          "Run: kubectl config use-context rancher-desktop",
      );
    }
    log(`    context: ${ctx} ✓`);

    // -----------------------------------------------------------------------
    // 2. Verify cluster reachable
    // -----------------------------------------------------------------------
    log("\n[2] Verifying cluster is reachable...");
    kubectlOrFail(["cluster-info", "--request-timeout=10s"]);
    log("    cluster reachable ✓");

    // -----------------------------------------------------------------------
    // 3. Verify API is up
    // -----------------------------------------------------------------------
    log("\n[3] Verifying API is reachable...");
    let healthRes: ApiResponse;
    try {
      healthRes = await api("GET", "/health");
    } catch (e) {
      fail(
        `Cannot reach API at ${API_BASE}/health: ${String(e)}\n` +
          "Start it with: pnpm --filter @vibeyeeter/api dev",
      );
    }
    if (healthRes.status !== 200) {
      fail(`GET /health returned ${healthRes.status}`);
    }
    log(`    API at ${API_BASE} ✓`);

    // -----------------------------------------------------------------------
    // 4. Seed smoke-test team (idempotent)
    // -----------------------------------------------------------------------
    log("\n[4] Ensuring smoke-test team exists in DB...");
    const teamSlug = "smoke-team";
    const existingRows = sql(
      `SELECT id FROM teams WHERE slug = '${teamSlug}' LIMIT 1`,
    );
    let teamId: string;
    if (existingRows && existingRows.length > 0) {
      teamId = existingRows.trim();
      log(`    using existing team: ${teamId}`);
    } else {
      sql(
        `INSERT INTO teams (name, slug) VALUES ('Smoke Test Team', '${teamSlug}')`,
      );
      const newId = sql(
        `SELECT id FROM teams WHERE slug = '${teamSlug}' LIMIT 1`,
      );
      teamId = newId.trim();
      log(`    created team: ${teamId}`);
    }

    // -----------------------------------------------------------------------
    // 5. Create app via API
    // -----------------------------------------------------------------------
    log("\n[5] Creating app via POST /apps...");
    const ts = Date.now();
    const appName = `Smoke Test ${ts}`;
    const subdomain = `smoke-${ts}`;
    const { status: createStatus, body: createBody } = await api("POST", "/apps", {
      name: appName,
      teamId,
      subdomain,
      repoUrl: `https://github.com/${process.env.GITHUB_ORG ?? "your-org"}/smoke-test-${ts}`,
    });

    if (createStatus !== 201) {
      fail(`POST /apps returned ${createStatus}:\n${JSON.stringify(createBody, null, 2)}`);
    }

    const created = createBody as { app: { id: string; namespace: string }; warnings?: string[] };
    appId = created.app.id;
    const namespace = `vibeyeeter-${appId}`;

    log(`    app created: id=${appId}`);
    log(`    namespace:   ${namespace}`);
    if (created.warnings?.length) {
      for (const w of created.warnings) log(`    warning: ${w}`);
    }

    // -----------------------------------------------------------------------
    // 6. Verify namespace exists in cluster
    // -----------------------------------------------------------------------
    log("\n[6] Verifying namespace exists in cluster...");
    if (!namespaceExists(namespace)) {
      fail(
        `Namespace "${namespace}" not found in cluster after app creation.\n` +
          "Check that the API has a valid kubeconfig (rancher-desktop context).",
      );
    }
    log(`    namespace ${namespace} ✓`);

    // -----------------------------------------------------------------------
    // 7. Trigger deployment
    // -----------------------------------------------------------------------
    log("\n[7] Triggering deployment via POST /apps/:id/deployments...");
    const { status: deployStatus, body: deployBody } = await api(
      "POST",
      `/apps/${appId}/deployments`,
      { imageTag: "nginx:latest" },
    );

    if (deployStatus !== 201) {
      fail(
        `POST /apps/${appId}/deployments returned ${deployStatus}:\n` +
          JSON.stringify(deployBody, null, 2),
      );
    }

    const deploy = deployBody as { deployment: { id: string }; warnings?: string[] };
    log(`    deployment created: ${deploy.deployment.id} ✓`);
    if (deploy.warnings?.length) {
      for (const w of deploy.warnings) log(`    warning: ${w}`);
    }

    // -----------------------------------------------------------------------
    // 8. Poll pods until Running
    // -----------------------------------------------------------------------
    log(`\n[8] Polling pods every ${POLL_INTERVAL_MS / 1000}s (timeout ${POD_TIMEOUT_MS / 1000}s)...`);
    log("    (nginx:latest may need to pull on first run — this can take ~30s)");
    const pods = await pollPodsUntilRunning(appId);
    log("    All pods Running:");
    for (const pod of pods) {
      log(`      ${pod.name}  status=${pod.status}  restarts=${pod.restarts}  image=${pod.image}`);
    }

    // -----------------------------------------------------------------------
    // 9. Teardown: delete app
    // -----------------------------------------------------------------------
    log("\n[9] Teardown: DELETE /apps/:id...");
    const { status: deleteStatus } = await api("DELETE", `/apps/${appId}`);
    if (deleteStatus !== 204) {
      fail(`DELETE /apps/${appId} returned ${deleteStatus}`);
    }
    appId = undefined; // prevent double-cleanup
    log("    app deleted ✓");

    // -----------------------------------------------------------------------
    // 10. Verify namespace is gone
    // -----------------------------------------------------------------------
    log("\n[10] Waiting for namespace to be deleted from cluster...");
    const nsDeadline = Date.now() + NS_DELETE_TIMEOUT_MS;
    let nsGone = false;
    while (Date.now() < nsDeadline) {
      if (!namespaceExists(namespace)) {
        nsGone = true;
        break;
      }
      log("     namespace still exists (terminating), waiting 2 s...");
      await new Promise((r) => setTimeout(r, 2_000));
    }
    if (!nsGone) {
      fail(
        `Namespace "${namespace}" still present ${NS_DELETE_TIMEOUT_MS / 1000}s after DELETE.\n` +
          `Check: kubectl get namespace ${namespace}`,
      );
    }
    log(`    namespace ${namespace} deleted ✓`);

    // -----------------------------------------------------------------------
    // Done
    // -----------------------------------------------------------------------
    log("\n" + "=".repeat(60));
    log("✓ Smoke test PASSED");
    log("=".repeat(60));
  } catch (e) {
    await cleanup(appId);
    if (e instanceof SmokeTestError) {
      console.error(`\n[smoke] ✗ FAIL: ${e.message}`);
    } else {
      console.error("\n[smoke] ✗ FAIL (unhandled error):", e);
    }
    process.exit(1);
  }
}

main();
