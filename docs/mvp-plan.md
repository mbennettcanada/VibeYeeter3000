# VibeYeeter3000 — MVP Plan

## Goal

Ship a working internal PaaS in 8 weeks that lets a non-technical user:
1. Register an existing GitHub repo
2. See its deployment status, pod health, and image history
3. Roll back to any previous deployment with one click
4. View Drizzle migration history
5. Add/rotate secrets without touching the terminal
6. Approve and apply Terraform changes from the UI

Everything else is post-MVP.

---

## Milestones

### Week 1-2: Foundation

**Infrastructure bootstrap**
- [ ] Create EKS cluster (3× m5.xlarge, us-east-1) via Terraform in `infra/platform/`
- [ ] Install core cluster components:
  - ingress-nginx
  - CloudNative PG operator
  - External Secrets Operator
  - cert-manager
  - metrics-server
- [ ] Create `vibeyeeter-system` namespace
- [ ] S3 bucket + DynamoDB table for Terraform state
- [ ] ECR lifecycle policies (keep last 50 images per repo)
- [ ] Cloudflare Access application for platform UI
- [ ] JumpCloud SAML app for platform auth

**Monorepo scaffold**
- [ ] pnpm workspace with `apps/web`, `apps/api`, `packages/types`
- [ ] TypeScript strict mode across all packages
- [ ] ESLint + Prettier
- [ ] Docker multi-stage builds for web and api
- [ ] GitHub Actions: CI (typecheck + lint + test) on every PR

---

### Week 3-4: GitHub App + App Registration

**GitHub App (`vibeyeeter-bot`)**
- [ ] Register GitHub App on `mbennettcanada` org
- [ ] Webhook server in `packages/github-app` handling:
  - `push` to main → trigger deploy
  - `pull_request` opened/updated → trigger tf-plan
  - `deployment_status` → update platform deploy record
- [ ] File generation: deploy workflow, migrate workflow, tf-plan workflow, tf-apply workflow, Dockerfile, `helm/values.yaml`, `infra/backend.tf`

**App registration flow (API)**
- [ ] `POST /apps` — register a repo: validate GitHub access, create namespace, create CNPG cluster, create ExternalSecret, push generated files
- [ ] `GET /apps` — list apps for authenticated user's teams
- [ ] `GET /apps/:id` — app detail: current image, pods, recent deploys
- [ ] `DELETE /apps/:id` — deregister (does NOT destroy infra automatically; requires explicit tf destroy)

**App registration flow (UI)**
- [ ] Register form: GitHub repo URL, team, app name, subdomain
- [ ] Progress screen showing registration steps
- [ ] Redirect to app dashboard on success

---

### Week 5: Deployments + Rollback

**Deploy pipeline**
- [ ] GitHub Actions workflow (generated): build image, push to ECR, update `helm/values.yaml` image tag, trigger Helm upgrade
- [ ] Pre-deploy migration Job in Kubernetes
- [ ] Platform API polls/watches deployment rollout status
- [ ] Deploy record stored in platform DB (image tag, timestamp, triggered by, status, duration)

**Dashboard**
- [ ] App overview: pod status (running/pending/failed), replica count, current image tag + commit SHA
- [ ] Deployment history list: last 20 deploys with status, image tag, timestamp, who triggered it
- [ ] Rollback: pick any previous deploy → platform updates `helm/values.yaml` and triggers Helm upgrade to that image tag
- [ ] Real-time rollout progress (WebSocket or polling)

---

### Week 6: Migrations + Secrets

**Migration history**
- [ ] Platform reads `drizzle.__drizzle_migrations` table via a read-only DB connection per app
- [ ] UI: list of migrations with name, applied-at timestamp, status
- [ ] Failed migration surfaces as a blocking error on the deploy detail view

**Secrets management**
- [ ] `GET /apps/:id/secrets` — list secret keys (not values) from AWS Secrets Manager
- [ ] `POST /apps/:id/secrets` — add a new secret key/value
- [ ] `PUT /apps/:id/secrets/:key` — rotate a secret value
- [ ] `DELETE /apps/:id/secrets/:key` — remove a secret
- [ ] UI: secrets list with add/rotate/delete actions; values always masked after creation
- [ ] On secret change: platform triggers a rolling restart of app pods to pick up new value

---

### Week 7: Terraform runner + Plan/Apply UI

**Terraform runner service**
- [ ] Node.js service in `services/tf-runner`
- [ ] Internal HTTP API: `POST /plan`, `POST /apply`, `POST /destroy`
- [ ] Git clone + `terraform init` + `terraform plan -out=plan.tfplan -json`
- [ ] Parse plan JSON into structured diff (resources to add/change/destroy)
- [ ] `terraform apply plan.tfplan` on approval
- [ ] Run history stored (plan output, apply output, timestamp, triggered by)
- [ ] IAM role via IRSA with S3 + DynamoDB access for state

**Terraform UI**
- [ ] PR view: when a PR is opened against an app repo, platform shows the tf plan diff
- [ ] Plan diff rendered as structured table (+ add, ~ change, - destroy) with resource details
- [ ] "Approve & Apply" button → calls tf-runner apply
- [ ] Apply log output streamed to UI
- [ ] Run history: list of past plan/apply runs

---

### Week 8: Auth + Polish + Hardening

**JumpCloud SAML**
- [ ] SAML SP in platform API (`passport-saml` or `@node-saml/node-saml`)
- [ ] Login → JumpCloud → SAML assertion → session cookie
- [ ] Group extraction: map JumpCloud groups to platform teams
- [ ] Admin group (`vibeyeeter-admin`) bypasses team filter

**Cloudflare Access**
- [ ] Platform provisions CF Access policy per app on registration (via Cloudflare API)
- [ ] Policy: require JumpCloud group membership matching the app's team
- [ ] `CF-Access-JWT-Assertion` header documentation added to app template CLAUDE.md

**Polish**
- [ ] Error states: deployment failed, migration failed, tf-apply failed — all surface clearly in UI
- [ ] Empty states: no apps yet, no deploys yet, no secrets yet
- [ ] Loading skeletons
- [ ] Mobile-responsive (at minimum: readable on phone, all actions work)
- [ ] App logs: last 500 lines from running pods, auto-refresh

**Hardening**
- [ ] Rate limiting on API
- [ ] Webhook signature verification (GitHub App HMAC)
- [ ] All platform API endpoints require valid session
- [ ] Terraform runner not exposed outside cluster (internal service only)
- [ ] Secrets never logged or returned in API responses

---

## Tech decisions deferred to post-MVP

- Multi-environment (staging/prod) per app
- Database backup restore UI (backups run via CNPG, but restore is manual for MVP)
- Slack deploy notifications
- Cost estimation in tf-plan view
- AI agent layer (natural language → PR)
- GCP support
- App-to-app networking

---

## Definition of done

MVP is complete when a non-technical user can:
1. Log in with their JumpCloud account
2. Register a GitHub repo they own (or have been given access to)
3. Push to main and watch the deployment progress in the dashboard
4. Roll back to a previous version with one click
5. Add a secret without asking an engineer
6. See what Terraform changes a PR will make and approve them

All of the above without opening a terminal.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CNPG operator complexity | Medium | High | Spike in week 1; fallback to RDS if needed |
| JumpCloud SAML setup time | Medium | Medium | Start early; use test users in week 1 |
| GitHub App file conflicts | Low | Medium | Platform files have a header warning; document clearly |
| Terraform runner security | Low | High | Network-isolated; never exposes state to app pods |
| EKS cost overrun | Low | Low | Budget alerts; CNPG on spot instances |
