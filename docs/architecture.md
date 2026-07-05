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
│    vibeyeeter-bot       │  │                               │
│                         │  │  Deployment (app pods)        │
│  - push workflows       │  │  CloudNative PG cluster       │
│  - push helm values     │  │  ExternalSecret (AWS SM)      │
│  - receive webhooks     │  │  Migration Job (pre-deploy)   │
│  - future: open PRs     │  │  Ingress + CF Access policy   │
└────────────┬────────────┘  └───────────────────────────────┘
             │
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

     Terraform changes:
┌─────────────────────────┐
│    Terraform Runner     │
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

**Web UI** (`apps/web`): Next.js 14 App Router. The primary interface for non-technical users. Deployed in the `vibeyeeter-system` namespace.

**API** (`apps/api`): Fastify. Handles:
- JumpCloud SAML assertion processing and session management
- GitHub App webhook ingestion and event processing
- Kubernetes API calls (pods, deployments, rollouts, logs)
- AWS API calls (ECR image history, Secrets Manager, S3 backups)
- Terraform runner orchestration
- App registration and lifecycle management

### GitHub App (`vibeyeeter-bot`)

Installed on the `mbennettcanada` GitHub org. The platform's identity in GitHub.

**Permissions:**
- Contents: read/write (push generated files)
- Workflows: write (manage GitHub Actions)
- Pull requests: write (future: AI feature PRs)
- Deployments: write (create deployment records)
- Webhooks: push, pull_request, deployment_status events

**Files it manages in every app repo:**

| File | When generated | Description |
|---|---|---|
| `.github/workflows/deploy.yml` | Registration | Build + ECR push + Helm upgrade |
| `.github/workflows/migrate.yml` | Registration | Pre-deploy Drizzle migration Job |
| `.github/workflows/tf-plan.yml` | Registration | Terraform plan on PR, post comment |
| `.github/workflows/tf-apply.yml` | Registration | Terraform apply after successful deploy |
| `helm/values.yaml` | Registration + updates | Helm values for this app |
| `infra/backend.tf` | Registration | Remote state config (S3 + DynamoDB) |
| `Dockerfile` | Registration | Production multi-stage build |

These files are regenerated if platform conventions change. Apps should not edit them manually — changes are overwritten.

### Terraform runner (`services/tf-runner`)

A Node.js service running in `vibeyeeter-system`. Exposes an internal HTTP API.

**Endpoints:**
- `POST /plan` — clone repo, run `terraform plan -out=plan.tfplan`, return structured diff
- `POST /apply` — run `terraform apply plan.tfplan` with a pre-approved plan
- `POST /destroy` — run `terraform destroy` (requires explicit platform-level confirmation)
- `GET /state/:team/:app` — return current state summary

**State layout in S3:**
```
s3://vibeyeeter-tf-state/
  <team-slug>/
    <app-slug>/
      terraform.tfstate
      terraform.tfstate.backup
```

Lock table: DynamoDB `vibeyeeter-tf-locks` (partition key: `LockID`).

The runner has an IAM role (via IRSA) with read/write access to the state bucket and lock table. App pods do not have access to the state bucket.

### Per-app Kubernetes namespace

When an app is registered, the platform creates:

```yaml
# Namespace
vibeyeeter create-namespace --team growth --app lead-tracker
# → namespace: growth-lead-tracker

# Resources created:
- Namespace: growth-lead-tracker
- CloudNative PG Cluster: lead-tracker-db
- ExternalSecret: app-secrets (pulls from /vibeyeeter/growth/lead-tracker/ in AWS SM)
- ServiceAccount: lead-tracker (with IRSA annotation)
- NetworkPolicy: deny cross-namespace traffic
- Ingress: lead-tracker.internal.yourcompany.com (CF Access policy attached)
- HPA: min 1, max 5 replicas (configurable)
```

### Helm chart (`k8s/app-chart`)

One shared Helm chart for all managed apps. Per-app configuration lives in `helm/values.yaml` in each app repo (managed by the platform).

Key values:
```yaml
image:
  repository: <account>.dkr.ecr.us-east-1.amazonaws.com/<app>
  tag: latest          # platform updates this on each deploy
  pullPolicy: Always

replicaCount: 2

env:
  DATABASE_URL:
    secretKeyRef:
      name: app-secrets
      key: DATABASE_URL

ingress:
  host: lead-tracker.internal.yourcompany.com
  cfAccessEnabled: true

resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi

migrations:
  enabled: true        # runs migration Job before Deployment rolls out
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

Every app gets a Cloudflare Access policy on registration. Policy requires membership in the appropriate JumpCloud group. No app implements its own network-level access control.

Apps receive the `CF-Access-JWT-Assertion` header from Cloudflare, which encodes the authenticated user's identity (email, groups). Apps can use this for application-level authorization (showing different UI to different roles) without implementing their own OAuth flow.

### Platform auth

1. User visits platform UI → redirected to JumpCloud SSO
2. JumpCloud issues SAML assertion with user's groups
3. Platform API validates assertion, creates session
4. User's JumpCloud groups determine which teams and apps they can see

**Group conventions:**
- `vibeyeeter-admin` → can see and manage all teams and apps
- `team-<slug>` → can see and manage apps in that team's namespace

### Secrets

```
AWS Secrets Manager
  /vibeyeeter/<team>/<app>/DATABASE_URL
  /vibeyeeter/<team>/<app>/NEXTAUTH_SECRET
  /vibeyeeter/<team>/<app>/<any-other-secret>
      ↓
External Secrets Operator
      ↓
Kubernetes Secret (in app namespace)
      ↓
Pod environment variables
```

Platform UI allows viewing secret keys (not values), adding new secrets, and rotating existing ones. Values are never displayed after initial creation.

---

## Database

### CloudNative PG

Each app gets its own PostgreSQL cluster managed by the CloudNative PG operator. Features:
- Automatic failover (1 primary + 1 replica by default)
- Continuous WAL archiving to S3
- Point-in-time recovery
- Scheduled backups (daily full, continuous WAL)

### Migrations

Drizzle migrations run as a Kubernetes Job before each deployment:

```
Deploy flow:
  1. New image pushed to ECR (by GitHub Actions)
  2. Platform API detects new image (via ECR webhook or polling)
  3. Migration Job created in namespace (runs: npx drizzle-kit migrate)
  4. Job completes → Deployment rolling update begins
  5. Health check passes → old pods terminated
  6. Deployment status reported to platform dashboard
```

Migration history is stored in the `drizzle` table in the app's database and surfaced in the platform UI.

---

## Network topology

```
Internet
  │
  ▼ (blocked except CF-proxied traffic)
Cloudflare
  │
  ▼ CF Access check
AWS ALB (public-facing, but only CF IP ranges allowed via WAF)
  │
  ▼
EKS ingress-nginx
  │
  ├── vibeyeeter-system namespace (platform UI + API)
  ├── team-a-app-1 namespace
  ├── team-a-app-2 namespace
  ├── team-b-app-1 namespace
  └── ...
```

Inter-namespace traffic is blocked by NetworkPolicy. Apps cannot reach each other's pods.

---

## Cost estimates

At ~50 apps on EKS:

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

Cost can be reduced by:
- Running multiple small apps in shared PG clusters (advanced)
- Using Fargate Spot for non-critical apps
- Enabling CNPG cluster hibernation for dev/test apps

---

## Future: AI agent layer

Deferred from MVP. When implemented:

- Non-coder describes a feature in plain English in the platform UI
- Platform calls Claude API with the repo context (CLAUDE.md + recent code)
- Claude generates code changes and opens a PR via the GitHub App
- Engineer or AI agent reviews and merges
- Platform deploys automatically on merge

The GitHub App (`vibeyeeter-bot`) already has the PR write permission ready for this.
