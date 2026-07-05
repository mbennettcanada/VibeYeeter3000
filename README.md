# VibeYeeter3000

VibeYeeter3000 is a self-hosted internal PaaS that lets non-technical users
build and deploy applications with AI coding agents (Claude, Cursor, etc.)
without needing to understand Kubernetes, Terraform, or CI/CD.

Someone describes what they want to an AI agent working in a repo the
platform provisioned. The agent pushes to `main`. GitHub Actions builds an
image, and the platform runs it, gives it a database, and puts it behind a
subdomain — all without the person who asked for it ever touching a
terminal.

The platform team gets a dashboard for every app it's running: deploy
history, rollback, logs, secrets, and infrastructure changes, all in one
place.

---

## How it fits together

```
                          ┌─────────────────────────────┐
                          │        Control plane         │
                          │  Next.js UI  +  Fastify API   │
                          │     (vibeyeeter-system ns)    │
                          │ JumpCloud SAML · Cloudflare    │
                          │         Access ingress         │
                          └───────┬───────────────┬───────┘
                                  │               │
                        GitHub App API     Kubernetes + AWS APIs
                                  │               │
                  ┌───────────────▼───────┐   ┌───▼─────────────────────┐
                  │      GitHub App        │   │   Per-app namespace      │
                  │     (vibeyeeter-bot)   │   │   vibeyeeter-<appId>     │
                  │  create repo           │   │  Deployment + Service    │
                  │  push CLAUDE.md        │   │  Ingress (nginx)         │
                  │  receive webhooks      │   │  CloudNative PG          │
                  │  create deployments    │   │  ExternalSecret          │
                  └───────────┬────────────┘   └──────────────────────────┘
                              │ push to main
                  ┌───────────▼────────────┐
                  │  GitHub Actions (app)   │      ┌─────────────────────┐
                  │  build + push image     │      │   tf-runner service  │
                  │  notify platform ───────┼─────▶│  plan on PR           │
                  └─────────────────────────┘      │  apply on approval    │
                                                    │  state: S3 + DynamoDB │
                                                    └─────────────────────┘
```

An AI agent works in an app repo the platform created. It pushes; the app's
generated GitHub Actions workflow builds an image and pings the platform API,
which rolls it out to that app's Kubernetes namespace. Infra changes (new AWS
resources an app needs) go through `tf-runner`, which plans on every PR and
applies only after a human clicks approve in the dashboard.

See [docs/architecture.md](docs/architecture.md) for the full breakdown.

---

## What you get

- **For non-technical users**: a dashboard to register apps, see deployments,
  roll back, view migration history, manage secrets, and approve
  infrastructure changes — no terminal required
- **For AI coding agents**: a standardized repo structure, `CLAUDE.md`
  conventions, and generated CI pipelines, so an agent working in an app repo
  knows exactly how to build, test, and ship
- **For the platform team**: a GitHub App, an OpenTofu runner, and a
  Kubernetes control plane that governs every app's lifecycle — self-hosted
  on your own EKS cluster

---

## Core stack

| Layer | Technology |
|---|---|
| Language | TypeScript, monorepo (pnpm + Turborepo) |
| App framework | Next.js 14+ (App Router) |
| ORM | Drizzle |
| Database | PostgreSQL (CloudNative PG in-cluster) |
| Container runtime | Docker |
| Orchestration | AWS EKS (Kubernetes) / Rancher Desktop (local) |
| Infra-as-code | OpenTofu |
| CI/CD | GitHub Actions |
| Image registry | GitHub Container Registry (ghcr.io) |
| Secrets | AWS Secrets Manager + External Secrets Operator |
| Ingress auth | Cloudflare Access → your SSO provider |
| Platform auth | SAML (tested against JumpCloud) |
| GitHub integration | A GitHub App you register for your org |

---

## Prerequisites

Running this yourself requires:

- **An AWS account** — the platform's own EKS cluster, plus S3/DynamoDB for
  OpenTofu state and Secrets Manager for credentials
- **A GitHub organization** you control, and a **GitHub App** registered on
  it (see [docs/runbook.md](docs/runbook.md) for exact setup steps) — this is
  how the platform creates repos and receives deploy webhooks
- **A SAML identity provider** (JumpCloud, Okta, etc.) for platform login —
  or set `DEV_AUTH_BYPASS=true` and skip this for local development
- **A Cloudflare account** managing the DNS zone you'll use for app
  subdomains, for Cloudflare Access to gate ingress
- `kubectl`, `tofu` (OpenTofu), `helm`, `docker`, and `pnpm` on your machine

None of the above are required to run the platform locally against Rancher
Desktop — see Quick start below.

---

## Quick start (local development)

No AWS, GitHub App, or SSO required — this gets the control plane running
against a local Postgres and (optionally) a local Rancher Desktop cluster.

**1. Clone and install**

```bash
git clone <your-fork-url>
cd vibeyeeter3000
pnpm install
```

**2. Start Postgres and copy env files**

```bash
docker compose -f docker-compose.dev.yml up -d
./scripts/dev-setup.sh   # copies apps/{api,web}/.env.example -> .env.local
```

**3. Apply the database schema**

```bash
pnpm --filter @vibeyeeter/api db:migrate
```

**4. Run everything**

```bash
pnpm dev
```

**5. Open the dashboard**

- Web UI: [http://localhost:3000](http://localhost:3000) — `DEV_AUTH_BYPASS=true`
  is on by default, so you're logged in as a fake local admin
- API: [http://localhost:3002/health](http://localhost:3002/health)
- tf-runner: [http://localhost:4001/health](http://localhost:4001/health)

GitHub App and SAML credentials are left blank in local dev; the API logs a
warning and those routes no-op instead of crashing. To exercise real
Kubernetes provisioning locally, install
[Rancher Desktop](https://rancherdesktop.io/) — see
[docs/runbook.md](docs/runbook.md#local-kubernetes-testing-with-rancher-desktop).

To onboard your first application once the platform is running: see
[docs/onboarding.md](docs/onboarding.md).

---

## Deploying the platform itself

To run VibeYeeter3000 for real (on your own EKS cluster, for your own org),
see the **"Platform bootstrap"** section of
[docs/runbook.md](docs/runbook.md#platform-bootstrap-first-time-production-setup).
Short version:

```bash
cd infra/cluster && tofu init && tofu apply   # EKS + IRSA + cluster operators
# ...create AWS Secrets Manager entries, push images (see runbook)...
./scripts/deploy-platform.sh                  # applies infra/platform/base
```

---

## Repo structure

```
vibeyeeter3000/
├── apps/
│   ├── web/              Next.js control plane UI (port 3000 in dev)
│   └── api/               Fastify API server (port 3002 in dev)
├── packages/
│   ├── types/             Shared TypeScript types (@vibeyeeter/types)
│   └── github-app/        GitHub App webhook handling + repo operations
├── services/
│   └── tf-runner/          OpenTofu runner HTTP service (port 4001 in dev)
├── infra/
│   ├── cluster/            Platform's own AWS infra (EKS, VPC, IRSA) — OpenTofu
│   ├── platform/           Kubernetes manifests to deploy the platform itself
│   ├── helm-chart/         Shared Helm chart for managed apps
│   └── app-templates/      Files pushed into every newly registered app repo
├── scripts/
│   ├── dev-setup.sh          Local dev env bootstrap (.env.local files)
│   ├── deploy-platform.sh    Applies infra/platform/base to a real cluster
│   └── k8s-smoke-test.ts     End-to-end k8s lifecycle test (Rancher Desktop)
└── docs/
```

---

## Documentation

- [Architecture](docs/architecture.md) — full system design
- [Runbook](docs/runbook.md) — operational procedures, including platform bootstrap
- [App onboarding](docs/onboarding.md) — registering a new application
- [App template CLAUDE.md](docs/app-template-claude-md.md) — the guide agents
  see when working in an app repo the platform created

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
