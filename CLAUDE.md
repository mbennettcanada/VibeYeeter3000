# VibeYeeter3000 — AI Agent Guide

This file is the primary orientation document for AI coding agents working on
the VibeYeeter3000 platform itself (not for apps managed by the platform —
those use a separate CLAUDE.md, see `docs/app-template-claude-md.md`).

---

## What this is

VibeYeeter3000 is an internal PaaS that lets non-technical users build and
deploy applications using AI coding agents. The platform:

- Provisions GitHub repos and pushes `CLAUDE.md` via the GitHub App
- Manages Kubernetes namespaces, services, ingresses, and deployments per app
- Runs OpenTofu for app-specific infrastructure
- Provides a web dashboard for deployments, rollbacks, migrations, and secrets
- Integrates with JumpCloud (SSO) and Cloudflare Access (ingress auth)

See `docs/architecture.md` for the full system design.

---

## Monorepo structure

```
vibeyeeter3000/
├── apps/
│   ├── web/              Next.js 14 control plane UI (port 3000 in dev)
│   └── api/              Fastify API server (port 3002 in dev)
├── packages/
│   ├── types/            Shared TypeScript types (@vibeyeeter/types)
│   └── github-app/       GitHub App webhook handling + repo operations
├── services/
│   └── tf-runner/        OpenTofu runner HTTP service (port 4001 in dev)
├── infra/
│   ├── platform/         Platform's own AWS infra (EKS, ECR, S3, DynamoDB)
│   └── modules/          Reusable OpenTofu modules for managed apps
├── k8s/
│   ├── platform/         Platform's own Kubernetes manifests
│   └── app-chart/        Helm chart template for managed apps
├── scripts/
│   ├── dev-setup.sh          Local dev env bootstrap (.env.local files)
│   └── k8s-smoke-test.ts     End-to-end k8s lifecycle test (Rancher Desktop)
└── docs/
```

Dependency order: `types` ← `github-app` ← `api` ← `web`
                  `types` ← `tf-runner`

---

## Build and development

```bash
# Install all dependencies
pnpm install

# Type-check everything
pnpm typecheck

# Run all tests
pnpm test

# Run everything in dev mode (uses Turborepo)
pnpm dev

# Run a specific package
pnpm --filter @vibeyeeter/api dev
pnpm --filter @vibeyeeter/web dev
pnpm --filter @vibeyeeter/tf-runner dev

# Build all
pnpm build

# Lint
pnpm lint
```

Minimum Node version: 20. Package manager: pnpm.

---

## Package responsibilities

### `apps/api` (Fastify, port 3002)

The backend. Handles:
- JumpCloud SAML authentication and session management (`/saml/*`)
- GitHub App webhook ingestion (`POST /webhooks/github`)
- Kubernetes API: namespace/service/ingress provisioning, pods, deployments, logs
- AWS API: Secrets Manager CRUD (stubbed locally), S3 backup listing
- OpenTofu runner orchestration (internal HTTP calls to `tf-runner`)
- App registration and lifecycle management
- Platform database (stores app registrations, deploy history, team config)

All API routes require a valid session except `GET /health` and `/saml/*`.
Set `DEV_AUTH_BYPASS=true` to skip SAML and attach a fake local admin user.

**Route summary:**
- `GET /health`
- `GET /apps`, `POST /apps`, `GET /apps/:id`, `PATCH /apps/:id`, `DELETE /apps/:id`
- `GET /apps/:id/pods`, `GET /apps/:id/pods/:podName/logs`
- `GET /apps/:id/deployments`, `POST /apps/:id/deployments`
- `POST /apps/:id/deployments/:deploymentId/rollback`
- `GET /apps/:id/secrets`, `POST /apps/:id/secrets`, `DELETE /apps/:id/secrets/:key`
- `GET /apps/:id/terraform`, `POST /apps/:id/terraform/plan`, `POST /apps/:id/terraform/apply`
- `POST /webhooks/github`
- `GET /saml/metadata`, `POST /saml/callback`

### `apps/web` (Next.js 14, port 3000)

The control plane UI. Non-coders use this. Server components for data fetching,
client components for interactivity. Calls the API via `apps/api`.

Key routes:
- `/` — dashboard (all apps for your teams)
- `/login` — login page (redirects to JumpCloud SAML or uses bypass in dev)
- `/apps/[id]` — app detail (pods, deploys, migrations, secrets, tf runs)
- `/apps/[id]/deployments` — deploy history + rollback
- `/apps/[id]/secrets` — secret management
- `/apps/[id]/terraform` — tf plan/apply history
- `/admin` — admin-only: all teams, all apps, platform config

Key components: `AppCard`, `DeploymentsTable`, `SecretsManager`, `PlanDiff`,
`StatusBadge`, `StatusDot`, `PageHeader`, `Sidebar`, `EmptyState`.

### `packages/types`

Zero-runtime-dependency types shared between web and api. Import as `@vibeyeeter/types`.
Types: `App`, `Deployment`, `Pod`, `Secret`, `Team`, `User`, `TerraformRun`, `Migration`.
All API request/response shapes live here.

### `packages/github-app`

GitHub App integration:
- Webhook signature verification and event dispatch (`webhooks.ts`)
- Event handlers: `push` → create GitHub Deployment; `pull_request` → tf-plan;
  `deployment_status` → reconcile platform deploy record
- Repo operations (`repo-ops.ts`): `createRepo`, `pushFile`, `openPR`,
  `createDeployment`, `updateDeploymentStatus`

Uses `@octokit/auth-app` + `@octokit/rest` with the vibeyeeter-bot private key,
via the singleton `getOctokit()` in `client.ts`.

Configured via `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (base64-encoded PEM),
`GITHUB_APP_INSTALLATION_ID`, `GITHUB_WEBHOOK_SECRET`.

### `services/tf-runner` (port 4001)

Isolated Node.js/Fastify service. Exposes `POST /plan`, `POST /apply`,
`POST /destroy`, `GET /runs/:runId`. Runs `tofu` (OpenTofu, the MPL-licensed
Terraform fork — same CLI, different binary name) as a child process in an
isolated per-run temp directory, streams output, and records each run in `tf_runs`.
Has its own IAM role (IRSA) for S3 state + DynamoDB lock access.
Only reachable from within the cluster — no external ingress.

Route paths stay `/plan`, `/apply`, `/destroy` and the dashboard's
`/apps/[id]/terraform` even though the underlying tool is OpenTofu, to avoid
churn in the frontend and API contracts.

Configured via `TF_RUNNER_DATABASE_URL` (points at same Postgres as API) and
`TOFU_BIN` (default: `tofu`). Logs a warning at startup if the binary is missing.

### `apps/api/src/services/kubernetes.ts`

Wraps `@kubernetes/client-node`. Key functions:
- `isKubernetesConfigured()` — checks for `~/.kube/config` or `KUBECONFIG`
- `ensureNamespace(appId)` / `deleteNamespace(appId)` — namespace `vibeyeeter-<appId>`
- `ensureService(appId)` / `ensureIngress(appId, subdomain)` — ClusterIP service + nginx ingress
- `applyDeployment(appId, imageTag)` / `rollbackDeployment(appId, imageTag)` — server-side apply
- `getDeploymentStatus(appId)` — available/desired/ready replica counts
- `listPods(appId)` / `getPodLogs(appId, podName, lines?)` — pod listing + logs

All k8s-backed API routes degrade gracefully (return `warnings`, not 500) when k8s is not configured.

---

## Key conventions

### Error handling

- API routes return `{ error: string, detail?: string }` with appropriate HTTP codes
- 400: invalid input, 401: unauthenticated, 403: unauthorized, 404: not found,
  422: validation error, 502: upstream failure
- Services throw typed errors; routes catch and map to HTTP responses
- Never let unhandled errors propagate to Fastify's default handler

### Auth in the API

All protected routes go through the `requireSession` middleware which validates
the session cookie and attaches `request.user` (`{ id, email, teams, isAdmin }`).

In local dev, `DEV_AUTH_BYPASS=true` attaches:
`{ id: "local", email: "dev@local", teams: ["dev"], isAdmin: true }`.

Admin routes additionally check `request.user.isAdmin`.

### Kubernetes operations

Use `@kubernetes/client-node`. Locally, the client reads `~/.kube/config` (or
`KUBECONFIG` env var). In production, the API pod uses its in-cluster ServiceAccount
(loaded via `KubeConfig.loadFromDefault()`). The ServiceAccount RBAC is limited:
- Can read/write Deployments, Pods, Services, Ingresses in app namespaces
- Cannot modify ClusterRoles, Nodes, or platform-system resources

Namespace name for a given app: `vibeyeeter-<appId>` (appId is the UUID from the `apps` table).

### Secrets — never log, never return values

Secrets from AWS Secrets Manager are write-only through the platform API:
- `GET /apps/:id/secrets` returns key names only, never values
- `POST /apps/:id/secrets` accepts a new key/value but never returns the value
- No secret value should appear in logs at any log level
- Secret values are not persisted in the platform database; only key names are tracked

### Generated files

Files pushed to app repos by the GitHub App are generated by functions in
`packages/github-app/src/`. Currently, only `CLAUDE.md` is auto-pushed on
app registration. Workflow files, Dockerfile, and helm values are planned.

---

## Database (platform's own)

The platform API uses its own PostgreSQL database (separate from app databases).
Schema managed via Drizzle ORM; migrations in `apps/api/src/db/migrations/`.

```bash
# Generate a migration after schema changes
pnpm --filter @vibeyeeter/api db:generate

# Apply migrations
pnpm --filter @vibeyeeter/api db:migrate
```

Tables:
- `teams` — team definitions (id, name, slug)
- `apps` — registered application records (id, name, slug, teamId, repoUrl, namespace, subdomain, deletedAt)
- `deployments` — deployment history per app (id, appId, imageTag, status, triggeredBy, githubDeploymentId)
- `tf_runs` — OpenTofu plan/apply history per app (id, appId, type, status, planDiff, output)
- `secrets` — secret key names per app (values never stored here)
- `users` — platform users (synced from JumpCloud SAML assertions)
- `team_members` — user ↔ team membership

The `tf_runs` table is also read/written directly by `services/tf-runner` (which has its
own copy of the table schema — no dependency on `apps/api`).

---

## Environment variables (API)

```bash
# Required
DATABASE_URL=                        # Platform's own Postgres
JWT_SECRET=                          # Session signing key (≥32 chars)

# GitHub App (all optional locally — API starts without them, logs a warning)
GITHUB_APP_ID=                       # GitHub App numeric ID
GITHUB_APP_PRIVATE_KEY=              # PEM private key, base64-encoded
GITHUB_APP_INSTALLATION_ID=          # Installation ID on mbennettcanada org
GITHUB_WEBHOOK_SECRET=               # Webhook HMAC secret
GITHUB_ORG=mbennettcanada            # GitHub org for repo provisioning

# JumpCloud SAML (optional locally — use DEV_AUTH_BYPASS=true instead)
JUMPCLOUD_SAML_CERT=                 # JumpCloud IdP certificate
SAML_SP_ENTITY_ID=                   # https://vibeyeeter.internal.co/saml/metadata
SAML_CALLBACK_URL=                   # https://vibeyeeter.internal.co/saml/callback

AWS_REGION=us-east-1
TF_RUNNER_URL=http://localhost:4001  # Internal only (http://tf-runner:4001 in cluster)

# Kubernetes (optional — auto-detected from ~/.kube/config or KUBECONFIG)
KUBECONFIG=                          # Override kubeconfig path if needed

# Local dev only
DEV_AUTH_BYPASS=true                 # Skip SAML; attach fake admin user. NEVER in prod.

# Optional
LOG_LEVEL=info                       # debug | info | warn | error
PORT=3002
```

## Environment variables (tf-runner)

```bash
TF_RUNNER_DATABASE_URL=              # Postgres (can share with API)
TOFU_BIN=tofu                        # OpenTofu binary name/path
LOG_LEVEL=info
PORT=4001
```

---

## Testing

- Unit tests: `packages/types`, `packages/github-app`, individual service functions
- Integration tests: API routes with a real test database (`apps/api/src/routes/*.test.ts`)
- Kubernetes smoke test: `scripts/k8s-smoke-test.ts` (requires Rancher Desktop)

```bash
pnpm test                         # all tests
pnpm --filter @vibeyeeter/api test  # just API tests
npx tsx scripts/k8s-smoke-test.ts   # end-to-end k8s lifecycle test
```

Test database: use `DATABASE_URL=postgres://localhost/vibeyeeter_test`.
Tests clean up after themselves using transactions or truncation.

---

## Deployment (the platform itself)

The platform is deployed on EKS in the `vibeyeeter-system` namespace.

Push to `main` → GitHub Actions builds images → pushes to ECR → updates
`k8s/platform/` Helm values → applies to cluster.

This is the same pipeline the platform provides to other apps, just managed
manually for bootstrap reasons.

---

## What NOT to do

- Do not add business logic to `packages/types` — types only, no runtime code
- Do not make Kubernetes API calls from `apps/web` — only via `apps/api`
- Do not store secret values in the platform database — keys only
- Do not give the platform API cluster-admin permissions — use minimal RBAC
- Do not call the `tf-runner` service from `apps/web` — only via `apps/api`
- Do not hardcode AWS region, account IDs, or cluster names — use config/env
- Do not run `tofu apply` without a prior `tofu plan` approval record
- Do not enable `DEV_AUTH_BYPASS` outside local development
