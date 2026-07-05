import type {
  ListAppsResponse,
  GetAppResponse,
  CreateAppRequest,
  CreateAppResponse,
  UpdateAppRequest,
  UpdateAppResponse,
  ListDeploymentsResponse,
  RollbackDeploymentResponse,
  ListSecretsResponse,
  CreateSecretRequest,
  CreateSecretResponse,
  ListTerraformRunsResponse,
  CreateTerraformRunRequest,
  CreateTerraformRunResponse,
  ListTeamsResponse,
  GetCurrentUserResponse,
} from "@vibeyeeter/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3002";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${path}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function getCurrentUser(): Promise<GetCurrentUserResponse> {
  return apiFetch("/me");
}

export function listTeams(): Promise<ListTeamsResponse> {
  return apiFetch("/teams");
}

export function listApps(): Promise<ListAppsResponse> {
  return apiFetch("/apps");
}

export function getApp(id: string): Promise<GetAppResponse> {
  return apiFetch(`/apps/${id}`);
}

export function createApp(body: CreateAppRequest): Promise<CreateAppResponse> {
  return apiFetch("/apps", { method: "POST", body: JSON.stringify(body) });
}

export function updateApp(id: string, body: UpdateAppRequest): Promise<UpdateAppResponse> {
  return apiFetch(`/apps/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteApp(id: string): Promise<void> {
  return apiFetch(`/apps/${id}`, { method: "DELETE" });
}

export function listDeployments(appId: string): Promise<ListDeploymentsResponse> {
  return apiFetch(`/apps/${appId}/deployments`);
}

export function rollbackDeployment(
  appId: string,
  deploymentId: string,
): Promise<RollbackDeploymentResponse> {
  return apiFetch(`/apps/${appId}/deployments/${deploymentId}/rollback`, { method: "POST" });
}

export function listSecrets(appId: string): Promise<ListSecretsResponse> {
  return apiFetch(`/apps/${appId}/secrets`);
}

export function createSecret(
  appId: string,
  body: CreateSecretRequest,
): Promise<CreateSecretResponse> {
  return apiFetch(`/apps/${appId}/secrets`, { method: "POST", body: JSON.stringify(body) });
}

export function deleteSecret(appId: string, key: string): Promise<void> {
  return apiFetch(`/apps/${appId}/secrets/${key}`, { method: "DELETE" });
}

export function listTerraformRuns(appId: string): Promise<ListTerraformRunsResponse> {
  return apiFetch(`/apps/${appId}/terraform`);
}

export function createTerraformRun(
  appId: string,
  body: CreateTerraformRunRequest,
): Promise<CreateTerraformRunResponse> {
  return apiFetch(`/apps/${appId}/terraform`, { method: "POST", body: JSON.stringify(body) });
}
