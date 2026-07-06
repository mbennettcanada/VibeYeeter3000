import type {
  ListAppsResponse,
  GetAppResponse,
  CreateAppRequest,
  CreateAppResponse,
  UpdateAppRequest,
  UpdateAppResponse,
  ListDeploymentsResponse,
  CreateDeploymentRequest,
  CreateDeploymentResponse,
  RollbackDeploymentResponse,
  ListPodsResponse,
  GetPodLogsResponse,
  ListSecretsResponse,
  CreateSecretRequest,
  CreateSecretResponse,
  UpdateSecretRequest,
  UpdateSecretResponse,
  ListTerraformRunsResponse,
  CreateTerraformRunRequest,
  CreateTerraformRunResponse,
  ListTeamsResponse,
  GetCurrentUserResponse,
  ListTeamsDetailResponse,
  CreateTeamRequest,
  CreateTeamResponse,
  UpdateTeamRequest,
  UpdateTeamResponse,
  AddTeamGroupRequest,
  AddTeamGroupResponse,
  ListApiTokensResponse,
  CreateApiTokenRequest,
  CreateApiTokenResponse,
  ListDomainsResponse,
  ListAllDomainsResponse,
  CreateDomainRequest,
  CreateDomainResponse,
  ListPlatformConfigResponse,
  UpdatePlatformConfigRequest,
  UpdatePlatformConfigResponse,
} from "@vibeyeeter/types";
import { getCfAccessLoginUrl } from "./cf-access";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3002";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (response.status === 401 && typeof window !== "undefined") {
    const loginUrl = getCfAccessLoginUrl(window.location.href);
    if (loginUrl) {
      window.location.href = loginUrl;
    }
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; detail?: string };
      detail = body.detail ?? body.error;
    } catch {
      // response had no JSON body — fall back to the generic message below
    }
    throw new Error(detail ?? `API request failed: ${response.status} ${path}`);
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

export function createDeployment(
  appId: string,
  body: CreateDeploymentRequest,
): Promise<CreateDeploymentResponse> {
  return apiFetch(`/apps/${appId}/deployments`, { method: "POST", body: JSON.stringify(body) });
}

export function rollbackDeployment(
  appId: string,
  deploymentId: string,
): Promise<RollbackDeploymentResponse> {
  return apiFetch(`/apps/${appId}/deployments/${deploymentId}/rollback`, { method: "POST" });
}

export function listPods(appId: string): Promise<ListPodsResponse> {
  return apiFetch(`/apps/${appId}/pods`);
}

export function getPodLogs(
  appId: string,
  podName: string,
  lines?: number,
): Promise<GetPodLogsResponse> {
  const query = lines ? `?lines=${lines}` : "";
  return apiFetch(`/apps/${appId}/pods/${podName}/logs${query}`);
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

export function rotateSecret(
  appId: string,
  key: string,
  body: UpdateSecretRequest,
): Promise<UpdateSecretResponse> {
  return apiFetch(`/apps/${appId}/secrets/${key}`, { method: "PUT", body: JSON.stringify(body) });
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

export function terraformStreamUrl(appId: string, runId?: string): string {
  const query = runId ? `?runId=${runId}` : "";
  return `${API_BASE_URL}/apps/${appId}/terraform/stream${query}`;
}

export function listTeamsDetail(): Promise<ListTeamsDetailResponse> {
  return apiFetch("/settings/teams");
}

export function createTeam(body: CreateTeamRequest): Promise<CreateTeamResponse> {
  return apiFetch("/settings/teams", { method: "POST", body: JSON.stringify(body) });
}

export function renameTeam(id: string, body: UpdateTeamRequest): Promise<UpdateTeamResponse> {
  return apiFetch(`/settings/teams/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteTeam(id: string): Promise<void> {
  return apiFetch(`/settings/teams/${id}`, { method: "DELETE" });
}

export function addTeamGroup(
  id: string,
  body: AddTeamGroupRequest,
): Promise<AddTeamGroupResponse> {
  return apiFetch(`/settings/teams/${id}/groups`, { method: "POST", body: JSON.stringify(body) });
}

export function removeTeamGroup(id: string, groupName: string): Promise<void> {
  return apiFetch(`/settings/teams/${id}/groups/${encodeURIComponent(groupName)}`, {
    method: "DELETE",
  });
}

export function listApiTokens(): Promise<ListApiTokensResponse> {
  return apiFetch("/settings/tokens");
}

export function createApiToken(body: CreateApiTokenRequest): Promise<CreateApiTokenResponse> {
  return apiFetch("/settings/tokens", { method: "POST", body: JSON.stringify(body) });
}

export function revokeApiToken(id: string): Promise<void> {
  return apiFetch(`/settings/tokens/${id}`, { method: "DELETE" });
}

export function listAllDomains(): Promise<ListAllDomainsResponse> {
  return apiFetch("/settings/domains");
}

export function listAppDomains(appId: string): Promise<ListDomainsResponse> {
  return apiFetch(`/apps/${appId}/domains`);
}

export function createAppDomain(
  appId: string,
  body: CreateDomainRequest,
): Promise<CreateDomainResponse> {
  return apiFetch(`/apps/${appId}/domains`, { method: "POST", body: JSON.stringify(body) });
}

export function deleteAppDomain(appId: string, domainId: string): Promise<void> {
  return apiFetch(`/apps/${appId}/domains/${domainId}`, { method: "DELETE" });
}

export function listPlatformConfig(): Promise<ListPlatformConfigResponse> {
  return apiFetch("/settings/config");
}

export function updatePlatformConfig(
  key: string,
  body: UpdatePlatformConfigRequest,
): Promise<UpdatePlatformConfigResponse> {
  return apiFetch(`/settings/config/${key}`, { method: "PUT", body: JSON.stringify(body) });
}
