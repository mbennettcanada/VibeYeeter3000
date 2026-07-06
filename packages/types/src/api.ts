import type { App } from "./app.js";
import type { Deployment } from "./deployment.js";
import type { Migration } from "./migration.js";
import type { Secret } from "./secret.js";
import type { TerraformRun, TerraformRunType } from "./terraform.js";
import type { Pod } from "./pod.js";
import type { Team, TeamWithDetail } from "./team.js";
import type { User } from "./user.js";
import type { ApiToken } from "./token.js";
import type { AppDomain, AppDomainWithApp } from "./domain.js";
import type { PlatformConfigItem } from "./platform-config.js";

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

// PUT /apps/:id/secrets/:key
export interface UpdateSecretRequest {
  value: string;
}
export interface UpdateSecretResponse {
  secret: Secret;
  restart?: { deploymentId: string };
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

// GET /settings/teams
export interface ListTeamsDetailResponse {
  teams: TeamWithDetail[];
}

// POST /settings/teams
export interface CreateTeamRequest {
  name: string;
  slug: string;
}
export interface CreateTeamResponse {
  team: TeamWithDetail;
}

// PATCH /settings/teams/:id
export interface UpdateTeamRequest {
  name: string;
}
export interface UpdateTeamResponse {
  team: TeamWithDetail;
}

// POST /settings/teams/:id/groups
export interface AddTeamGroupRequest {
  groupName: string;
}
export interface AddTeamGroupResponse {
  team: TeamWithDetail;
}

// GET /settings/tokens
export interface ListApiTokensResponse {
  tokens: ApiToken[];
}

// POST /settings/tokens
export interface CreateApiTokenRequest {
  name: string;
  expiresAt?: string;
}
// The only response that ever includes the plaintext token — shown once.
export interface CreateApiTokenResponse {
  token: ApiToken & { token: string };
}

// GET /settings/domains
export interface ListAllDomainsResponse {
  domains: AppDomainWithApp[];
}

// GET /apps/:id/domains
export interface ListDomainsResponse {
  domains: AppDomain[];
}

// POST /apps/:id/domains
export interface CreateDomainRequest {
  hostname: string;
}
export interface CreateDomainResponse {
  domain: AppDomain;
}

// GET /settings/config
export interface ListPlatformConfigResponse {
  config: PlatformConfigItem[];
}

// PUT /settings/config/:key
export interface UpdatePlatformConfigRequest {
  value: string;
}
export interface UpdatePlatformConfigResponse {
  config: PlatformConfigItem;
}
