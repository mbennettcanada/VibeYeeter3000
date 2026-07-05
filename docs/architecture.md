# VibeYeeter3000 — Architecture

## System overview

VibeYeeter3000 is three systems working together:

```
┌─────────────────────────────────────────────────────────────┐
│                     Control Plane                           │
│   Next.js UI + Fastify API   (vibeyeeter-system namespace)  │
│   JumpCloud SAML auth        Cloudflare Access ingress      │
└────────────┬────────────────────────────┬───────────────────┘
             │                            │
     GitHub App API               Kubernetes API + AWS APIs
             │                            │
┌────────────▼────────────┐  ┌───────────▼───────────────────┐
│      GitHub App         │  │      Per-App Namespace         │
│    vibeyeeter-bot       │  │   vibeyeeter-<appId>           │
│                         │  │                               │
│  - create repo          │  │  Namespace                    │
│  - push CLAUDE.md       │  │  Deployment (app pods)        │
│  - receive webhooks     │  │  Service (ClusterIP)          │
│  - open PRs (future)    │  │  Ingress (nginx)              │
│  - create deployments   │  │  CloudNative PG (prod)        │
└────────────┬────────────┘  │  ExternalSecret (prod)        │
             │               └───────────────────────────────┘
    Push to main webhook
             │
┌────────────▼────────────┐
│   GitHub Actions (app)  │
│                         │
│  1. Build + push ECR    │
│  2. Run migrations      │
│  3. Helm upgrade        │
│  4. Health check        │
└─────────────────────────┘

     OpenTofu changes:
┌─────────────────────────┐
│     OpenTofu Runner     │
│   (tf-runner service)   │
│                         │
│  - plan on PR           │
│  - apply on approval    │
│  - state: S3 + DynamoDB │
└─────────────────────────┘
```

---

## Components

### Control plane

**Web UI** (`apps/web`): Next.js 14 App Router. The primary interface for non-technical users.
Deployed in the `vibeyeeter-system` namespace in production. Served on port 3000 in development.

Key pages:
- `/` — dashboard listing all apps
- `/apps/[id]` — app detail (pods, recent deployments, secrets, tf runs)
- `/apps/[id]/deployments` — full deployment history + rollback
- `/apps/[id]/secrets` — secret management (keys only displayed)
- `/apps/[id]/terraform` — tf plan/apply history

**API** (`apps/api`): Fastify, port 3002. Handles:
- JumpCloud SAML assertion processing and session management (`/saml/*`)
- GitHub App webhook ingestion (`POST /webhooks/github`)
- Kubernetes API calls: namespace/service/ingress provisioning, pod listing, logs, deployments
- AWS API calls: Secrets Manager CRUD (stubbed locally)
- OpenTofu runner orchestration via HTTP (`tf-runner`)
- App registration and lifecycle management

All routes require a valid session cookie (or `DEV_AUTH_BYPASS=true` for local dev)
except `GET /health` and `/saml/*`.

### GitHub App (`vibeyeeter-bot`)

Installed on the `mbennettcanada` GitHub org. The platform's identity in GitHub.

**Permissions:** Contents (R/W), Workflows (W), Pull requests (W), Deployments (W).
**Events:** push, pull_request, deployment_status.

**Files pushed on app registration:**

| File | Description |
|---|---|
| `CLAUDE.md` | AI agent context file for the app repo |

Additional generated files (deploy workflow, Dockerfile, helm values, backend.tf) are
planned for the workflow-generation phase and not yet pushed automatically.

**Webhook events handled** (in `packages/github-app/src/webhooks.ts`):
- `push` to main → creates a GitHub Deployment record, triggers platform deploy flow
- `pull_request` opened/updated → triggers OpenTofu plan
- `deployment_status` → reconciles the platform deployment record with GitHub's status

### OpenTofu runner (`services/tf-runner`)

A Node.js/Fastify service running on port 4001, isolated to `vibeyeeter-system` in production (no external ingress). Runs `tofu` (OpenTofu) as a child process.

**Endpoints:**
- `POST /plan` — clone repo, run `tofu plan`, store structured diff
- `POST /apply` — run `tofu apply` against a pre-stored plan
- `POST /destroy` — run `tofu destroy` (requires explicit confirmation)
- `GET /runs/:runId` — return a specific run's status and output

Each run is persisted to the `tf_runs` table in Postgres. The tf-runner connects to the same Postgres instance as the API but via its own `TF_RUNNER_DATABASE_URL` env var.

**State layout in S3:**
```
s3://vibeyeeter-tf-state/
  <team-slug>/
    <app-slug>/
      terraform.tfstate
```

Lock table: DynamoDB `vibeyeeter-tf-locks` (partition key: `LockID`).

The runner has an IAM role (IRSA) with S3 + DynamoDB access. App pods do not have access to the state bucket.

> **Tooling note:** The underlying tool is OpenTofu (`tofu` binary, configured via `TOFU_BIN`).
> Route paths (`/plan`, `/apply`, `/destroy`) and the dashboard path (`/apps/[id]/terraform`)
> remain stable regardless of which tool is in use underneath.

### Per-app Kubernetes namespace

When an app is registered via `POST /apps`, the platform creates:

```
Namespace:    vibeyeeter-<appId>
Service:      app  (ClusterIP, port 3000)
Ingress:      app  (nginx, host: <subdomain>.internal)
```

The namespace name is `vibeyeeter-<appId>` where `<appId>` is the UUID assigned to the app row in the platform database. Labels applied: `app.kubernetes.io/managed-by=vibeyeeter` and `app.kubernetes.io/instance=<appId>`.

When `POST /apps/:id/deployments` is called with an `imageTag`, the platform creates or updates a Kubernetes Deployment named `app` in that namespace. The deployment uses server-side apply (SSA), so re-deploying a new image tag is an in-place patch.

In production, additional resources are created per namespace:
- CloudNative PG cluster (PostgreSQL, 1 primary + 1 replica)
- ExternalSecret (syncs values from `/vibeyeeter/<team>/<app>/` in AWS Secrets Manager)
- NetworkPolicy (deny cross-namespace traffic)
- ServiceAccount with IRSA annotation

### Helm chart (`k8s/app-chart`)

One shared Helm chart for all managed apps. Per-app configuration lives in
`helm/values.yaml` in each app repo (pushed and maintained by the platform).

Key values:
```yaml
image:
  repository: <account>.dkr.ecr.us-east-1.amazonaws.com/<app>
  tag: latest          # updated on each deploy
  pullPolicy: Always

replicaCount: 2

env:
  DATABASE_URL:
    secretKeyRef:
      name: app-secrets
      key: DATABASE_URL

ingress:
  host: <subdomain>.internal.yourcompany.com
  cfAccessEnabled: true

resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi

migrations:
  enabled: true
```

---

## Auth and access

### Ingress flow

```
User browser
  → Cloudflare Access (validates JumpCloud session)
    → AWS ALB (HTTPS termination, cert from ACM)
      → ingress-nginx (Kubernetes ingress controller)
        → App pod
```

Every app gets a Cloudflare Access policy on registration. Policy requires membership in the appropriate JumpCloud group.

Apps receive the `CF-Access-JWT-Assertion` header from Cloudflare, encoding the authenticated user's identity (email, groups). Apps can use this for application-level authorization without implementing their own OAuth flow.

### Platform auth

1. User visits platform UI → redirected to JumpCloud SSO
2. JumpCloud issues SAML assertion with user's groups
3. Platform API validates assertion (`/saml/callback`), creates session cookie
4. User's JumpCloud groups determine which teams and apps they can see

**Group conventions:**
- `vibeyeeter-admin` → can see and manage all teams and apps
- `team-<slug>` → can see and manage apps under that team

**Local dev:** `DEV_AUTH_BYPASS=true` in `apps/api/.env.local` attaches a fake admin user
(`{ id: "local", email: "dev@local", teams: ["dev"], isAdmin: true }`) to every request,
bypassing SAML entirely. Never enable this in staging/production.

### Secrets

```
AWS Secrets Manager
  /vibeyeeter/<team>/<app>/DATABASE_URL
  /vibeyeeter/<team>/<app>/<any-secret>
      ↓
External Secrets Operator
      ↓
Kubernetes Secret (in app namespace)
      ↓
Pod environment variables
```

Platform API allows viewing secret keys (never values), adding secrets, and deleting them.
Values are never stored in the platform database or returned in API responses — only key
names are tracked (in the `secrets` table) so the dashboard can list/manage them.

---

## Database

### Platform database

The platform API uses its own PostgreSQL instance (separate from per-app databases).
Tables: `teams`, `apps`, `deployments`, `tf_runs`, `secrets`, `users`, `team_members`.
Schema managed via Drizzle ORM; migrations in `apps/api/src/db/migrations/`.

### CloudNative PG (production)

Each app gets its own PostgreSQL cluster managed by the CloudNative PG operator:
- Automatic failover (1 primary + 1 replica by default)
- Continuous WAL archiving to S3
- Point-in-time recovery
- Scheduled backups

### Migrations

Drizzle migrations run as a Kubernetes Job before each deployment:

```
Deploy flow:
  1. New image pushed to ECR (by GitHub Actions)
  2. Platform API receives push webhook / is called by CI
  3. POST /apps/:id/deployments { imageTag } → creates Deployment in k8s
  4. Migration Job runs pre-deploy (npx drizzle-kit migrate)
  5. Deployment rolling update proceeds once Job completes
  6. Status reported to platform dashboard
```

---

## Network topology

```
Internet
  │
  ▼ (blocked except CF-proxied traffic)
Cloudflare
  │
  ▼ CF Access check
AWS ALB (public-facing, CF IP ranges only via WAF)
  │
  ▼
EKS ingress-nginx
  │
  ├── vibeyeeter-system namespace (platform UI + API + tf-runner)
  ├── vibeyeeter-<app1-id> namespace
  ├── vibeyeeter-<app2-id> namespace
  └── ...
```

Inter-namespace traffic is blocked by NetworkPolicy. Apps cannot reach each other's pods.

**Local dev topology (Rancher Desktop):**

```
localhost:3000  →  Next.js web (pnpm dev)
localhost:3002  →  Fastify API (pnpm dev)
localhost:4001  →  tf-runner (pnpm dev)
localhost:5432  →  PostgreSQL (docker-compose.dev.yml)

kubectl → rancher-desktop context → k3s cluster (local)
             ├── vibeyeeter-<appId> namespaces (created by API)
             └── (no CNPG or ExternalSecrets locally)
```

---

## Cost estimates (production, ~50 apps on EKS)

| Resource | Est. monthly cost |
|---|---|
| EKS cluster (3× m5.xlarge) | ~$300 |
| CloudNative PG (50× small clusters) | ~$200-400 (spot instances) |
| ECR storage | ~$20 |
| S3 (state + backups) | ~$30 |
| AWS Secrets Manager | ~$25 |
| ALB | ~$20 |
| Cloudflare Access (Teams) | varies by plan |
| **Total** | **~$600-800/month** |

---

## Future: AI agent layer

Deferred from MVP. When implemented:

- Non-coder describes a feature in plain English in the platform UI
- Platform calls Claude API with the repo context (CLAUDE.md + recent code)
- Claude generates code changes and opens a PR via the GitHub App
- Engineer or AI agent reviews and merges
- Platform deploys automatically on merge

The GitHub App (`vibeyeeter-bot`) already has the PR write permission ready for this.
