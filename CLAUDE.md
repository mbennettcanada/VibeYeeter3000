# VibeYeeter3000 — AI Agent Guide

This file is the primary orientation document for AI coding agents working on
the VibeYeeter3000 platform itself (not for apps managed by the platform —
those use a separate CLAUDE.md, see `docs/app-template-claude-md.md`).

---

## What this is

VibeYeeter3000 is an internal PaaS that lets non-technical users build and
deploy applications using AI coding agents. The platform:

- Provisions GitHub repos from a template
- Manages Kubernetes namespaces, Postgres databases, and secrets per app
- Runs Terraform for app-specific infrastructure
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
│   └── tf-runner/        Terraform runner HTTP service (port 4001 in dev)
├── infra/
│   ├── platform/         Platform's own AWS infra (EKS, ECR, S3, DynamoDB)
│   └── modules/          Reusable Terraform modules for managed apps
├── k8s/
│   ├── platform/         Platform's own Kubernetes manifests
│   └── app-chart/        Helm chart template for managed apps
├── scripts/
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

### `apps/api` (Fastify)

The backend. Handles:
- JumpCloud SAML authentication and session management
- GitHub App webhook ingestion (`POST /webhooks/github`)
- Kubernetes API: pods, deployments, rollouts, logs, namespaces
- AWS API: ECR image history, Secrets Manager CRUD, S3 backup listing
- Terraform runner orchestration (internal HTTP calls to `tf-runner`)
- App registration and lifecycle management
- Platform database (stores app registrations, deploy history, team config)

All API routes require a valid session except `/health` and `/saml/*`.

### `apps/web` (Next.js)

The control plane UI. Non-coders use this. Server components for data fetching,
client components for interactivity. Calls the API via `apps/api`.

Key routes:
- `/` — dashboard (all apps for your teams)
- `/apps/[id]` — app detail (pods, deploys, migrations, secrets, tf runs)
- `/apps/[id]/deployments` — deploy history + rollback
- `/apps/[id]/secrets` — secret management
- `/apps/[id]/terraform` — tf plan/apply history
- `/admin` — admin-only: all teams, all apps, platform config

### `packages/types`

Zero-runtime-dependency types shared between web and api. Import as `@vibeyeeter/types`.
All API request/response shapes live here.

### `packages/github-app`

GitHub App integration:
- Webhook signature verification
- Event handlers (push, pull_request, deployment_status)
- File generation (workflow templates, Dockerfile, helm values, backend.tf)
- Repo operations (push files, open PRs, create deployments)

Uses `@octokit/auth-app` + `@octokit/rest` with the vibeyeeter-bot private key,
via the singleton `getOctokit()` in `client.ts`.

### `services/tf-runner`

Isolated Node.js service. Exposes `POST /plan`, `POST /apply`, `POST /destroy`,
`GET /runs/:runId`. Runs `tofu` (OpenTofu, the MPL-licensed Terraform fork —
same CLI, different binary name) as a child process in an isolated per-run
temp directory, streams output, and records each run in `tf_runs`.
Has its own IAM role (IRSA) for S3 state + DynamoDB lock access.
Only reachable from within the cluster — no external ingress.
Route paths stay `/plan`, `/apply`, `/destroy` and the dashboard's
`/apps/[id]/terraform` even though the underlying tool is OpenTofu, to avoid
churn in the frontend and API contracts.

---

## Key conventions

### Error handling

- API routes return `{ error: string, detail?: string }` with appropriate HTTP codes
- 400: invalid input, 401: unauthenticated, 403: unauthorized, 404: not found, 502: upstream failure
- Services throw typed errors; routes catch and map to HTTP responses
- Never let unhandled errors propagate to Fastify's default handler

### Auth in the API

All protected routes go through the `requireSession` middleware which validates
the session cookie and attaches `request.user` (`{ id, email, teams, isAdmin }`).

Admin routes additionally check `request.user.isAdmin`. Team-scoped routes check
that `request.user.teams` includes the target team.

### Kubernetes operations

Use the `@kubernetes/client-node` library. The API service runs inside the cluster
with a ServiceAccount that has limited RBAC:
- Can read/write Deployments, Pods, Jobs, Secrets, ExternalSecrets in any namespace
- Cannot modify ClusterRoles, Nodes, or platform-system resources

### Secrets — never log, never return values

Secrets from AWS Secrets Manager are write-only through the platform API:
- `GET /apps/:id/secrets` returns key names only, never values
- `PUT /apps/:id/secrets/:key` accepts a new value but never returns it
- No secret value should appear in logs at any log level

### Generated files

Files pushed to app repos by the GitHub App are generated from templates in
`packages/github-app/templates/`. Templates use `{{variable}}` interpolation.
When templates change, a migration script regenerates files in all registered repos.

---

## Database (platform's own)

The platform API uses its own PostgreSQL database (separate from app databases).
Schema and migrations are in `apps/api/db/`.

```bash
# Generate a migration after schema changes
pnpm --filter @vibeyeeter/api db:generate

# Apply migrations
pnpm --filter @vibeyeeter/api db:migrate
```

Tables:
- `teams` — team definitions
- `apps` — registered application records
- `deployments` — deployment history per app
- `tf_runs` — Terraform plan/apply history per app
- `users` — platform users (synced from JumpCloud SAML assertions)
- `team_members` — user ↔ team membership

---

## Environment variables (API)

```bash
# Required
DATABASE_URL=                        # Platform's own Postgres
JWT_SECRET=                          # Session signing key
GITHUB_APP_ID=                       # GitHub App ID
GITHUB_APP_PRIVATE_KEY=              # GitHub App private key (PEM, base64-encoded)
GITHUB_APP_INSTALLATION_ID=          # GitHub App installation ID
GITHUB_WEBHOOK_SECRET=               # Webhook HMAC secret
GITHUB_ORG=                          # GitHub org repos are provisioned into
JUMPCLOUD_SAML_CERT=                 # JumpCloud IdP certificate
SAML_SP_ENTITY_ID=                   # https://vibeyeeter.internal.co/saml/metadata
SAML_CALLBACK_URL=                   # https://vibeyeeter.internal.co/saml/callback
AWS_REGION=us-east-1
TF_RUNNER_URL=http://tf-runner:4000  # Internal only

# Optional
LOG_LEVEL=info                       # debug | info | warn | error
PORT=3001
```

---

## Testing

- Unit tests: `packages/types`, `packages/github-app`, individual service functions
- Integration tests: API routes with a real test database
- No E2E tests for MVP (add post-launch)

```bash
pnpm test              # all tests
pnpm test --filter api # just API tests
```

Test database: use `DATABASE_URL=postgres://localhost/vibeyeeter_test` with a
separate test DB. Tests should clean up after themselves using transactions or
truncation.

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
- Do not run `terraform apply` without a prior `terraform plan` approval record
