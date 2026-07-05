import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createNamespace: vi.fn(),
  deleteNamespace: vi.fn(),
  patchNamespacedDeployment: vi.fn(),
  readNamespacedDeployment: vi.fn(),
  listNamespacedPod: vi.fn(),
  readNamespacedPodLog: vi.fn(),
  patchNamespacedService: vi.fn(),
  patchNamespacedIngress: vi.fn(),
  deleteNamespacedIngress: vi.fn(),
  createNamespacedJob: vi.fn(),
  readNamespacedJobStatus: vi.fn(),
  loadFromDefault: vi.fn(),
}));

vi.mock("@kubernetes/client-node", () => {
  class FakeCoreV1Api {
    createNamespace = mocks.createNamespace;
    deleteNamespace = mocks.deleteNamespace;
    listNamespacedPod = mocks.listNamespacedPod;
    readNamespacedPodLog = mocks.readNamespacedPodLog;
    patchNamespacedService = mocks.patchNamespacedService;
  }
  class FakeAppsV1Api {
    patchNamespacedDeployment = mocks.patchNamespacedDeployment;
    readNamespacedDeployment = mocks.readNamespacedDeployment;
  }
  class FakeNetworkingV1Api {
    patchNamespacedIngress = mocks.patchNamespacedIngress;
    deleteNamespacedIngress = mocks.deleteNamespacedIngress;
  }
  class FakeBatchV1Api {
    createNamespacedJob = mocks.createNamespacedJob;
    readNamespacedJobStatus = mocks.readNamespacedJobStatus;
  }
  class FakeKubeConfig {
    loadFromDefault = mocks.loadFromDefault;
    makeApiClient(ctor: unknown) {
      if (ctor === FakeCoreV1Api) return new FakeCoreV1Api();
      if (ctor === FakeAppsV1Api) return new FakeAppsV1Api();
      if (ctor === FakeNetworkingV1Api) return new FakeNetworkingV1Api();
      if (ctor === FakeBatchV1Api) return new FakeBatchV1Api();
      throw new Error("unexpected api client type requested in test");
    }
  }

  return {
    KubeConfig: FakeKubeConfig,
    CoreV1Api: FakeCoreV1Api,
    AppsV1Api: FakeAppsV1Api,
    NetworkingV1Api: FakeNetworkingV1Api,
    BatchV1Api: FakeBatchV1Api,
    PatchUtils: { PATCH_FORMAT_APPLY_YAML: "application/apply-patch+yaml" },
  };
});

let kubeconfigDir: string;
const ORIGINAL_KUBECONFIG = process.env.KUBECONFIG;

beforeAll(() => {
  kubeconfigDir = mkdtempSync(path.join(os.tmpdir(), "kubernetes-test-"));
  writeFileSync(path.join(kubeconfigDir, "config"), "# fake kubeconfig for tests\n");
  process.env.KUBECONFIG = path.join(kubeconfigDir, "config");
});

afterAll(() => {
  process.env.KUBECONFIG = ORIGINAL_KUBECONFIG;
  rmSync(kubeconfigDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isKubernetesConfigured", () => {
  it("returns true when the kubeconfig file exists", async () => {
    const { isKubernetesConfigured } = await import("./kubernetes.js");
    expect(isKubernetesConfigured()).toBe(true);
  });

  it("returns false when the kubeconfig file does not exist", async () => {
    const previous = process.env.KUBECONFIG;
    process.env.KUBECONFIG = path.join(kubeconfigDir, "does-not-exist");
    const { isKubernetesConfigured } = await import("./kubernetes.js");
    expect(isKubernetesConfigured()).toBe(false);
    process.env.KUBECONFIG = previous;
  });
});

describe("ensureNamespace", () => {
  it("creates the namespace", async () => {
    mocks.createNamespace.mockResolvedValueOnce({});
    const { ensureNamespace, namespaceFor } = await import("./kubernetes.js");

    await ensureNamespace("app-123");

    expect(mocks.createNamespace).toHaveBeenCalledTimes(1);
    const [manifest] = mocks.createNamespace.mock.calls[0] as [{ metadata: { name: string } }];
    expect(manifest.metadata.name).toBe(namespaceFor("app-123"));
  });

  it("is idempotent — a 409 Conflict is treated as success", async () => {
    mocks.createNamespace.mockRejectedValueOnce({ response: { statusCode: 409 } });
    const { ensureNamespace } = await import("./kubernetes.js");

    await expect(ensureNamespace("app-123")).resolves.toBeUndefined();
  });

  it("rethrows other errors", async () => {
    mocks.createNamespace.mockRejectedValueOnce({ response: { statusCode: 500 } });
    const { ensureNamespace } = await import("./kubernetes.js");

    await expect(ensureNamespace("app-123")).rejects.toBeDefined();
  });
});

describe("deleteNamespace", () => {
  it("treats a 404 as success", async () => {
    mocks.deleteNamespace.mockRejectedValueOnce({ response: { statusCode: 404 } });
    const { deleteNamespace } = await import("./kubernetes.js");

    await expect(deleteNamespace("app-123")).resolves.toBeUndefined();
  });
});

describe("applyDeployment", () => {
  it("constructs the expected manifest and uses server-side apply", async () => {
    mocks.patchNamespacedDeployment.mockResolvedValueOnce({});
    const { applyDeployment, namespaceFor } = await import("./kubernetes.js");

    await applyDeployment("app-123", "registry/app:abc123", {
      replicas: 3,
      envVars: { FOO: "bar" },
    });

    expect(mocks.patchNamespacedDeployment).toHaveBeenCalledTimes(1);
    const [name, namespace, manifest, , , fieldManager, , force, options] = mocks
      .patchNamespacedDeployment.mock.calls[0] as [
      string,
      string,
      {
        spec: {
          replicas: number;
          template: {
            spec: {
              containers: Array<{
                name: string;
                image: string;
                imagePullPolicy: string;
                env: Array<{ name: string; value: string }>;
                ports: Array<{ containerPort: number }>;
              }>;
            };
          };
        };
      },
      unknown,
      unknown,
      string,
      unknown,
      boolean,
      { headers: Record<string, string> },
    ];

    expect(name).toBe("app");
    expect(namespace).toBe(namespaceFor("app-123"));
    expect(fieldManager).toBe("vibeyeeter");
    expect(force).toBe(true);
    expect(options.headers["Content-Type"]).toBe("application/apply-patch+yaml");

    expect(manifest.spec.replicas).toBe(3);
    const container = manifest.spec.template.spec.containers[0];
    expect(container?.name).toBe("app");
    expect(container?.image).toBe("registry/app:abc123");
    expect(container?.imagePullPolicy).toBe("Always");
    expect(container?.ports).toEqual([{ containerPort: 3000 }]);
    expect(container?.env).toEqual([{ name: "FOO", value: "bar" }]);
  });

  it("defaults to 1 replica and no env vars", async () => {
    mocks.patchNamespacedDeployment.mockResolvedValueOnce({});
    const { applyDeployment } = await import("./kubernetes.js");

    await applyDeployment("app-123", "registry/app:latest");

    const [, , manifest] = mocks.patchNamespacedDeployment.mock.calls[0] as [
      string,
      string,
      { spec: { replicas: number; template: { spec: { containers: Array<{ env: unknown[] }> } } } },
    ];
    expect(manifest.spec.replicas).toBe(1);
    expect(manifest.spec.template.spec.containers[0]?.env).toEqual([]);
  });
});

describe("getDeploymentStatus", () => {
  it("maps the Deployment status fields", async () => {
    mocks.readNamespacedDeployment.mockResolvedValueOnce({
      body: {
        spec: { replicas: 3 },
        status: { availableReplicas: 2, readyReplicas: 2, updatedReplicas: 3 },
      },
    });
    const { getDeploymentStatus } = await import("./kubernetes.js");

    await expect(getDeploymentStatus("app-123")).resolves.toEqual({
      available: 2,
      desired: 3,
      ready: 2,
      updatedReplicas: 3,
    });
  });

  it("defaults missing status fields to 0", async () => {
    mocks.readNamespacedDeployment.mockResolvedValueOnce({ body: {} });
    const { getDeploymentStatus } = await import("./kubernetes.js");

    await expect(getDeploymentStatus("app-123")).resolves.toEqual({
      available: 0,
      desired: 0,
      ready: 0,
      updatedReplicas: 0,
    });
  });
});

describe("rollbackDeployment", () => {
  it("re-applies the deployment with the given image tag", async () => {
    mocks.patchNamespacedDeployment.mockResolvedValueOnce({});
    const { rollbackDeployment } = await import("./kubernetes.js");

    await rollbackDeployment("app-123", "registry/app:previous");

    const [, , manifest] = mocks.patchNamespacedDeployment.mock.calls[0] as [
      string,
      string,
      { spec: { template: { spec: { containers: Array<{ image: string }> } } } },
    ];
    expect(manifest.spec.template.spec.containers[0]?.image).toBe("registry/app:previous");
  });
});

describe("listPods", () => {
  it("maps pods and sums container restarts", async () => {
    mocks.listNamespacedPod.mockResolvedValueOnce({
      body: {
        items: [
          {
            metadata: { name: "app-abc123", creationTimestamp: new Date(Date.now() - 5 * 60_000) },
            status: {
              phase: "Running",
              containerStatuses: [{ restartCount: 2 }, { restartCount: 1 }],
            },
            spec: { containers: [{ image: "registry/app:abc123" }] },
          },
        ],
      },
    });
    const { listPods } = await import("./kubernetes.js");

    const pods = await listPods("app-123");

    expect(pods).toEqual([
      { name: "app-abc123", status: "Running", restarts: 3, age: "5m", image: "registry/app:abc123" },
    ]);
  });

  it("filters by the instance label selector", async () => {
    mocks.listNamespacedPod.mockResolvedValueOnce({ body: { items: [] } });
    const { listPods, namespaceFor } = await import("./kubernetes.js");

    await listPods("app-123");

    const [namespace, , , , , labelSelector] = mocks.listNamespacedPod.mock.calls[0] as [
      string,
      unknown,
      unknown,
      unknown,
      unknown,
      string,
    ];
    expect(namespace).toBe(namespaceFor("app-123"));
    expect(labelSelector).toBe("app.kubernetes.io/instance=app-123");
  });
});

describe("getPodLogs", () => {
  it("passes the pod name, namespace, and tail line count", async () => {
    mocks.readNamespacedPodLog.mockResolvedValueOnce({ body: "log line 1\nlog line 2\n" });
    const { getPodLogs, namespaceFor } = await import("./kubernetes.js");

    const logs = await getPodLogs("app-123", "app-abc123", 50);

    expect(logs).toBe("log line 1\nlog line 2\n");
    const [podName, namespace, container, follow, , , , , , tailLines] = mocks
      .readNamespacedPodLog.mock.calls[0] as [
      string,
      string,
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      number,
    ];
    expect(podName).toBe("app-abc123");
    expect(namespace).toBe(namespaceFor("app-123"));
    expect(container).toBeUndefined();
    expect(follow).toBeUndefined();
    expect(tailLines).toBe(50);
  });

  it("defaults to 100 lines", async () => {
    mocks.readNamespacedPodLog.mockResolvedValueOnce({ body: "" });
    const { getPodLogs } = await import("./kubernetes.js");

    await getPodLogs("app-123", "app-abc123");

    const call = mocks.readNamespacedPodLog.mock.calls[0] as unknown[];
    expect(call[9]).toBe(100);
  });
});

describe("ensureService", () => {
  it("patches a ClusterIP service targeting port 3000", async () => {
    mocks.patchNamespacedService.mockResolvedValueOnce({});
    const { ensureService } = await import("./kubernetes.js");

    await ensureService("app-123");

    const [, , manifest] = mocks.patchNamespacedService.mock.calls[0] as [
      string,
      string,
      { spec: { type: string; ports: Array<{ port: number; targetPort: number }> } },
    ];
    expect(manifest.spec.type).toBe("ClusterIP");
    expect(manifest.spec.ports).toEqual([{ port: 3000, targetPort: 3000 }]);
  });
});

describe("ensureIngress", () => {
  it("patches an ingress with nginx class and the subdomain host", async () => {
    mocks.patchNamespacedIngress.mockResolvedValueOnce({});
    const { ensureIngress } = await import("./kubernetes.js");

    await ensureIngress("app-123", "widget-factory");

    const [, , manifest] = mocks.patchNamespacedIngress.mock.calls[0] as [
      string,
      string,
      {
        metadata: { annotations: Record<string, string> };
        spec: { rules: Array<{ host: string }> };
      },
    ];
    expect(manifest.metadata.annotations["kubernetes.io/ingress.class"]).toBe("nginx");
    expect(manifest.spec.rules[0]?.host).toBe("widget-factory.internal");
  });
});

describe("deleteIngress", () => {
  it("treats a 404 as success", async () => {
    mocks.deleteNamespacedIngress.mockRejectedValueOnce({ response: { statusCode: 404 } });
    const { deleteIngress } = await import("./kubernetes.js");

    await expect(deleteIngress("app-123")).resolves.toBeUndefined();
  });
});

describe("ensureMigrationJob", () => {
  it("creates a Job and returns succeeded once the Job reports success", async () => {
    mocks.createNamespacedJob.mockResolvedValueOnce({});
    mocks.readNamespacedJobStatus.mockResolvedValueOnce({ body: { status: { succeeded: 1 } } });
    mocks.listNamespacedPod.mockResolvedValueOnce({
      body: { items: [{ metadata: { name: "migrate-app-123-abc-xyz" } }] },
    });
    mocks.readNamespacedPodLog.mockResolvedValueOnce({ body: "migrations applied\n" });

    const { ensureMigrationJob, namespaceFor } = await import("./kubernetes.js");

    const result = await ensureMigrationJob("app-123", "registry/app:abc123");

    expect(result).toEqual({ succeeded: true, logs: "migrations applied\n" });
    expect(mocks.createNamespacedJob).toHaveBeenCalledTimes(1);
    const [namespace, manifest] = mocks.createNamespacedJob.mock.calls[0] as [
      string,
      {
        spec: {
          template: { spec: { containers: Array<{ image: string; command: string[] }> } };
        };
      },
    ];
    expect(namespace).toBe(namespaceFor("app-123"));
    expect(manifest.spec.template.spec.containers[0]?.image).toBe("registry/app:abc123");
    expect(manifest.spec.template.spec.containers[0]?.command).toEqual(["npm", "run", "migrate"]);
  });

  it("returns succeeded: false when the Job reports failure", async () => {
    mocks.createNamespacedJob.mockResolvedValueOnce({});
    mocks.readNamespacedJobStatus.mockResolvedValueOnce({ body: { status: { failed: 1 } } });
    mocks.listNamespacedPod.mockResolvedValueOnce({
      body: { items: [{ metadata: { name: "migrate-app-123-abc-xyz" } }] },
    });
    mocks.readNamespacedPodLog.mockResolvedValueOnce({ body: "migration error\n" });

    const { ensureMigrationJob } = await import("./kubernetes.js");

    const result = await ensureMigrationJob("app-123", "registry/app:abc123");

    expect(result.succeeded).toBe(false);
    expect(result.logs).toBe("migration error\n");
  });
});
