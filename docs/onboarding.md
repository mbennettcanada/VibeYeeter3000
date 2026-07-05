# Onboarding a New Application

This guide walks through registering a new application with VibeYeeter3000.

---

## Prerequisites

- A GitHub repo under the `mbennettcanada` org (or a repo the `vibeyeeter-bot` GitHub App has been granted access to)
- The repo must have a `main` branch
- You must be logged into the platform with a JumpCloud account that belongs to the team you're registering the app under
- An admin must have pre-created your team if it doesn't exist yet

---

## What registration does

When you register an app, the platform automatically:

1. Creates a Kubernetes namespace (`<team>-<app-slug>`)
2. Creates a CloudNative PG PostgreSQL cluster in that namespace
3. Creates an AWS Secrets Manager path for your app (`/vibeyeeter/<team>/<app>/`)
4. Creates an ExternalSecret resource to sync secrets into the namespace
5. Creates a Cloudflare Access policy for your app's subdomain
6. Pushes the following files to your repo (via `vibeyeeter-bot`):
   - `.github/workflows/deploy.yml`
   - `.github/workflows/migrate.yml`
   - `.github/workflows/tf-plan.yml`
   - `.github/workflows/tf-apply.yml`
   - `helm/values.yaml`
   - `infra/backend.tf`
   - `Dockerfile` (if one doesn't exist)
7. Adds `DATABASE_URL` as your first secret in AWS Secrets Manager

---

## Step 1: Add your repo to the template structure

If starting from scratch, use the app template:

```bash
# Clone the template
gh repo create mbennettcanada/my-app --template mbennettcanada/app-template --private
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
   - **GitHub repo**: `mbennettcanada/my-app`
   - **Team**: select your team
   - **App name**: human-readable name (e.g. "Lead Tracker")
   - **Subdomain**: the internal URL prefix (e.g. `lead-tracker` → `lead-tracker.internal.yourcompany.com`)
   - **Postgres size**: small (default), medium, large
4. Click **Register**

The platform shows a progress screen as it sets up your namespace, database, and pushes files.

---

## Step 3: Add your secrets

After registration, go to **Secrets** in your app dashboard and add any environment variables your app needs (API keys, third-party service URLs, etc.). `DATABASE_URL` is already pre-populated.

Your app reads these from `process.env` at runtime — the platform injects them automatically.

---

## Step 4: Push to deploy

Push anything to `main` and your first deployment will kick off automatically. Watch it in the **Deployments** tab.

The first deploy will:
1. Build your Docker image and push to ECR
2. Run any pending Drizzle migrations
3. Start your app pods
4. Attach the Cloudflare Access policy to your subdomain

Your app will be live at `https://<subdomain>.internal.yourcompany.com` — accessible only to authenticated members of your team via JumpCloud SSO.

---

## Step 5: Give your AI agent context

Your repo has a `CLAUDE.md` file (from the template). Open it and fill in the `## What this app does` section so your AI coding agent understands the domain. Everything else in CLAUDE.md (stack, migrations, infra, deployment) is already correct and should not be changed.

---

## Files managed by the platform

These files are owned by the platform and will be overwritten if platform conventions change. Do not edit them manually:

- `.github/workflows/deploy.yml`
- `.github/workflows/migrate.yml`
- `.github/workflows/tf-plan.yml`
- `.github/workflows/tf-apply.yml`
- `helm/values.yaml`
- `infra/backend.tf`
- `Dockerfile` (after initial push)

If you need to change something in these files, contact the platform team — there may be a configuration option, or the platform may need to support your use case.

---

## Adding Terraform resources

Your app's `infra/` directory is where you define any AWS resources your app needs (S3 buckets, SQS queues, additional IAM policies, etc.).

1. Add resources to `infra/main.tf` (or a new `.tf` file)
2. Open a PR — the platform runs `terraform plan` and posts a diff as a PR comment
3. Review the diff, then merge
4. The platform runs `terraform apply` automatically after your deploy succeeds

Do not define EKS, VPC, Cloudflare, or platform-level resources here.

---

## Rollback

In the platform UI, go to **Deployments** → click any previous deploy → **Roll Back**. The platform immediately updates your Helm release to the previous image tag. No code changes needed.

---

## Deregistering an app

Contact the platform admin. Deregistration:
1. Removes the Kubernetes namespace (destroys pods and DB — **data loss**)
2. Archives the ECR repo
3. Removes the Cloudflare Access policy
4. Does NOT run `terraform destroy` automatically — this is a manual step to prevent accidents

Always back up your database before deregistering.
