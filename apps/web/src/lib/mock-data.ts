import type {
  App,
  Deployment,
  DeploymentStatus,
  Secret,
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
