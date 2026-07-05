import type { Pod } from "@vibeyeeter/types";

export async function listPods(_namespace: string): Promise<Pod[]> {
  // TODO: use @kubernetes/client-node CoreV1Api to list pods in namespace
  return [];
}

export async function getPodLogs(_namespace: string, _podName: string): Promise<string> {
  // TODO: stream pod logs via CoreV1Api
  return "";
}

export async function rolloutRestart(_namespace: string, _deploymentName: string): Promise<void> {
  // TODO: patch Deployment to trigger a rollout restart
}
