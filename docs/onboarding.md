# Onboarding a New Application

This guide walks through registering a new application with VibeYeeter3000.

---

## Prerequisites

- A GitHub repo under the `your-org` org (or a repo the `vibeyeeter-bot` GitHub App has access to)
- The repo must have a `main` branch
- You must be logged into the platform (via Cloudflare Access) with an account that belongs to the team you're registering the app under
- An admin must have pre-created your team if it doesn't exist yet

---

## What registration does

When you register an app (`POST /apps`), the platform:

1. Creates a row in the `apps` table (name, slug, teamId, repoUrl, namespace, subdomain)
2. Provisions GitHub (if `GITHUB_APP_ID` is configured):
   - Creates the repo in the `your-org` org (if it doesn't exist)
   - Pushes `CLAUDE.md` to the repo via `vibeyeeter-bot`
3. Provisions Kubernetes (if a kubeconfig is present):
   - Creates a Namespace: `vibeyeeter-<appId>` (where `<appId>` is the app's UUID)
   - Creates a ClusterIP Service named `app` (port 3000)
   - Creates an nginx Ingress for `<subdomain>.internal`
4. Assigns the app's public domain: creates an `app_domains` row for
   `<slug>.<PLATFORM_DOMAIN>` and, if `CF_API_TOKEN`/`CF_ZONE_ID` are
   configured, creates the corresponding Cloudflare DNS CNAME record. Without
   those set, the domain is still tracked in the database, but the CNAME must
   be created manually (see Settings → Domains, or the app's Domains tab).

If GitHub App or Kubernetes is not configured, the registration still succeeds and the
response includes a `warnings` array describing what was skipped. This allows local
development without all integrations wired up.

**In production**, registration additionally creates (not yet automated):
- CloudNative PG PostgreSQL cluster
- ExternalSecret resource (syncs from `/vibeyeeter/<team>/<app>/` in AWS Secrets Manager)
- ServiceAccount with IRSA annotation
- NetworkPolicy (deny cross-namespace traffic)

The app's public hostname is gated by the platform's single wildcard
Cloudflare Access application (`*.<PLATFORM_DOMAIN>`) — no per-app Access
policy is created separately.

---

## API: `POST /apps`

```http
POST /apps
Content-Type: application/json

{
  "name": "Lead Tracker",
  "teamId": "<uuid of the team>",
  "subdomain": "lead-tracker",
  "repoUrl": "https://github.com/your-org/lead-tracker"
}
```

**Required fields:**
- `name` (1–100 chars) — human-readable app name; also used to derive the slug
- `teamId` (UUID) — the team this app belongs to; must exist in the `teams` table
- `subdomain` (lowercase alphanumeric + hyphens) — determines the app's internal URL
- `repoUrl` (URL) — the GitHub repo URL

**Response on success (201):**
```json
{
  "app": {
    "id": "<uuid>",
    "name": "Lead Tracker",
    "slug": "lead-tracker",
    "teamId": "<uuid>",
    "repoUrl": "https://github.com/your-org/lead-tracker",
    "namespace": "lead-tracker",
    "subdomain": "lead-tracker",
    "createdAt": "2024-01-15T12:00:00.000Z",
    "updatedAt": "2024-01-15T12:00:00.000Z"
  },
  "warnings": ["GitHub App is not configured — skipped repo provisioning."]
}
```

The `warnings` array is omitted when everything succeeds. When present, it lists which
optional integrations were skipped (GitHub, Kubernetes) — the app row is still created.

---

## Step 1: Add your repo to the template structure

If starting from scratch, use the app template:

```bash
gh repo create your-org/my-app --template your-org/app-template --private
cd my-app
```

If onboarding an existing repo, make sure it has:
- `db/migrations/` directory (can be empty)
- `infra/` directory with at least a `main.tf` and `variables.tf`
- TypeScript configured

---

## Step 2: Register in the platform UI

1. Log into the platform at `https://vibeyeeter.internal.yourcompany.com`
2. Click **New Application**
3. Fill in:
   - **GitHub repo**: `your-org/my-app`
   - **Team**: select your team
   - **App name**: human-readable name (e.g. "Lead Tracker")
   - **Subdomain**: the internal URL prefix (e.g. `lead-tracker` → `lead-tracker.internal.yourcompany.com`)
4. Click **Register**

The platform creates the namespace and pushes `CLAUDE.md` to your repo in the background.
Any warnings (GitHub not configured, Kubernetes not configured) are shown on the result screen.

---

## Step 3: Add your secrets

After registration, go to **Secrets** in your app dashboard and add any environment variables
your app needs (API keys, third-party service URLs, etc.).

Secrets are stored in AWS Secrets Manager at `/vibeyeeter/<team>/<app>/<KEY>` and synced
into your Kubernetes namespace via the External Secrets Operator. Your app reads them as
normal environment variables — no code change needed.

**Key names must be `SCREAMING_SNAKE_CASE`** (letters, digits, underscores only).

---

## Step 4: Deploy

Trigger your first deployment by calling `POST /apps/:id/deployments` with an image tag,
or by pushing to `main` (once the GitHub Actions workflow is in place):

```http
POST /apps/<appId>/deployments
Content-Type: application/json

{ "imageTag": "nginx:latest" }
```

This creates a Kubernetes Deployment named `app` in the `vibeyeeter-<appId>` namespace,
plus a deployment record in the platform DB. Watch pod status via `GET /apps/:id/pods`.

In the full production flow:
1. Push to `main` → GitHub Actions builds image → pushes to ECR
2. Platform API receives push webhook → creates Deployment
3. Migration Job runs before pods roll out
4. App goes live at `https://<subdomain>.internal.yourcompany.com`

---

## Step 5: Give your AI agent context

Your repo has a `CLAUDE.md` file (pushed by the platform on registration). Open it and
fill in the `## What this app does` section so your AI coding agent understands the domain.
Everything else (stack, migrations, infra, deployment) is pre-filled and should not be changed.

---

## Files managed by the platform

These files are owned by the platform and will be overwritten if platform conventions change.
Do not edit them manually:

- `CLAUDE.md` (after initial push)
- `.github/workflows/deploy.yml` (when workflow generation is implemented)
- `.github/workflows/migrate.yml`
- `.github/workflows/tf-plan.yml`
- `.github/workflows/tf-apply.yml`
- `helm/values.yaml`
- `infra/backend.tf`
- `Dockerfile` (after initial push)

If you need to change something in these files, contact the platform team.

---

## Adding OpenTofu resources

Your app's `infra/` directory is where you define any AWS resources your app needs
(S3 buckets, SQS queues, additional IAM policies, etc.).

1. Add resources to `infra/main.tf` (or a new `.tf` file)
2. Open a PR — the platform runs `tofu plan` and posts a diff as a PR comment
3. Review the diff, then merge
4. The platform runs `tofu apply` automatically after your deploy succeeds

Do not define EKS, VPC, Cloudflare, or platform-level resources here.

---

## Rollback

In the platform UI, go to **Deployments** → click any previous deploy → **Roll Back**.
The platform calls `POST /apps/:id/deployments/:deploymentId/rollback`, which re-applies
the previous image tag as a new deployment. No code changes needed.

---

## Deregistering an app

Contact the platform admin. Calling `DELETE /apps/:id`:
1. Soft-deletes the app record (deployment and tf run history is preserved)
2. Deletes the Kubernetes namespace (destroys pods — **no data loss for the DB**, but pods are gone)

Full cleanup (DB backup, ECR repo archive, Cloudflare policy removal, OpenTofu destroy)
is a manual step to prevent accidents. Always back up your database before full deregistration.
