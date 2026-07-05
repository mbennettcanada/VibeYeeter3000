#!/usr/bin/env bash
# Deploys the platform itself (apps/api, apps/web, services/tf-runner) to the
# EKS cluster provisioned by infra/cluster, using the manifests in
# infra/platform/base. Safe to re-run — kubectl apply is idempotent.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

ENV_FILE="${ENV_FILE:-.env.platform}"
MANIFEST_DIR="infra/platform/base"
NAMESPACE="vibeyeeter-system"

# ---------------------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------------------
echo "==> Checking prerequisites"

missing_tools=()
for tool in kubectl tofu helm pnpm envsubst; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    missing_tools+=("$tool")
  fi
done

if [[ ${#missing_tools[@]} -gt 0 ]]; then
  echo "Missing required tools: ${missing_tools[*]}" >&2
  echo "Install them and re-run this script." >&2
  exit 1
fi

if [[ -z "${KUBECONFIG:-}" && ! -f "$HOME/.kube/config" ]]; then
  echo "KUBECONFIG is not set and no ~/.kube/config was found." >&2
  echo "Point KUBECONFIG at the platform cluster's kubeconfig and re-run." >&2
  exit 1
fi

if ! kubectl cluster-info >/dev/null 2>&1; then
  echo "Cannot reach the Kubernetes cluster (kubectl cluster-info failed)." >&2
  echo "Check KUBECONFIG / VPN / cluster auth and re-run." >&2
  exit 1
fi

echo "    all required tools found, cluster reachable"

# ---------------------------------------------------------------------------
# 2. Required env vars — read from $ENV_FILE if present, else prompt
# ---------------------------------------------------------------------------
if [[ -f "$ENV_FILE" ]]; then
  echo "==> Loading env vars from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

prompt_if_missing() {
  local var_name="$1"
  local prompt_text="$2"
  local current="${!var_name:-}"

  if [[ -z "$current" ]]; then
    read -r -p "$prompt_text: " current
    export "$var_name=$current"
  fi
}

echo "==> Checking required configuration"
prompt_if_missing GITHUB_ORG "GitHub org apps are provisioned into (GITHUB_ORG)"
prompt_if_missing GHCR_ORG "GitHub org used for container image pushes (GHCR_ORG, defaults to GITHUB_ORG)"
: "${GHCR_ORG:=$GITHUB_ORG}"
prompt_if_missing PLATFORM_DOMAIN "Base domain for app subdomains (PLATFORM_DOMAIN, e.g. internal.yourcompany.com)"
prompt_if_missing PLATFORM_URL "Platform's own URL (PLATFORM_URL, e.g. https://vibeyeeter.\$PLATFORM_DOMAIN)"
prompt_if_missing PLATFORM_API_IRSA_ROLE_ARN "IRSA role ARN for the api ServiceAccount (PLATFORM_API_IRSA_ROLE_ARN — see infra/cluster irsa.tf output)"
prompt_if_missing TF_RUNNER_IRSA_ROLE_ARN "IRSA role ARN for the tf-runner ServiceAccount (TF_RUNNER_IRSA_ROLE_ARN — see infra/cluster irsa.tf output)"

export GITHUB_ORG GHCR_ORG PLATFORM_DOMAIN PLATFORM_URL PLATFORM_API_IRSA_ROLE_ARN TF_RUNNER_IRSA_ROLE_ARN

# ---------------------------------------------------------------------------
# 3. Render and apply manifests
# ---------------------------------------------------------------------------
echo "==> Applying $MANIFEST_DIR"
kubectl kustomize "$MANIFEST_DIR" | envsubst | kubectl apply -f -

# ---------------------------------------------------------------------------
# 4. Wait for rollout
# ---------------------------------------------------------------------------
echo "==> Waiting for deployments to roll out"
for deployment in api web tf-runner; do
  kubectl rollout status "deployment/$deployment" -n "$NAMESPACE" --timeout=300s
done

# ---------------------------------------------------------------------------
# 5. Print URLs
# ---------------------------------------------------------------------------
cat <<EOF

Platform deployed.

  Dashboard: https://vibeyeeter.${PLATFORM_DOMAIN}
  API:       https://vibeyeeter-api.${PLATFORM_DOMAIN}

Both are internal-only — reachable through Cloudflare Access / the internal
network, not the public internet.
EOF
