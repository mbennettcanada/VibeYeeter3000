import type { App } from "./app.js";
import type { Deployment } from "./deployment.js";
import type { Migration } from "./migration.js";
import type { Secret } from "./secret.js";
import type { TerraformRun, TerraformRunType } from "./terraform.js";
import type { Pod } from "./pod.js";
import type { Team } from "./team.js";
import type { User } from "./user.js";

export interface ApiErrorResponse {
  error: string;
  detail?: string;
}

// GET /apps
export interface ListAppsResponse {
  apps: App[];
}

// GET /apps/:id
export interface GetAppResponse {
  app: App;
  pods: Pod[];
}

// POST /apps
export interface CreateAppRequest {
  name: string;
  teamId: string;
  subdomain: string;
  repoUrl: string;
}
export interface CreateAppResponse {
  app: App;
  warnings?: string[];
}

// PATCH /apps/:id
export interface UpdateAppRequest {
  name?: string;
  subdomain?: string;
  repoUrl?: string;
}
export interface UpdateAppResponse {
  app: App;
}

// GET /apps/:id/deployments
export interface ListDeploymentsResponse {
  deployments: Deployment[];
}

// POST /apps/:id/deployments
export interface CreateDeploymentRequest {
  imageTag: string;
}
export interface CreateDeploymentResponse {
  deployment: Deployment;
  warnings?: string[];
}

// POST /apps/:id/deployments/:deploymentId/rollback
export interface RollbackDeploymentResponse {
  deployment: Deployment;
  warnings?: string[];
}

// GET /apps/:id/pods
export interface ListPodsResponse {
  pods: Pod[];
}

// GET /apps/:id/pods/:podName/logs
export interface GetPodLogsResponse {
  logs: string;
}

// GET /apps/:id/migrations
export interface ListMigrationsResponse {
  migrations: Migration[];
}

// GET /apps/:id/secrets
export interface ListSecretsResponse {
  secrets: Secret[];
}

// POST /apps/:id/secrets
export interface CreateSecretRequest {
  key: string;
  value: string;
}
export interface CreateSecretResponse {
  secret: Secret;
}

// GET /apps/:id/terraform
export interface ListTerraformRunsResponse {
  runs: TerraformRun[];
}

// POST /apps/:id/terraform
export interface CreateTerraformRunRequest {
  type: TerraformRunType;
}
export interface CreateTerraformRunResponse {
  run: TerraformRun;
}

// GET /teams
export interface ListTeamsResponse {
  teams: Team[];
}

// GET /me
export interface GetCurrentUserResponse {
  user: User;
}
