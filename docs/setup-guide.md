# VibeYeeter3000 Setup Guide

This guide walks a platform operator through standing up VibeYeeter3000 from
scratch and getting to a first successful app deploy. It assumes you're
comfortable running a Kubernetes cluster and managing DNS/Cloudflare, but not
necessarily reading TypeScript.

For the day-2 operational procedures (rollbacks, log inspection, incident
response), see [`docs/runbook.md`](./runbook.md). For how the pieces fit
together conceptually, see [`docs/architecture.md`](./architecture.md).

> **Note on `docs/runbook.md`:** parts of that file predate this guide and
> describe an older JumpCloud SAML login flow. The platform now authenticates
> operators via **Cloudflare Access** (see step 4 below and the git history
> around "Cloudflare Access JWT auth"); this guide reflects the current
> behavior. Treat this guide as authoritative for auth/config, and the
> runbook as authoritative for day-to-day `kubectl`/rollback commands.

---

## 1. Overview

VibeYeeter3000 is a self-hosted internal PaaS that lets non-technical users
build and deploy applications with AI coding agents (Claude, Cursor, etc.)
without touching Kubernetes, Terraform, or CI/CD directly. Someone describes
what they want to an AI agent working in a repo the platform provisioned; the
agent pushes to `main`; GitHub Actions builds an image and notifies the
platform; the platform rolls it out into its own Kubernetes namespace,
provisions a database via OpenTofu, and puts it behind a subdomain. The
platform team gets a dashboard (`apps/web`) backed by an API (`apps/api`) for
every app it runs: deploy history, rollback, logs, secrets, and
infrastructure-change approvals, all in one place.

---

## 2. Prerequisites

Before you start, have the following ready:

- **A Kubernetes cluster** (EKS or equivalent) you can `kubectl apply` to.
  `infra/cluster` (OpenTofu) provisions an EKS cluster plus the
  `cloudnative-pg`, `external-secrets`, and `ingress-nginx` operators if you
  don't already have one.
- **A PostgreSQL database** for the platform's own control-plane data
  (separate from any per-app databases). Can be the same Postgres instance
  used by `services/tf-runner`.
- **A GitHub App** ("vibeyeeter-bot") with repo-creation and webhook
  permissions — see [section 3](#3-github-app-setup).
- **A Cloudflare account** with a Zero Trust (Access) subscription and a DNS
  zone for the domain you'll use for the platform and per-app subdomains —
  see [section 4](#4-cloudflare-setup).
- **An AWS account** for AWS Secrets Manager (platform credentials and, if
  you provision `infra/cluster`, the EKS cluster itself).
- **CLI tools on your workstation**: `kubectl`, `helm`, `tofu` (OpenTofu —
  same CLI as Terraform, different binary name), `pnpm` (v9), `envsubst`,
  and Node.js ≥ 20 if you'll run anything locally.

---

## 3. GitHub App setup

The platform acts on GitHub as a dedicated GitHub App, conventionally named
`vibeyeeter-bot`. It creates app repos, pushes generated files (`CLAUDE.md`),
opens PRs, creates GitHub Deployments, and receives webhooks for `push`,
`pull_request`, and `deployment_status` events.

1. Go to `https://github.com/organizations/<your-org>/settings/apps/new`.
2. **App name**: `vibeyeeter-bot` (or similar).
3. **Homepage URL**: your platform's public URL, e.g.
   `https://vibeyeeter.internal.yourcompany.com`.
4. **Webhook URL**: `https://<your platform API host>/webhooks/github`
   (no `/api` prefix — the API mounts this route at the root).
5. **Webhook secret**: generate one (e.g. `openssl rand -hex 32`) and note
   it down — this becomes `GITHUB_WEBHOOK_SECRET`.
6. **Repository permissions** (based on what `packages/github-app` actually
   calls): **Contents** (Read & write — creates/updates files),
   **Pull requests** (Read & write — opens PRs), **Deployments** (Read &
   write — creates deployments and deployment statuses), **Administration**
   (Read & write — creates new repos in the org via
   `repos.createInOrg`).
7. **Subscribe to events**: Push, Pull request, Deployment status.
8. Generate a **private key**, download the `.pem` file, and base64-encode
   it — the platform expects the base64-encoded PEM, not the raw file:
   ```bash
   base64 -i vibeyeeter-bot.private-key.pem
   ```
   This becomes `GITHUB_APP_PRIVATE_KEY`.
9. Note the **App ID** shown on the app's settings page →
   `GITHUB_APP_ID`.
10. **Install the app** on your org (or the specific repos it should manage)
    and note the **Installation ID** from the resulting URL →
    `GITHUB_APP_INSTALLATION_ID`.

All four values (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
`GITHUB_APP_INSTALLATION_ID`, `GITHUB_WEBHOOK_SECRET`), plus `GITHUB_ORG` (the
org repos are provisioned into), go into the API's environment — see
[section 6](#6-environment-variables). Without all five set, the app starts
fine but logs a warning and webhook/repo-op routes no-op.

---

## 4. Cloudflare setup

Cloudflare plays two roles here: **Zero Trust Access** gates who can reach the
platform dashboard/API and per-app subdomains, and the **Cloudflare DNS API**
lets the platform create/delete DNS records for each app's subdomain
automatically.

### 4a. Zero Trust Access application

1. In the Cloudflare dashboard, go to **Zero Trust → Access → Applications**
   and add a **Self-hosted** application.
2. Set the application domain to your platform's wildcard, e.g.
   `*.internal.yourcompany.com` (this is what `infra/cluster/cloudflare.tf`
   provisions as `cloudflare_access_application.apps_wildcard` if you're
   using the provided OpenTofu — one Access application gates every
   `*.<PLATFORM_DOMAIN>` hostname, platform included).
3. Add a policy that allows the identities who should reach the platform
   (e.g. an "Allow" policy scoped to a Google Workspace group or specific
   emails via a Google auth identity provider). The bundled
   `infra/cluster/cloudflare.tf` ships with a stub "allow everyone" policy —
   **replace it with a real policy before going to production.**
4. From the application's settings, note:
   - **`CF_ACCESS_TEAM_DOMAIN`** — your Zero Trust team domain, e.g.
     `yourteam.cloudflareaccess.com`.
   - **`CF_ACCESS_AUD`** — the Application Audience (AUD) tag shown on the
     application's overview page.

**How the login flow works for end users:** a user hits the platform
dashboard, Cloudflare Access intercepts the request and requires them to
authenticate (e.g. via Google), then sets a `CF_Authorization` cookie
containing a signed JWT and forwards the request on. The API's
`GET /auth/cf-callback` route (`apps/api/src/routes/auth.ts`) reads that
cookie, verifies the JWT against Cloudflare's JWKS endpoint
(`https://<CF_ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`) checking the
issuer and `CF_ACCESS_AUD`, extracts the user's email, upserts a `users` row,
and sets its own session cookie. From then on, `requireSession` middleware
just checks that session — Cloudflare Access, not the platform, does the
actual identity verification.

### 4b. DNS API token

1. In Cloudflare, create an **API Token** (My Profile → API Tokens → Create
   Token) scoped to **Zone → DNS → Edit**, restricted to the zone you're
   using for `PLATFORM_DOMAIN`. This becomes `CF_API_TOKEN`.
2. Note the **Zone ID** for that zone (shown on the zone's overview page in
   the Cloudflare dashboard) → `CF_ZONE_ID`.

Without these two set, the platform still tracks each app's domain in its own
database, but skips actually creating the CNAME record — you'd need to create
it manually.

### 4c. Bypass rules for machine-to-machine traffic

CF Access gates every request to `*.<PLATFORM_DOMAIN>` behind an interactive
login, which breaks any caller that isn't a human with a browser session —
GitHub's webhook deliveries and CI/CD pipelines calling the API directly.
Add explicit **Bypass** policies for these routes so Access lets the request
through untouched and the platform's own auth (below) handles it instead:

1. **Webhook bypass.** In **Zero Trust → Access → Applications → [your
   application] → Policies**, add a policy scoped to path
   `/webhooks/github` with action **Bypass**. This endpoint
   (`POST /webhooks/github`) is still secured independently — GitHub signs
   every delivery with an `X-Hub-Signature-256` HMAC using
   `GITHUB_WEBHOOK_SECRET`, and the platform verifies that signature before
   processing the payload, so bypassing CF Access here does not leave it
   open.
2. **CI/CD API bypass.** Routes called by CI/CD systems using `vyt_`-
   prefixed API tokens (issued from Settings → API Tokens, see section 8)
   also need to bypass CF Access, since those callers have no browser
   session to authenticate. At minimum this covers
   `POST /apps/:id/deployments` (the route a managed app's deploy workflow
   hits to register a new deployment) — add a bypass policy for
   `/apps/*/deployments` (or the closest path pattern your CF Access plan
   supports). This route is secured independently by the platform's own
   bearer-token middleware, which validates the `vyt_` token against the
   hashed tokens stored in the `platform_tokens` table.
3. **General principle.** Any future endpoint meant to be called machine-
   to-machine (no browser, no CF Access login) needs one of two things
   before it'll work: an explicit CF Access **Bypass** policy for its path
   (as above), or a **Cloudflare Access service token** configured on the
   caller (sent via `CF-Access-Client-Id` / `CF-Access-Client-Secret`
   headers) if you'd rather keep Access enforcing on the path but let a
   trusted caller through it. Either way, never rely on the endpoint being
   "hard to guess" — pair the bypass with the endpoint's own auth
   (signature verification, bearer token, etc.), the same way the two
   routes above do.

---

## 5. Database setup

The platform uses its own PostgreSQL database, separate from any per-app
databases. `services/tf-runner` can point at the same instance.

1. Provision a Postgres database (locally: `docker-compose.dev.yml` starts a
   local `postgres:16` container on port 5432 with user/password `postgres`/
   `dev` and database `vibeyeeter`; in production: RDS, CloudNativePG, etc.).
2. Set `DATABASE_URL` to a standard Postgres connection string, e.g.
   `postgres://<user>:<pass>@<host>:5432/vibeyeeter`.
3. Run migrations from `apps/api`:
   ```bash
   pnpm --filter @vibeyeeter/api db:migrate
   ```
   This runs `tsx src/db/migrate.ts`, which applies the SQL files in
   `apps/api/src/db/migrations/` (currently `0000` through `0008`) using
   Drizzle's migrator. Schema changes are generated with
   `pnpm --filter @vibeyeeter/api db:generate` (`drizzle-kit generate`,
   config in `apps/api/drizzle.config.ts`), but as an operator you normally
   only ever need `db:migrate`.

`services/tf-runner` has its own copy of the `tf_runs` table schema and reads
`TF_RUNNER_DATABASE_URL` independently — it does not depend on
`@vibeyeeter/api`, so pointing it at the same database as the API is a
convenience, not a requirement.

---

## 6. Environment variables

These are read by `apps/api` (`apps/api/src/config.ts`). Everything here has
been verified against that file and `apps/api/.env.example`.

| Variable | Required? | Description |
|---|---|---|
| `DATABASE_URL` | Required in prod (falls back to a local dev default) | Platform's own Postgres connection string. Default if unset: `postgres://postgres:dev@localhost:5432/vibeyeeter`. |
| `JWT_SECRET` | Required in prod (falls back to `local-dev-secret`) | Legacy signing secret; also the fallback source for `SESSION_SECRET` if that's unset. |
| `SESSION_SECRET` | Recommended | Dedicated secret for signing the session cookie. Falls back to `JWT_SECRET`, and either is right-padded to 32 characters if shorter — but set a real 32+ char value in production. |
| `GITHUB_ORG` | Required for GitHub integration | GitHub org that app repos are provisioned into. No default — a placeholder default would risk provisioning real repos into the wrong org. |
| `GHCR_ORG` | Optional | GitHub org used for container image pushes (`ghcr.io/<GHCR_ORG>/<image>`). Defaults to `GITHUB_ORG`. |
| `GITHUB_APP_ID` | Optional (warns if unset) | GitHub App numeric ID. |
| `GITHUB_APP_PRIVATE_KEY` | Optional (warns if unset) | Base64-encoded PEM private key for the GitHub App. |
| `GITHUB_APP_INSTALLATION_ID` | Optional (warns if unset) | Installation ID of the app on your org. |
| `GITHUB_WEBHOOK_SECRET` | Optional (warns if unset) | HMAC secret for verifying incoming GitHub webhooks. |
| `PLATFORM_DOMAIN` | Optional (warns via other features if unset) | Base domain used for per-app subdomains, e.g. `internal.yourcompany.com`. No default. |
| `PLATFORM_URL` | Optional (warns if unset) | Platform's own public URL; templated into generated app deploy workflows as the deployment webhook target. |
| `CF_ACCESS_TEAM_DOMAIN` | Optional (warns if unset) | Cloudflare Zero Trust team domain, e.g. `yourteam.cloudflareaccess.com`. Required for `/auth/cf-callback` to function. |
| `CF_ACCESS_AUD` | Optional (warns if unset) | Application Audience (AUD) tag from the Cloudflare Access application. |
| `CF_API_TOKEN` | Optional (warns if unset) | Cloudflare API token with Zone → DNS → Edit permission. Used to create/delete per-app DNS records. |
| `CF_ZONE_ID` | Optional (warns if unset) | Cloudflare zone ID for `PLATFORM_DOMAIN`. |
| `CONFIG_ENCRYPTION_KEY` | Strongly recommended in prod | 32-byte hex AES-256-GCM key used to encrypt sensitive `platform_config` values (currently just `CF_API_TOKEN`) set via the Settings UI. Generate with `openssl rand -hex 32`. If unset, those values are stored in plaintext instead — a warning is logged at startup, the platform still runs. |
| `VIBEYEETER_API_TOKEN` | Optional, deprecated | Legacy single static bearer token accepted alongside per-token credentials issued from Settings → API Tokens. New setups should use the token UI instead. |
| `AWS_REGION` | Optional | Default `us-east-1`. Used for Secrets Manager/S3 calls. |
| `TF_RUNNER_URL` | Optional | Internal URL of the `tf-runner` service. Default `http://localhost:4001` locally; `http://tf-runner:4001` in-cluster. |
| `WEB_APP_URL` | Optional | URL of `apps/web`, used for CORS origin and post-login redirects. Default `http://localhost:3000`. |
| `KUBECONFIG` | Optional | Path to a kubeconfig file. If unset, falls back to `~/.kube/config` locally or the in-cluster ServiceAccount in production. Kubernetes-backed routes degrade gracefully (return warnings, not 500s) if none is found. |
| `DEV_AUTH_BYPASS` | Local dev only | If `true`, skips Cloudflare Access entirely and attaches a fake admin user (`{ id: "local", email: "dev@local", teams: ["dev"], isAdmin: true }`) to every request. **Never set in production.** |
| `LOG_LEVEL` | Optional | `debug` \| `info` \| `warn` \| `error`. Default `info`. |
| `PORT` | Optional | API listen port. Default `3002`. |

`apps/web` reads its own, smaller set of variables (`apps/web/.env.example`):
`NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3002`),
`NEXT_PUBLIC_GITHUB_ORG` (cosmetic only — pre-fills the "register app" form),
and `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` (used to build the login
redirect URL — should match the API's values).

`services/tf-runner` reads `TF_RUNNER_DATABASE_URL`, `TOFU_BIN` (default
`tofu`), `LOG_LEVEL`, and `PORT` (default `4001`).

---

## 7. Kubernetes deployment

The platform's own Kubernetes manifests live under `infra/platform/base/`
(a Kustomize base, not a Helm chart — `infra/helm-chart` is the chart
template used for *managed apps*, not the platform itself). Applying them is
scripted by `scripts/deploy-platform.sh`.

### 7a. Provision the cluster (if you don't already have one)

```bash
cd infra/cluster
tofu init
tofu plan
tofu apply
```

This provisions an EKS cluster and VPC, IRSA roles for the `api` and
`tf-runner` ServiceAccounts (note the two role ARNs from the `tofu apply`
output — you'll need them next), the `cloudnative-pg`, `external-secrets`,
and `ingress-nginx` cluster operators, and the Cloudflare Access application
described in section 4a.

Point `kubectl` at it:

```bash
aws eks update-kubeconfig --name <cluster-name> --region us-east-1
kubectl cluster-info
```

### 7b. Namespace and secrets that must exist first

`infra/platform/base/kustomization.yaml` includes `namespace.yaml`, which
creates the `vibeyeeter-system` namespace — you don't need to create it by
hand, `kubectl apply`/the deploy script does it. What you **do** need before
applying:

1. An `aws-secrets-manager` `ClusterSecretStore` for the External Secrets
   Operator (this is a general cluster prerequisite shared with per-app
   `ExternalSecret`s — set it up per your ESO/IRSA configuration).
2. One AWS Secrets Manager secret per credential, under the
   `vibeyeeter/platform/` prefix — `infra/platform/base/externalsecret.yaml`
   pulls everything under that path into a single `vibeyeeter-platform-secrets`
   Kubernetes Secret consumed via `envFrom`. At minimum, create:
   ```bash
   aws secretsmanager create-secret --name vibeyeeter/platform/DATABASE_URL --secret-string "<postgres-url>"
   aws secretsmanager create-secret --name vibeyeeter/platform/SESSION_SECRET --secret-string "<32+ char secret>"
   aws secretsmanager create-secret --name vibeyeeter/platform/GITHUB_APP_ID --secret-string "<numeric app id>"
   aws secretsmanager create-secret --name vibeyeeter/platform/GITHUB_APP_PRIVATE_KEY --secret-string "<base64-encoded PEM>"
   aws secretsmanager create-secret --name vibeyeeter/platform/GITHUB_APP_INSTALLATION_ID --secret-string "<installation id>"
   aws secretsmanager create-secret --name vibeyeeter/platform/GITHUB_WEBHOOK_SECRET --secret-string "<webhook HMAC secret>"
   aws secretsmanager create-secret --name vibeyeeter/platform/TF_RUNNER_DATABASE_URL --secret-string "<postgres-url>"
   aws secretsmanager create-secret --name vibeyeeter/platform/CONFIG_ENCRYPTION_KEY --secret-string "$(openssl rand -hex 32)"
   ```
   `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CF_API_TOKEN`, and `CF_ZONE_ID`
   can also be seeded this way, or set later through the Settings →
   Platform Config UI once the platform is up (see section 8) — the UI
   writes to the database and takes effect immediately without a restart.
3. Non-secret configuration in `infra/platform/base/configmap.yaml`
   (`GITHUB_ORG`, `GHCR_ORG`, `PLATFORM_DOMAIN`, `PLATFORM_URL`,
   `NEXT_PUBLIC_API_URL`) — edit this file, or override with a kustomize
   patch, before applying. None of the values in it have safe defaults.

**Setting `CONFIG_ENCRYPTION_KEY`:** generate it once with
`openssl rand -hex 32` and store it as the Secrets Manager entry above (or
directly in whatever secret mechanism feeds the `api` Deployment's env). It
must stay stable across restarts — rotating it invalidates any already-
encrypted `platform_config` rows (currently just `CF_API_TOKEN`).

### 7c. Build and push images

Push to `main` and let CI build/push, or build locally:

```bash
docker build -f apps/api/Dockerfile -t ghcr.io/<your-org>/vibeyeeter-api:latest .
docker build -f apps/web/Dockerfile -t ghcr.io/<your-org>/vibeyeeter-web:latest .
docker build -f services/tf-runner/Dockerfile -t ghcr.io/<your-org>/vibeyeeter-tf-runner:latest .
docker push ghcr.io/<your-org>/vibeyeeter-api:latest
docker push ghcr.io/<your-org>/vibeyeeter-web:latest
docker push ghcr.io/<your-org>/vibeyeeter-tf-runner:latest
```

### 7d. Apply manifests

```bash
GITHUB_ORG=<your-org> \
GHCR_ORG=<your-org> \
PLATFORM_DOMAIN=internal.yourcompany.com \
PLATFORM_URL=https://vibeyeeter.internal.yourcompany.com \
PLATFORM_API_IRSA_ROLE_ARN=<from tofu output> \
TF_RUNNER_IRSA_ROLE_ARN=<from tofu output> \
./scripts/deploy-platform.sh
```

The script checks that `kubectl`, `tofu`, `helm`, `pnpm`, and `envsubst` are
on `PATH` and that the cluster is reachable, prompts for any of the above
variables not already set (or read from `.env.platform` if present), then
runs `kubectl kustomize infra/platform/base | envsubst | kubectl apply -f -`
and waits for the `api`, `web`, and `tf-runner` Deployments to roll out.

Verify:

```bash
kubectl get pods -n vibeyeeter-system
curl https://vibeyeeter-api.internal.yourcompany.com/health
```

### 7e. Run migrations against the cluster's database

```bash
DATABASE_URL=<platform-postgres-url> pnpm --filter @vibeyeeter/api db:migrate
```

---

## 8. First-time configuration

Once the pods are up and `/health` responds:

1. **Log in via Cloudflare Access.** Visit the dashboard URL (e.g.
   `https://vibeyeeter.internal.yourcompany.com`). Cloudflare Access
   intercepts the request, prompts for your identity provider login (e.g.
   Google), then redirects back through `/auth/cf-callback`, which creates
   your session. The first user to authenticate is not automatically an
   admin — you'll need to mark a `users` row as `isAdmin` directly in the
   database (or via `DEV_AUTH_BYPASS=true` locally, which always grants
   admin) before you can reach the admin-only Settings pages.
2. **Settings → Platform Config** (`/settings/config`, admin only): fill in
   `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CF_API_TOKEN`, `CF_ZONE_ID`,
   and `PLATFORM_DOMAIN` here if you didn't seed them via Secrets Manager.
   Values submitted here are stored in the `platform_config` table (secrets
   encrypted with `CONFIG_ENCRYPTION_KEY`) and take effect immediately — no
   restart needed.
3. **Settings → Teams** (`/settings/teams`, admin only): create your first
   team (name + a lowercase-hyphenated slug). Apps are registered under a
   team, so you'll need at least one before registering an app. You can also
   map external group names to a team here (`POST
   /settings/teams/:id/groups`) for group-based access down the line.
4. **Settings → API Tokens** (`/settings/tokens`, admin only): create a
   token for CI/CD use (e.g. the GitHub Actions workflow in a managed app's
   repo that notifies the platform on deploy). The plaintext token is shown
   **exactly once** at creation time and is never recoverable or logged
   afterward — copy it into your CI secrets immediately.

From here you can register your first app from the dashboard, which
provisions its GitHub repo, namespace, and subdomain.

---

## 9. Local development

For running the whole stack on a workstation:

1. **Bootstrap env files** (creates `.env.local` in each package from its
   `.env.example`, never overwriting an existing one):
   ```bash
   ./scripts/dev-setup.sh
   ```
   Or manually: `cp .env.example .env` per package as needed, then fill in
   any values you want to test against real GitHub/Cloudflare integrations.
   GitHub App and Cloudflare credentials can stay blank for local dev — the
   API starts fine without them and just logs warnings.
2. **Set `DEV_AUTH_BYPASS=true`** in `apps/api/.env.local` to skip
   Cloudflare Access entirely — every request is treated as a fake local
   admin user. Never set this outside local development.
3. **Start Postgres:**
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```
   This runs `postgres:16` on `localhost:5432` (user/password `postgres`/
   `dev`, database `vibeyeeter`).
4. **Install and run everything:**
   ```bash
   pnpm install
   pnpm --filter @vibeyeeter/api db:migrate
   pnpm dev
   ```
   `pnpm dev` runs Turborepo's `dev` task across all packages.

**Ports:**

| Service | Port | Notes |
|---|---|---|
| `apps/web` (Next.js dashboard) | 3000 | `NEXT_PUBLIC_API_BASE_URL` should point at the API port. |
| `apps/api` (Fastify API) | 3002 | Default `PORT`; health check at `/health`. |
| `services/tf-runner` | 4001 | Default `PORT`; internal-only, no external ingress even in production. |
| Postgres (`docker-compose.dev.yml`) | 5432 | user `postgres`, password `dev`, database `vibeyeeter`. |

If you additionally want to exercise real Kubernetes provisioning locally,
`docs/runbook.md` covers running against Rancher Desktop (k3s) and the
`pnpm smoke-test` end-to-end lifecycle test.

---

## 10. Troubleshooting

**Cloudflare Access JWT validation failing (users bounced to `/auth/error`):**
- Confirm `CF_ACCESS_TEAM_DOMAIN` exactly matches your Zero Trust team
  domain (no `https://` prefix, no trailing slash) — the API builds the
  JWKS URL and JWT issuer from it directly
  (`https://<CF_ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`).
- Confirm `CF_ACCESS_AUD` matches the Application Audience tag on the
  *specific* Access application gating the hostname being hit — each Access
  application has its own AUD; using the wrong one causes audience
  verification to fail even though the domain matches.
- If both are unset, `/auth/cf-callback` returns a `503 not_configured`
  immediately rather than attempting verification — check the API logs for
  the "Cloudflare Access is not configured" warning at startup.

**DNS records not being created for new app subdomains:**
- Check the API logs for "Cloudflare DNS is not configured" — this means
  `CF_API_TOKEN` or `CF_ZONE_ID` is missing; the app's domain is still
  tracked in the platform database, but you'll need to create the CNAME
  manually until this is fixed.
- If both are set but record creation still fails, the most common cause is
  an API token scoped to the wrong zone or missing the **Zone → DNS → Edit**
  permission — `services/cloudflare.ts` surfaces the Cloudflare API's own
  error message in the platform logs, so check there first.

**Migrations failing:**
- `DATABASE_URL` must be a standard `postgres://user:pass@host:port/dbname`
  connection string — `drizzle-kit` and the migrator
  (`apps/api/src/db/migrate.ts`) both read it via the same `dbCredentials.url`
  path in `apps/api/drizzle.config.ts`.
- If migrating against a fresh database, ensure the database itself
  (`vibeyeeter` or whatever name you chose) already exists — the migrator
  applies schema changes, it does not create the database.
- Confirm the migrating host can actually reach Postgres (security groups,
  VPC peering, `pg_isready` locally) before assuming it's a migration bug.

**`CONFIG_ENCRYPTION_KEY` not set:**
- This is not fatal — the API logs a warning at startup
  ("`CONFIG_ENCRYPTION_KEY` is not set — sensitive platform config values...
  will be stored in plaintext") and continues to run normally.
- Any secret value saved via Settings → Platform Config (currently just
  `CF_API_TOKEN`) while this is unset is stored in plaintext in the
  `platform_config` table. Set a real key and re-save the value once you
  have one — there's no automatic re-encryption.
