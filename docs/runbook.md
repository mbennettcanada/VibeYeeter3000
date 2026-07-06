# VibeYeeter3000 — Runbook

Operational procedures for the platform team.

---

## Local Kubernetes testing with Rancher Desktop

### Install

1. Download and install [Rancher Desktop](https://rancherdesktop.io/) (includes k3s + kubectl)
2. Start Rancher Desktop and wait for the cluster to become ready (green status bar)
3. Verify the context:

```bash
kubectl config current-context   # → rancher-desktop
kubectl cluster-info             # → Kubernetes control plane is running at https://127.0.0.1:6443
```

If you previously had an EKS (or other) context active, switch to Rancher Desktop:

```bash
kubectl config use-context rancher-desktop
```

Note: Rancher Desktop writes its config to `~/.kube/config`, replacing or merging with
whatever was there. If you cleared the file manually, Rancher Desktop will rewrite it the
next time the cluster is restarted.

### Run the smoke test

The smoke test exercises the full app lifecycle against the real local k3s cluster:

```bash
# Prerequisites:
#   - Rancher Desktop running (rancher-desktop context active)
#   - API running: cd apps/api && pnpm dev  (or pnpm dev from root)
#   - Postgres running: docker compose -f docker-compose.dev.yml up -d
#   - psql on PATH (postgres CLI tools)

pnpm smoke-test
```

The test creates a test app, verifies the namespace appears in k3s, triggers a deployment,
waits for pods to reach Running phase, then tears everything down. Exit 0 = pass, 1 = fail.

### Useful local kubectl commands

```bash
# Watch all vibeyeeter namespaces
kubectl get namespaces | grep vibeyeeter

# Watch pods in a specific app namespace
kubectl get pods -n vibeyeeter-<appId> -w

# Describe a pod (good for diagnosing ImagePullBackOff, probe failures)
kubectl describe pod <pod-name> -n vibeyeeter-<appId>

# Get logs from a pod
kubectl logs -n vibeyeeter-<appId> -l app=app --tail=50

# Delete a test namespace manually (if a smoke test left one behind)
kubectl delete namespace vibeyeeter-<appId>
```

---

## Platform bootstrap (first-time production setup)

### 1. AWS prerequisites

```bash
# Create the OpenTofu state bucket
aws s3api create-bucket \
  --bucket vibeyeeter-tf-state \
  --region us-east-1

aws s3api put-bucket-versioning \
  --bucket vibeyeeter-tf-state \
  --versioning-configuration Status=Enabled

# Create the DynamoDB lock table
aws dynamodb create-table \
  --table-name vibeyeeter-tf-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

Create the platform's own credentials in AWS Secrets Manager — the
`ExternalSecret` in `infra/platform/base/externalsecret.yaml` expects one
secret per key under the `vibeyeeter/platform/` prefix:

```bash
aws secretsmanager create-secret --name vibeyeeter/platform/DATABASE_URL --secret-string "<postgres-url>"
aws secretsmanager create-secret --name vibeyeeter/platform/SESSION_SECRET --secret-string "<32+ char secret>"
aws secretsmanager create-secret --name vibeyeeter/platform/GITHUB_APP_ID --secret-string "<numeric app id>"
aws secretsmanager create-secret --name vibeyeeter/platform/GITHUB_APP_PRIVATE_KEY --secret-string "<base64-encoded PEM>"
aws secretsmanager create-secret --name vibeyeeter/platform/GITHUB_APP_INSTALLATION_ID --secret-string "<installation id>"
aws secretsmanager create-secret --name vibeyeeter/platform/GITHUB_WEBHOOK_SECRET --secret-string "<webhook HMAC secret>"
aws secretsmanager create-secret --name vibeyeeter/platform/CF_ACCESS_TEAM_DOMAIN --secret-string "<yourteam.cloudflareaccess.com>"
aws secretsmanager create-secret --name vibeyeeter/platform/CF_ACCESS_AUD --secret-string "<Access application AUD tag>"
aws secretsmanager create-secret --name vibeyeeter/platform/CF_API_TOKEN --secret-string "<Cloudflare DNS-edit API token>"
aws secretsmanager create-secret --name vibeyeeter/platform/CF_ZONE_ID --secret-string "<Cloudflare zone id>"
aws secretsmanager create-secret --name vibeyeeter/platform/TF_RUNNER_DATABASE_URL --secret-string "<postgres-url>"
```

### 2. Provision EKS cluster

```bash
cd infra/cluster
tofu init
tofu plan
tofu apply
```

This creates:
- EKS cluster and VPC with private subnets
- IRSA roles for `platform-api` and `tf-runner` (note the two role ARNs in
  the `tofu apply` output — `deploy-platform.sh` needs them)
- The `cloudnative-pg`, `external-secrets`, and `ingress-nginx` cluster
  operators (via `infra/cluster/operators.tf`)
- Cloudflare Access application gating `*.<PLATFORM_DOMAIN>` ingress

### 3. Point kubectl at the new cluster

```bash
aws eks update-kubeconfig --name <cluster-name> --region us-east-1
kubectl cluster-info
```

The `aws-secrets-manager` `ClusterSecretStore` (used by both this
`ExternalSecret` and every per-app one) must exist before continuing — see
your External Secrets Operator setup for how that store's IAM trust is
configured for this cluster.

### 4. Build and push platform images

Push to `main` and let `.github/workflows/build-and-push.yml` build and push
`ghcr.io/<org>/vibeyeeter-{api,web,tf-runner}:<sha>`, or build locally:

```bash
docker build -f apps/api/Dockerfile -t ghcr.io/your-org/vibeyeeter-api:latest .
docker build -f apps/web/Dockerfile -t ghcr.io/your-org/vibeyeeter-web:latest .
docker build -f services/tf-runner/Dockerfile -t ghcr.io/your-org/vibeyeeter-tf-runner:latest .
docker push ghcr.io/your-org/vibeyeeter-api:latest
docker push ghcr.io/your-org/vibeyeeter-web:latest
docker push ghcr.io/your-org/vibeyeeter-tf-runner:latest
```

### 5. Apply platform manifests and verify

```bash
GITHUB_ORG=your-org \
PLATFORM_DOMAIN=internal.yourcompany.com \
PLATFORM_URL=https://vibeyeeter.internal.yourcompany.com \
PLATFORM_API_IRSA_ROLE_ARN=<from tofu output> \
TF_RUNNER_IRSA_ROLE_ARN=<from tofu output> \
./scripts/deploy-platform.sh
```

This applies `infra/platform/base/`, waits for the three Deployments to roll
out, and prints the dashboard/API URLs. Verify:

```bash
kubectl get pods -n vibeyeeter-system
curl https://vibeyeeter-api.internal.yourcompany.com/health
```

### 6. Run database migrations

```bash
DATABASE_URL=<platform-postgres-url> pnpm --filter @vibeyeeter/api db:migrate
```

### 7. Register GitHub App

1. Go to `https://github.com/organizations/your-org/settings/apps/new`
2. App name: `vibeyeeter-bot`
3. Homepage URL: `https://vibeyeeter.internal.yourcompany.com`
4. Webhook URL: `https://vibeyeeter.internal.yourcompany.com/api/webhooks/github`
5. Webhook secret: generate and store in AWS Secrets Manager at `/vibeyeeter/platform/github-webhook-secret`
6. Permissions: Contents (R/W), Workflows (W), Pull requests (W), Deployments (W)
7. Events: Push, Pull request, Deployment status
8. Generate and download private key → base64-encode it:
   ```bash
   base64 -i vibeyeeter-bot.private-key.pem
   ```
   Store as `GITHUB_APP_PRIVATE_KEY` in the API's environment.
9. Note the App ID → `GITHUB_APP_ID`
10. Install the app on the `your-org` org → note the Installation ID → `GITHUB_APP_INSTALLATION_ID`

### 8. Configure Cloudflare Access

The platform authenticates operators via Cloudflare Zero Trust Access, not a
local login form — Access gates the request before it ever reaches the app,
then the API verifies the resulting JWT.

1. In the Cloudflare dashboard: **Zero Trust → Access → Applications → Add
   an application → Self-hosted**.
2. Application domain: `*.internal.yourcompany.com` (the wildcard covers the
   platform dashboard/API and every per-app subdomain — this is also what
   `infra/cluster/cloudflare.tf` provisions as
   `cloudflare_access_application.apps_wildcard` if you're using the bundled
   OpenTofu).
3. Add a policy scoped to your identity provider (e.g. an Access group tied
   to Google Workspace) — replace the bundled stub "allow everyone" policy
   (`cloudflare_access_policy.apps_wildcard_stub`) before this gates a real
   deployment.
4. From the application's Overview tab, note:
   - **Team domain** (e.g. `yourteam.cloudflareaccess.com`) → `CF_ACCESS_TEAM_DOMAIN`
   - **Application Audience (AUD) tag** → `CF_ACCESS_AUD`

No callback/ACS URL registration is needed — Cloudflare sets a
`CF_Authorization` cookie automatically once a user authenticates, and the
API's `GET /auth/cf-callback` route reads and verifies it (see
[Auth troubleshooting](#auth-troubleshooting) below for how that verification
works).

### 9. Set all required environment variables

Most of these are already covered by the Secrets Manager entries in step 1
(synced in automatically via ExternalSecret) and the `PLATFORM_*`/`GITHUB_ORG`
values passed to `deploy-platform.sh` in step 5. This is the full reference
if you're running a service outside the cluster (e.g. debugging locally
against production data):

**API (`apps/api/.env` or Kubernetes secret):**

```bash
DATABASE_URL=postgres://<user>:<pass>@<host>/vibeyeeter
JWT_SECRET=<32+ char secret>

# GitHub App (vibeyeeter-bot)
GITHUB_APP_ID=<numeric app id>
GITHUB_APP_PRIVATE_KEY=<base64-encoded PEM>
GITHUB_APP_INSTALLATION_ID=<installation id>
GITHUB_WEBHOOK_SECRET=<webhook HMAC secret>
GITHUB_ORG=your-org

# Cloudflare Access — verifies the CF_Authorization cookie JWT
CF_ACCESS_TEAM_DOMAIN=yourteam.cloudflareaccess.com
CF_ACCESS_AUD=<Access application AUD tag>

# Cloudflare DNS — creates/deletes per-app subdomain records
CF_API_TOKEN=<DNS-edit API token>
CF_ZONE_ID=<zone id for PLATFORM_DOMAIN>

AWS_REGION=us-east-1
TF_RUNNER_URL=http://tf-runner:4001

# Optional
KUBECONFIG=/path/to/kubeconfig   # only if not using in-cluster service account
LOG_LEVEL=info
PORT=3002
```

**tf-runner (`services/tf-runner/.env` or Kubernetes secret):**

```bash
TF_RUNNER_DATABASE_URL=postgres://<user>:<pass>@<host>/vibeyeeter
TOFU_BIN=tofu     # or path to opentofu binary if not on PATH
LOG_LEVEL=info
PORT=4001
```

---

## Auth troubleshooting

The platform does not run its own login form. Cloudflare Zero Trust Access
sits in front of the dashboard and API, gates every request to
`*.<PLATFORM_DOMAIN>` against the policy configured in step 8 above, and, on
success, sets a `CF_Authorization` cookie containing a signed JWT before
forwarding the request on. `GET /auth/cf-callback`
(`apps/api/src/routes/auth.ts`) is what the platform itself does with that
cookie:

1. Reads the `CF_Authorization` cookie. No cookie → redirect to
   `${WEB_APP_URL}/auth/error`.
2. Verifies the JWT against Cloudflare's JWKS endpoint
   (`https://<CF_ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`), checking:
   - **issuer** = `https://<CF_ACCESS_TEAM_DOMAIN>`
   - **audience** = `CF_ACCESS_AUD`
3. Extracts `email` from the verified payload, upserts a `users` row, and
   sets the platform's own session cookie.
4. Redirects to `WEB_APP_URL`. Any verification failure (bad signature,
   wrong issuer/audience, missing email claim) redirects to `/auth/error`
   instead and logs the error.

If `CF_ACCESS_TEAM_DOMAIN` or `CF_ACCESS_AUD` is unset, `/auth/cf-callback`
returns `503 not_configured` immediately rather than attempting verification.

**Users bounced to `/auth/error`:**
- Check API logs for the underlying `jwtVerify` error first —
  `request.log.error(error)` logs it before redirecting.
- **Wrong team domain**: `CF_ACCESS_TEAM_DOMAIN` must be exactly the Zero
  Trust team domain with no `https://` prefix and no trailing slash — it's
  used verbatim to build both the JWKS URL and the expected `issuer`.
- **Wrong AUD**: `CF_ACCESS_AUD` must be the AUD tag from the *specific*
  Access application gating the hostname being hit. Each Access application
  has its own AUD; a copy-pasted AUD from a different application (e.g. a
  per-app one instead of the platform wildcard) fails audience verification
  even though the cookie is otherwise valid.
- **No `CF_Authorization` cookie at all**: the request likely bypassed
  Cloudflare Access entirely (e.g. hitting the origin directly instead of
  through the `*.<PLATFORM_DOMAIN>` hostname, or a misconfigured/missing
  Access application for that hostname).
- **Local development**: set `DEV_AUTH_BYPASS=true` to skip this flow
  entirely rather than trying to stand up Access locally — every request is
  attached a fake local admin user instead.

---

## Day-to-day operations

### Check platform health

```bash
kubectl get pods -n vibeyeeter-system
kubectl logs -n vibeyeeter-system deploy/api --tail=50
kubectl logs -n vibeyeeter-system deploy/web --tail=50
```

### Check a specific app

```bash
# Namespace is vibeyeeter-<appId>
kubectl get pods -n vibeyeeter-<appId>

# Check deployment status
kubectl rollout status deployment/app -n vibeyeeter-<appId>

# Get logs
kubectl logs -n vibeyeeter-<appId> deploy/app --tail=100

# Describe pod (for crash debugging)
kubectl describe pod -n vibeyeeter-<appId> <pod-name>
```

### Manually trigger a rollback

If the platform UI is unavailable:

```bash
# List image history
aws ecr describe-images --repository-name <app> --query 'sort_by(imageDetails,&imagePushedAt)[-10:].imageTags'

# Update helm values to previous tag
helm upgrade <app> infra/helm-chart \
  --namespace vibeyeeter-<appId> \
  --set image.tag=<previous-tag> \
  --reuse-values
```

Or via the API directly:

```bash
curl -X POST http://localhost:3002/apps/<appId>/deployments/<deploymentId>/rollback
```

### Add a secret manually

```bash
aws secretsmanager put-secret-value \
  --secret-id /vibeyeeter/<team>/<app>/<KEY> \
  --secret-string "<value>"

# Trigger ExternalSecret refresh
kubectl annotate externalsecret app-secrets \
  -n vibeyeeter-<appId> \
  force-sync=$(date +%s) \
  --overwrite

# Rolling restart to pick up new secret
kubectl rollout restart deployment/app -n vibeyeeter-<appId>
```

### Run OpenTofu manually

```bash
cd /tmp
git clone https://github.com/your-org/<app>
cd <app>/infra

# Backend config is already in backend.tf
tofu init
tofu plan
tofu apply
```

### Force a migration run

```bash
# Create a one-off Job using the app image
kubectl create job migrate-manual --image=<ecr-image> \
  -n vibeyeeter-<appId> \
  -- npx drizzle-kit migrate

kubectl logs -n vibeyeeter-<appId> job/migrate-manual -f
```

---

## Incident response

### App is down (pods not running)

1. Check pod status: `kubectl get pods -n vibeyeeter-<appId>`
2. If `CrashLoopBackOff`: `kubectl logs -n vibeyeeter-<appId> <pod> --previous`
3. If `ImagePullBackOff`: check ECR repo exists and IAM permissions
4. If `Pending`: check node capacity (`kubectl describe nodes`)
5. Roll back via UI or manual Helm command if the bad deploy is the cause

### Migration failed and blocked deploy

1. Check migration Job logs: `kubectl logs -n vibeyeeter-<appId> job/migrate-<timestamp>`
2. Connect to DB to diagnose: `kubectl exec -n vibeyeeter-<appId> -it <cnpg-pod> -- psql -U app <dbname>`
3. If migration is partially applied and needs rollback, coordinate with app owner — Drizzle doesn't auto-rollback
4. After fixing, delete the failed Job and re-trigger deploy

### Database is unavailable

1. Check CNPG cluster status: `kubectl get cluster -n vibeyeeter-<appId>`
2. Check CNPG pod logs: `kubectl logs -n vibeyeeter-<appId> <cnpg-primary-pod>`
3. If primary is unhealthy, CNPG will promote a replica automatically within ~30s
4. For data recovery: see [Database backup restore](#database-backup-restore)

### Platform UI is down

1. Check platform pods: `kubectl get pods -n vibeyeeter-system`
2. If API pod is crashing, check logs and redeploy if needed
3. Core app functionality (GitHub Actions, Kubernetes) continues to work without the platform UI
4. Apps continue to deploy on push even if the platform UI is unavailable

---

## Database backup restore

CNPG takes continuous WAL backups to S3. To restore:

```bash
# List available backups
kubectl get backup -n vibeyeeter-<appId>

# Point-in-time restore (creates a new cluster)
cat <<EOF | kubectl apply -f -
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: <app>-db-restored
  namespace: vibeyeeter-<appId>
spec:
  instances: 1
  bootstrap:
    recovery:
      source: <app>-db
      recoveryTarget:
        targetTime: "2024-01-15 14:30:00"
  externalClusters:
    - name: <app>-db
      barmanObjectStore:
        destinationPath: s3://vibeyeeter-db-backups/<team>/<app>
        s3Credentials:
          inheritFromIAMRole: true
EOF
```

After restoring, update the app's `DATABASE_URL` secret to point to the restored cluster.

---

## Adding a new team

1. In the platform admin UI: Settings → Teams → Add Team → enter a name and
   a lowercase-hyphenated slug (`POST /settings/teams`).
2. Optionally map an external identity group to the team via
   `POST /settings/teams/:id/groups` (`groupName`) — this is stored for
   future group-based access but is not yet read from the Cloudflare Access
   JWT: `/auth/cf-callback` currently only extracts the user's `email`
   claim, so team membership isn't auto-assigned from a Cloudflare Access
   group today.
3. Users authenticate via Cloudflare Access (see step 8 /
   [Auth troubleshooting](#auth-troubleshooting)) — their platform user
   record is created automatically on first login by email.

---

## Upgrading platform conventions

When you change a generated file template (e.g. update the deploy workflow):

1. Update the template in `packages/github-app/templates/`
2. Run the regeneration script:
   ```bash
   pnpm run regenerate-workflows --all
   ```
3. This opens PRs against all registered app repos with the updated files
4. Review and merge — apps pick up the new workflow on next push to main

---

## Decommissioning an app

```bash
# 1. Back up the database first
kubectl annotate cluster <app>-db -n vibeyeeter-<appId> \
  cnpg.io/immediateCheckpoint=true

# 2. Delete via API (soft-deletes the record and deletes the k8s namespace)
curl -X DELETE http://localhost:3002/apps/<appId>

# 3. Run tofu destroy (manual — requires confirmation)
cd /tmp/<app>/infra
tofu destroy

# 4. Delete ECR repo (or archive it)
aws ecr delete-repository --repository-name <app> --force

# 5. Remove Cloudflare Access policy (via Cloudflare dashboard or API)

# 6. Remove secrets from AWS Secrets Manager
aws secretsmanager delete-secret --secret-id /vibeyeeter/<team>/<app>/DATABASE_URL
# repeat for each secret
```
