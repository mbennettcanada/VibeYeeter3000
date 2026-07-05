import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
  NetworkingV1Api,
  PatchUtils,
  type V1Deployment,
} from "@kubernetes/client-node";
import type { Pod } from "@vibeyeeter/types";

const FIELD_MANAGER = "vibeyeeter";
const APPLY_PATCH_OPTIONS = {
  headers: { "Content-Type": PatchUtils.PATCH_FORMAT_APPLY_YAML },
};

function kubeconfigPath(): string {
  return process.env.KUBECONFIG ?? path.join(os.homedir(), ".kube", "config");
}

// Real EKS access via IRSA comes later — for now this just looks for a local
// kubeconfig. Unlike KubeConfig#loadFromDefault() (which silently falls back
// to a fake localhost:8080 cluster when nothing is found), this is a real
// "is anything configured at all" check so callers can degrade gracefully.
export function isKubernetesConfigured(): boolean {
  return existsSync(kubeconfigPath());
}

let cachedKubeConfig: KubeConfig | undefined;

function loadKubeConfig(): KubeConfig {
  if (!isKubernetesConfigured()) {
    throw new Error(
      `No kubeconfig found at ${kubeconfigPath()}. Set KUBECONFIG or place a config at ~/.kube/config.`,
    );
  }
  if (!cachedKubeConfig) {
    cachedKubeConfig = new KubeConfig();
    cachedKubeConfig.loadFromDefault();
  }
  return cachedKubeConfig;
}

function coreV1(): CoreV1Api {
  return loadKubeConfig().makeApiClient(CoreV1Api);
}

function appsV1(): AppsV1Api {
  return loadKubeConfig().makeApiClient(AppsV1Api);
}

function networkingV1(): NetworkingV1Api {
  return loadKubeConfig().makeApiClient(NetworkingV1Api);
}

export function namespaceFor(appId: string): string {
  return `vibeyeeter-${appId}`;
}

function standardLabels(appId: string): Record<string, string> {
  return {
    "app.kubernetes.io/managed-by": "vibeyeeter",
    "app.kubernetes.io/instance": appId,
  };
}

function isConflict(error: unknown): boolean {
  return (error as { response?: { statusCode?: number } } | undefined)?.response?.statusCode === 409;
}

function isNotFound(error: unknown): boolean {
  return (error as { response?: { statusCode?: number } } | undefined)?.response?.statusCode === 404;
}

// ---------------------------------------------------------------------------
// Namespace management
// ---------------------------------------------------------------------------

export async function ensureNamespace(appId: string): Promise<void> {
  const namespace = namespaceFor(appId);
  try {
    await coreV1().createNamespace({
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: namespace, labels: standardLabels(appId) },
    });
  } catch (error) {
    if (isConflict(error)) {
      return;
    }
    throw error;
  }
}

export async function deleteNamespace(appId: string): Promise<void> {
  try {
    await coreV1().deleteNamespace(namespaceFor(appId));
  } catch (error) {
    if (isNotFound(error)) {
      return;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Deployment management
// ---------------------------------------------------------------------------

const APP_CONTAINER_NAME = "app";
const APP_DEPLOYMENT_NAME = "app";
const APP_PORT = 3000;

function buildDeploymentManifest(
  appId: string,
  imageTag: string,
  opts: { replicas?: number; envVars?: Record<string, string> },
): V1Deployment {
  const namespace = namespaceFor(appId);
  const labels = { app: APP_DEPLOYMENT_NAME, ...standardLabels(appId) };

  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: APP_DEPLOYMENT_NAME,
      namespace,
      labels,
    },
    spec: {
      replicas: opts.replicas ?? 1,
      selector: { matchLabels: labels },
      template: {
        metadata: { labels },
        spec: {
          containers: [
            {
              name: APP_CONTAINER_NAME,
              image: imageTag,
              imagePullPolicy: "Always",
              ports: [{ containerPort: APP_PORT }],
              env: Object.entries(opts.envVars ?? {}).map(([name, value]) => ({ name, value })),
              resources: {
                requests: { memory: "256Mi", cpu: "250m" },
                limits: { memory: "256Mi", cpu: "250m" },
              },
              livenessProbe: {
                httpGet: { path: "/", port: APP_PORT },
                initialDelaySeconds: 10,
                periodSeconds: 10,
              },
              readinessProbe: {
                httpGet: { path: "/", port: APP_PORT },
                initialDelaySeconds: 5,
                periodSeconds: 5,
              },
            },
          ],
        },
      },
    },
  };
}

export async function applyDeployment(
  appId: string,
  imageTag: string,
  opts: { replicas?: number; envVars?: Record<string, string> } = {},
): Promise<void> {
  const namespace = namespaceFor(appId);
  const manifest = buildDeploymentManifest(appId, imageTag, opts);

  await appsV1().patchNamespacedDeployment(
    APP_DEPLOYMENT_NAME,
    namespace,
    manifest,
    undefined,
    undefined,
    FIELD_MANAGER,
    undefined,
    true,
    APPLY_PATCH_OPTIONS,
  );
}

export interface DeploymentStatus {
  available: number;
  desired: number;
  ready: number;
  updatedReplicas: number;
}

export async function getDeploymentStatus(appId: string): Promise<DeploymentStatus> {
  const namespace = namespaceFor(appId);
  const { body } = await appsV1().readNamespacedDeployment(APP_DEPLOYMENT_NAME, namespace);

  return {
    available: body.status?.availableReplicas ?? 0,
    desired: body.spec?.replicas ?? 0,
    ready: body.status?.readyReplicas ?? 0,
    updatedReplicas: body.status?.updatedReplicas ?? 0,
  };
}

// Semantically distinct from applyDeployment (a rollback re-applies a prior
// image rather than a newly built one) but mechanically identical.
export async function rollbackDeployment(appId: string, imageTag: string): Promise<void> {
  await applyDeployment(appId, imageTag);
}

// ---------------------------------------------------------------------------
// Pods
// ---------------------------------------------------------------------------

function formatAge(creationTimestamp: Date | undefined): string {
  if (!creationTimestamp) {
    return "unknown";
  }
  const ageMs = Date.now() - new Date(creationTimestamp).getTime();
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) {
    return `${Math.max(minutes, 0)}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export async function listPods(appId: string): Promise<Pod[]> {
  const namespace = namespaceFor(appId);
  const { body } = await coreV1().listNamespacedPod(
    namespace,
    undefined,
    undefined,
    undefined,
    undefined,
    `app.kubernetes.io/instance=${appId}`,
  );

  return body.items.map((item) => {
    const restarts =
      item.status?.containerStatuses?.reduce((sum, status) => sum + status.restartCount, 0) ?? 0;

    return {
      name: item.metadata?.name ?? "unknown",
      status: item.status?.phase ?? "Unknown",
      restarts,
      age: formatAge(item.metadata?.creationTimestamp),
      image: item.spec?.containers?.[0]?.image ?? "unknown",
    };
  });
}

export async function getPodLogs(appId: string, podName: string, lines = 100): Promise<string> {
  const namespace = namespaceFor(appId);
  const { body } = await coreV1().readNamespacedPodLog(
    podName,
    namespace,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    lines,
  );
  return body;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const APP_SERVICE_NAME = "app";

export async function ensureService(appId: string): Promise<void> {
  const namespace = namespaceFor(appId);
  const labels = { app: APP_DEPLOYMENT_NAME, ...standardLabels(appId) };

  await coreV1().patchNamespacedService(
    APP_SERVICE_NAME,
    namespace,
    {
      apiVersion: "v1",
      kind: "Service",
      metadata: { name: APP_SERVICE_NAME, namespace, labels },
      spec: {
        type: "ClusterIP",
        selector: labels,
        ports: [{ port: APP_PORT, targetPort: APP_PORT }],
      },
    },
    undefined,
    undefined,
    FIELD_MANAGER,
    undefined,
    true,
    APPLY_PATCH_OPTIONS,
  );
}

// ---------------------------------------------------------------------------
// Ingress
// ---------------------------------------------------------------------------

const APP_INGRESS_NAME = "app";

export async function ensureIngress(appId: string, subdomain: string): Promise<void> {
  const namespace = namespaceFor(appId);
  const labels = standardLabels(appId);
  const host = `${subdomain}.internal`;

  await networkingV1().patchNamespacedIngress(
    APP_INGRESS_NAME,
    namespace,
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: {
        name: APP_INGRESS_NAME,
        namespace,
        labels,
        annotations: { "kubernetes.io/ingress.class": "nginx" },
      },
      spec: {
        rules: [
          {
            host,
            http: {
              paths: [
                {
                  path: "/",
                  pathType: "Prefix",
                  backend: {
                    service: { name: APP_SERVICE_NAME, port: { number: APP_PORT } },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    undefined,
    undefined,
    FIELD_MANAGER,
    undefined,
    true,
    APPLY_PATCH_OPTIONS,
  );
}

export async function deleteIngress(appId: string): Promise<void> {
  try {
    await networkingV1().deleteNamespacedIngress(APP_INGRESS_NAME, namespaceFor(appId));
  } catch (error) {
    if (isNotFound(error)) {
      return;
    }
    throw error;
  }
}
