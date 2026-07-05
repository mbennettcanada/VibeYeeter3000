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

### 2. Provision EKS cluster

```bash
cd infra/platform
tofu init
tofu plan
tofu apply
```

This creates:
- EKS cluster (3× m5.xlarge, us-east-1)
- VPC with private subnets
- ALB + ACM certificate
- ECR lifecycle policy
- IAM roles for platform components (IRSA)

### 3. Install cluster components

```bash
# Update kubeconfig
aws eks update-kubeconfig --name vibeyeeter --region us-east-1

# Install components via Helm
helm repo add jetstack https://charts.jetstack.io
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add cnpg https://cloudnative-pg.github.io/charts
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

helm install cert-manager jetstack/cert-manager -n cert-manager --create-namespace --set installCRDs=true
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace
helm install cnpg cnpg/cloudnative-pg -n cnpg-system --create-namespace
helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace

# Create platform namespace
kubectl create namespace vibeyeeter-system
```

### 4. Run database migrations

```bash
# Apply platform DB schema
DATABASE_URL=postgres://<host>/vibeyeeter pnpm --filter @vibeyeeter/api db:migrate
```

### 5. Register GitHub App

1. Go to `https://github.com/organizations/mbennettcanada/settings/apps/new`
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
10. Install the app on the `mbennettcanada` org → note the Installation ID → `GITHUB_APP_INSTALLATION_ID`

### 6. Configure JumpCloud SAML

1. In JumpCloud admin: Applications → Add Application → Custom SAML App
2. Display name: `VibeYeeter3000`
3. SP Entity ID: `https://vibeyeeter.internal.yourcompany.com/saml/metadata`
4. ACS URL: `https://vibeyeeter.internal.yourcompany.com/saml/callback`
5. Download IdP metadata XML → extract the certificate → set as `JUMPCLOUD_SAML_CERT`
6. Attribute mappings:
   - `email` → user email
   - `groups` → user's JumpCloud group names

### 7. Set all required environment variables

**API (`apps/api/.env` or Kubernetes secret):**

```bash
DATABASE_URL=postgres://<user>:<pass>@<host>/vibeyeeter
JWT_SECRET=<32+ char secret>

# GitHub App (vibeyeeter-bot)
GITHUB_APP_ID=<numeric app id>
GITHUB_APP_PRIVATE_KEY=<base64-encoded PEM>
GITHUB_APP_INSTALLATION_ID=<installation id>
GITHUB_WEBHOOK_SECRET=<webhook HMAC secret>
GITHUB_ORG=mbennettcanada

# JumpCloud SAML
JUMPCLOUD_SAML_CERT=<IdP certificate PEM>
SAML_SP_ENTITY_ID=https://vibeyeeter.internal.yourcompany.com/saml/metadata
SAML_CALLBACK_URL=https://vibeyeeter.internal.yourcompany.com/saml/callback

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

### 8. Deploy the platform

```bash
# Build and push platform images
docker build -t <account>.dkr.ecr.us-east-1.amazonaws.com/vibeyeeter-web:latest apps/web
docker build -t <account>.dkr.ecr.us-east-1.amazonaws.com/vibeyeeter-api:latest apps/api
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/vibeyeeter-web:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/vibeyeeter-api:latest

# Apply platform manifests
kubectl apply -k k8s/platform/
```

---

## Day-to-day operations

### Check platform health

```bash
kubectl get pods -n vibeyeeter-system
kubectl logs -n vibeyeeter-system deploy/vibeyeeter-api --tail=50
kubectl logs -n vibeyeeter-system deploy/vibeyeeter-web --tail=50
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
helm upgrade <app> k8s/app-chart \
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
git clone https://github.com/mbennettcanada/<app>
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

1. Create a JumpCloud group named `team-<slug>`
2. In the platform admin UI: Teams → Add Team → enter slug and display name
3. Assign users to the JumpCloud group
4. Users can now log into the platform and see/create apps under that team

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
