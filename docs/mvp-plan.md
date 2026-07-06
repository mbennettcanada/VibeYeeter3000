# VibeYeeter3000 — MVP Plan

## Goal

Ship a working internal PaaS in 8 weeks that lets a non-technical user:
1. Register an existing GitHub repo
2. See its deployment status, pod health, and image history
3. Roll back to any previous deployment with one click
4. View Drizzle migration history
5. Add/rotate secrets without touching the terminal
6. Approve and apply OpenTofu changes from the UI

Everything else is post-MVP.

---

## Milestones

### Week 1-2: Foundation

**Infrastructure bootstrap**
- [ ] Create EKS cluster (3× m5.xlarge, us-east-1) via OpenTofu in `infra/platform/`
- [ ] Install core cluster components:
  - ingress-nginx
  - CloudNative PG operator
  - External Secrets Operator
  - cert-manager
  - metrics-server
- [ ] Create `vibeyeeter-system` namespace
- [ ] S3 bucket + DynamoDB table for OpenTofu state
- [ ] ECR lifecycle policies (keep last 50 images per repo)
- [x] Cloudflare Access application for platform UI (also gates per-app subdomains)

**Monorepo scaffold**
- [x] pnpm workspace with `apps/web`, `apps/api`, `packages/types`, `packages/github-app`, `services/tf-runner`
- [x] TypeScript strict mode across all packages
- [x] ESLint + Prettier
- [x] Docker multi-stage builds for web and api
- [x] GitHub Actions: CI (typecheck + lint + test) on every PR

---

### Week 3-4: GitHub App + App Registration

**GitHub App (`vibeyeeter-bot`)**
- [x] Register GitHub App on `your-org` org
- [x] Webhook server in `packages/github-app` handling:
  - `push` to main → create GitHub Deployment, trigger platform deploy
  - `pull_request` opened/updated → trigger tf-plan
  - `deployment_status` → update platform deploy record
- [x] Repo operations: `createRepo`, `pushFile`, `openPR`, `createDeployment`, `updateDeploymentStatus`
- [x] CLAUDE.md pushed to app repo on registration
- [ ] Generated workflow files (deploy.yml, migrate.yml, tf-plan.yml, tf-apply.yml), Dockerfile, helm/values.yaml, infra/backend.tf

**App registration flow (API)**
- [x] `POST /apps` — register: validate input, insert DB row, provision GitHub repo, create k8s namespace/service/ingress
- [x] `GET /apps` — list apps for authenticated user's teams
- [x] `GET /apps/:id` — app detail including live pod list
- [x] `PATCH /apps/:id` — update app fields
- [x] `DELETE /apps/:id` — soft-delete + delete k8s namespace

**App registration flow (UI)**
- [ ] Register form: GitHub repo URL, team, app name, subdomain
- [ ] Progress screen showing registration steps
- [ ] Redirect to app dashboard on success

---

### Week 5: Deployments + Rollback

**Deploy pipeline**
- [x] `POST /apps/:id/deployments` — applies Deployment manifest to k8s, records deploy row
- [x] `POST /apps/:id/deployments/:deploymentId/rollback` — re-applies prior image tag
- [x] `GET /apps/:id/deployments` — deployment history
- [x] Kubernetes `applyDeployment` using server-side apply (SSA)
- [x] `getDeploymentStatus` for replica counts
- [ ] Pre-deploy migration Job in Kubernetes
- [ ] Platform API polls/watches deployment rollout status → updates deploy record status
- [ ] GitHub Actions workflow (generated): build image, push to ECR, trigger platform

**Dashboard**
- [x] App overview with pod status (via `GET /apps/:id/pods`)
- [x] Deployment history table component (`DeploymentsTable`)
- [x] Status badges and dot indicators
- [ ] Real-time rollout progress (WebSocket or polling)
- [ ] Rollback button wired to API

---

### Week 6: Migrations + Secrets

**Migration history**
- [ ] Platform reads `drizzle.__drizzle_migrations` table via a read-only DB connection per app
- [ ] UI: list of migrations with name, applied-at timestamp, status

**Secrets management**
- [x] `GET /apps/:id/secrets` — list secret keys (not values) from `secrets` table
- [x] `POST /apps/:id/secrets` — add a new secret key; value written to AWS Secrets Manager (stubbed locally)
- [x] `DELETE /apps/:id/secrets/:key` — remove a secret
- [ ] `PUT /apps/:id/secrets/:key` — rotate a secret value (missing; upsert exists in POST)
- [ ] UI: secrets list with add/rotate/delete actions (component exists: `SecretsManager`)
- [ ] On secret change: trigger a rolling restart of app pods

---

### Week 7: OpenTofu runner + Plan/Apply UI

**OpenTofu runner service**
- [x] Node.js/Fastify service in `services/tf-runner`, port 4001
- [x] Internal HTTP API: `POST /plan`, `POST /apply`, `POST /destroy`, `GET /runs/:runId`
- [x] Runs `tofu` (OpenTofu binary, configurable via `TOFU_BIN`) as child process
- [x] Run history stored in `tf_runs` table (shared Postgres, via `TF_RUNNER_DATABASE_URL`)
- [x] Startup warning if `tofu` binary is not on PATH
- [ ] Git clone + `tofu init` + `tofu plan -json` → parse into structured diff
- [ ] `tofu apply` on approval
- [ ] IAM role via IRSA with S3 + DynamoDB access for state

**OpenTofu UI**
- [x] Plan diff component (`PlanDiff`)
- [ ] PR view: show tf plan diff from webhook
- [ ] "Approve & Apply" button → calls tf-runner apply
- [ ] Apply log output streamed to UI
- [ ] Run history: list of past plan/apply runs (route: `/apps/[id]/terraform`)

---

### Week 8: Auth + Polish + Hardening

**Platform auth (superseded plan)**

The original plan below (JumpCloud SAML) was replaced post-MVP with Cloudflare
Access JWT auth — see `docs/architecture.md#platform-auth` and
`docs/runbook.md#auth-troubleshooting` for the current implementation.

- [x] ~~SAML route scaffold (`/saml/metadata`, `/saml/callback`)~~ — removed;
  replaced by `GET /auth/cf-callback` (verifies the `CF_Authorization` cookie
  against Cloudflare's JWKS endpoint)
- [x] Session creation on successful auth
- [ ] Group extraction: map external identity provider groups to platform
  teams (teams are currently managed manually via Settings → Teams;
  `team_external_groups` exists for future group-mapping but isn't consumed
  by the callback yet)

**Cloudflare Access**
- [x] Single wildcard CF Access application (`*.<PLATFORM_DOMAIN>`) gates the
  platform UI/API and every per-app subdomain — not a per-app policy

**Polish**
- [x] Error states handled at API level (typed `{ error, detail }` responses)
- [x] Empty state component (`EmptyState`)
- [x] Loading skeletons (`StatCard` component)
- [ ] Mobile-responsive UI
- [ ] App logs viewer (route: `GET /apps/:id/pods/:podName/logs` is implemented; UI pending)

**Hardening**
- [ ] Rate limiting on API
- [x] Webhook signature verification (GitHub App HMAC, in `webhooksRoutes`)
- [x] All platform API endpoints require valid session (`requireSession` middleware)
- [x] tf-runner not exposed outside cluster (internal service only)
- [x] Secrets never logged or returned in API responses

---

## Local Kubernetes (added post-MVP-plan)

- [x] `isKubernetesConfigured()` — detects `~/.kube/config` or `KUBECONFIG`
- [x] `ensureNamespace` / `deleteNamespace` — namespace per app (`vibeyeeter-<appId>`)
- [x] `ensureService` / `ensureIngress` — ClusterIP service + nginx ingress
- [x] `applyDeployment` / `rollbackDeployment` — server-side apply Deployment manifest
- [x] `listPods` / `getPodLogs` — pod listing with label selector
- [x] Graceful degradation: all k8s-backed routes return warnings (not 500s) when k8s is not configured
- [x] End-to-end smoke test: `scripts/k8s-smoke-test.ts` (Rancher Desktop)

---

## Tech decisions deferred to post-MVP

- Multi-environment (staging/prod) per app
- Database backup restore UI
- Slack deploy notifications
- Cost estimation in tf-plan view
- AI agent layer (natural language → PR)
- GCP support
- App-to-app networking

---

## Definition of done

MVP is complete when a non-technical user can:
1. Log in via Cloudflare Access (their identity provider account)
2. Register a GitHub repo they own
3. Push to main and watch the deployment progress in the dashboard
4. Roll back to a previous version with one click
5. Add a secret without asking an engineer
6. See what OpenTofu changes a PR will make and approve them

All of the above without opening a terminal.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CNPG operator complexity | Medium | High | Spike in week 1; fallback to RDS if needed |
| JumpCloud SAML setup time | Medium | Medium | Start early; use test users in week 1 |
| GitHub App file conflicts | Low | Medium | Platform files have a header warning; document clearly |
| OpenTofu runner security | Low | High | Network-isolated; never exposes state to app pods |
| EKS cost overrun | Low | Low | Budget alerts; CNPG on spot instances |
