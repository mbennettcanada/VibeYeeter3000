#!/usr/bin/env bash
# One-time local dev setup: creates .env.local files for apps that need them.
# Safe to re-run — it never overwrites an existing .env.local.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

setup_env() {
  local dir="$1"
  local example="$dir/.env.example"
  local target="$dir/.env.local"

  if [[ ! -f "$example" ]]; then
    echo "skip: $example not found"
    return
  fi

  if [[ -f "$target" ]]; then
    echo "skip: $target already exists"
    return
  fi

  cp "$example" "$target"
  echo "created $target"
}

setup_env "apps/api"
setup_env "apps/web"
setup_env "services/tf-runner"

cat <<'EOF'

Local defaults written. GitHub App and Cloudflare Access/API credentials are
left blank — the API starts fine without them (warnings are logged), and
DEV_AUTH_BYPASS=true stands in for Cloudflare Access SSO locally.

Next steps:
  docker compose -f docker-compose.dev.yml up -d
  pnpm install
  pnpm --filter @vibeyeeter/api db:migrate
  pnpm dev
EOF
