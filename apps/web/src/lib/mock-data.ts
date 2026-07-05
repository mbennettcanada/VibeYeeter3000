import type {
  App,
  Deployment,
  DeploymentStatus,
  Pod,
  Secret,
  Team,
  TerraformRun,
  User,
} from "@vibeyeeter/types";

export interface MockApp extends App {
  teamName: string;
  subdomain: string;
  latestDeploymentStatus: DeploymentStatus;
  podsRunning: number;
  podsDesired: number;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();

export const mockUser: User = {
  id: "local",
  email: "dev@local",
  teams: ["dev"],
  isAdmin: true,
};

export const mockTeams: Team[] = [
  { id: "9c6f7d1a-2b3e-4c5f-8a9b-1d2e3f4a5b6c", name: "Finance", slug: "finance", createdAt: daysAgo(400) },
  { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "People Ops", slug: "people-ops", createdAt: daysAgo(400) },
  { id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e", name: "Support", slug: "support", createdAt: daysAgo(400) },
  { id: "3c4d5e6f-7a8b-4c9d-0e1f-2a3b4c5d6e7f", name: "Operations", slug: "operations", createdAt: daysAgo(400) },
];

export const mockApps: MockApp[] = [
  {
    id: "app_expense_tracker",
    name: "expense-tracker",
    slug: "expense-tracker",
    teamId: "team_finance",
    teamName: "Finance",
    repoUrl: "https://github.com/acme/expense-tracker",
    namespace: "expense-tracker",
    subdomain: "expense-tracker.apps.internal.co",
    createdAt: daysAgo(90),
    updatedAt: hoursAgo(2),
    latestDeploymentStatus: "succeeded",
    podsRunning: 3,
    podsDesired: 3,
  },
  {
    id: "app_onboarding_portal",
    name: "onboarding-portal",
    slug: "onboarding-portal",
    teamId: "team_people",
    teamName: "People Ops",
    repoUrl: "https://github.com/acme/onboarding-portal",
    namespace: "onboarding-portal",
    subdomain: "onboarding.apps.internal.co",
    createdAt: daysAgo(45),
    updatedAt: minutesAgo(12),
    latestDeploymentStatus: "running",
    podsRunning: 2,
    podsDesired: 2,
  },
  {
    id: "app_support_widget",
    name: "support-widget",
    slug: "support-widget",
    teamId: "team_support",
    teamName: "Support",
    repoUrl: "https://github.com/acme/support-widget",
    namespace: "support-widget",
    subdomain: "support-widget.apps.internal.co",
    createdAt: daysAgo(210),
    updatedAt: daysAgo(3),
    latestDeploymentStatus: "failed",
    podsRunning: 0,
    podsDesired: 2,
  },
  {
    id: "app_inventory_sync",
    name: "inventory-sync",
    slug: "inventory-sync",
    teamId: "team_ops",
    teamName: "Operations",
    repoUrl: "https://github.com/acme/inventory-sync",
    namespace: "inventory-sync",
    subdomain: "inventory-sync.apps.internal.co",
    createdAt: daysAgo(400),
    updatedAt: daysAgo(30),
    latestDeploymentStatus: "rolled_back",
    podsRunning: 1,
    podsDesired: 1,
  },
];

export function getMockApp(id: string): MockApp | undefined {
  return mockApps.find((app) => app.id === id || app.slug === id);
}

const engineers = ["priya@acme.com", "dev@local", "marcus@acme.com", "GitHub Actions"];
const shas = ["a3f9c21", "e88b104", "0c4d7ab", "f21e9d3", "9b6a5c0", "1d84fe2", "c5e0a91"];

function buildDeployments(appId: string, count: number, seed: number): Deployment[] {
  const statuses: DeploymentStatus[] = ["succeeded", "succeeded", "succeeded", "failed", "running", "rolled_back", "pending"];
  return Array.from({ length: count }, (_, i) => {
    const status = statuses[(i + seed) % statuses.length] as DeploymentStatus;
    const isTerminal = status === "succeeded" || status === "failed" || status === "rolled_back";
    return {
      id: `dep_${appId}_${count - i}`,
      appId,
      imageTag: `${shas[(i + seed) % shas.length]}`,
      status,
      type: status === "rolled_back" ? "rollback" : "deploy",
      triggeredBy: engineers[(i + seed) % engineers.length] as string,
      createdAt: hoursAgo(i * 7 + 1),
      duration: isTerminal ? 40 + ((i * 17) % 180) : null,
    };
  });
}

export const mockDeployments: Record<string, Deployment[]> = Object.fromEntries(
  mockApps.map((app, index) => [app.id, buildDeployments(app.id, 14, index * 3)]),
);

export function getMockDeployments(appId: string): Deployment[] {
  return mockDeployments[appId] ?? [];
}

export const mockSecretKeys: Record<string, Secret[]> = Object.fromEntries(
  mockApps.map((app) => [
    app.id,
    [
      { key: "DATABASE_URL", createdAt: daysAgo(90), updatedAt: daysAgo(90) },
      { key: "STRIPE_SECRET_KEY", createdAt: daysAgo(60), updatedAt: daysAgo(12) },
      { key: "JWT_SIGNING_KEY", createdAt: daysAgo(90), updatedAt: daysAgo(90) },
      { key: "SENDGRID_API_KEY", createdAt: daysAgo(75), updatedAt: daysAgo(2) },
      { key: "SLACK_WEBHOOK_URL", createdAt: daysAgo(30), updatedAt: daysAgo(30) },
      { key: "S3_BUCKET_NAME", createdAt: daysAgo(90), updatedAt: daysAgo(45) },
    ],
  ]),
);

export function getMockSecrets(appId: string): Secret[] {
  return mockSecretKeys[appId] ?? [];
}

export interface MockTerraformRun extends TerraformRun {
  triggeredBy: string;
  duration: number | null;
}

function buildTerraformRuns(appId: string): MockTerraformRun[] {
  return [
    {
      id: `tf_${appId}_5`,
      appId,
      type: "plan",
      status: "succeeded",
      planDiff: null,
      triggeredBy: "dev@local",
      duration: 14,
      createdAt: hoursAgo(1),
    },
    {
      id: `tf_${appId}_4`,
      appId,
      type: "apply",
      status: "succeeded",
      planDiff: null,
      triggeredBy: "priya@acme.com",
      duration: 96,
      createdAt: daysAgo(2),
    },
    {
      id: `tf_${appId}_3`,
      appId,
      type: "plan",
      status: "succeeded",
      planDiff: null,
      triggeredBy: "priya@acme.com",
      duration: 11,
      createdAt: daysAgo(2),
    },
    {
      id: `tf_${appId}_2`,
      appId,
      type: "apply",
      status: "failed",
      planDiff: null,
      triggeredBy: "marcus@acme.com",
      duration: 42,
      createdAt: daysAgo(10),
    },
    {
      id: `tf_${appId}_1`,
      appId,
      type: "plan",
      status: "succeeded",
      planDiff: null,
      triggeredBy: "marcus@acme.com",
      duration: 9,
      createdAt: daysAgo(10),
    },
  ];
}

export const mockTerraformRuns: Record<string, MockTerraformRun[]> = Object.fromEntries(
  mockApps.map((app) => [app.id, buildTerraformRuns(app.id)]),
);

export function getMockTerraformRuns(appId: string): MockTerraformRun[] {
  return mockTerraformRuns[appId] ?? [];
}

export const mockPlanDiff = `Terraform will perform the following actions:

  # module.app.aws_ecs_service.this will be updated in-place
  ~ resource "aws_ecs_service" "this" {
        id                = "arn:aws:ecs:us-east-1:...:service/app"
      ~ desired_count     = 2 -> 3
        name              = "expense-tracker"
        tags              = {}
    }

  # module.app.aws_secretsmanager_secret_version.env will be updated in-place
  ~ resource "aws_secretsmanager_secret_version" "env" {
        id             = "arn:aws:secretsmanager:us-east-1:...:secret/env"
      ~ secret_string  = (sensitive value)
    }

  # module.app.aws_cloudwatch_log_group.this will be created
  + resource "aws_cloudwatch_log_group" "this" {
      + name              = "/ecs/expense-tracker"
      + retention_in_days = 30
      + tags              = {
          + "ManagedBy" = "vibeyeeter3000"
        }
    }

  # module.app.aws_iam_role_policy.stale will be destroyed
  - resource "aws_iam_role_policy" "stale" {
      - id     = "expense-tracker-stale-policy"
      - name   = "stale-s3-access"
      - policy = jsonencode(...) -> null
    }

Plan: 1 to add, 2 to change, 1 to destroy.`;

function buildPods(appId: string, count: number): Pod[] {
  const suffixes = ["7c9d4f8b6-a1b2c", "7c9d4f8b6-d3e4f", "7c9d4f8b6-9f8g7"];
  return Array.from({ length: Math.max(count, 1) }, (_, i) => ({
    name: `${appId.replace(/^app_/, "").replace(/_/g, "-")}-${suffixes[i % suffixes.length]}`,
    status: i === 0 ? "Running" : "Running",
    restarts: i % 2,
    age: `${(i + 1) * 3}d`,
    image: `ghcr.io/acme/${appId.replace(/^app_/, "").replace(/_/g, "-")}:latest`,
  }));
}

export const mockPods: Record<string, Pod[]> = Object.fromEntries(
  mockApps.map((app) => [app.id, buildPods(app.id, app.podsDesired)]),
);

export function getMockPods(appId: string): Pod[] {
  return mockPods[appId] ?? [];
}

const logTemplates = [
  "GET /health 200 3ms",
  "GET /api/v1/status 200 5ms",
  "POST /api/v1/jobs 201 42ms",
  "Connected to database pool (12 active connections)",
  "Cache miss for key session:9f8a2 — fetching from origin",
  "Scheduled job \"cleanup-temp-files\" completed in 118ms",
  "Warning: slow query detected (412ms) — SELECT * FROM events WHERE ...",
  "GET /api/v1/users/42 200 9ms",
  "Worker picked up job from queue \"emails\"",
  "Health check passed",
];

export function getMockPodLogs(podName: string, lines = 100): string {
  const now = Date.now();
  return Array.from({ length: lines }, (_, i) => {
    const ts = new Date(now - (lines - i) * 4000).toISOString();
    const line = logTemplates[(i + podName.length) % logTemplates.length];
    return `${ts} [${podName}] ${line}`;
  }).join("\n");
}

export const mockApplyLogScript = [
  "Acquiring state lock. This may take a few moments...",
  "module.app.aws_ecs_service.this: Modifying...",
  "module.app.aws_ecs_service.this: Modifications complete after 4s",
  "module.app.aws_cloudwatch_log_group.this: Creating...",
  "module.app.aws_cloudwatch_log_group.this: Creation complete after 1s",
  "module.app.aws_iam_role_policy.stale: Destroying...",
  "module.app.aws_iam_role_policy.stale: Destruction complete after 1s",
  "Apply complete! Resources: 1 added, 2 changed, 1 destroyed.",
];
