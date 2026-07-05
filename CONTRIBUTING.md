# Contributing to VibeYeeter3000

Thanks for taking a look. This is a monorepo containing the whole platform —
control plane UI, API, OpenTofu runner, and the shared packages/templates
they depend on.

## Running it locally

You don't need AWS, a GitHub App, or a SAML provider to work on the control
plane itself:

```bash
git clone <your-fork-url>
cd vibeyeeter3000
pnpm install
docker compose -f docker-compose.dev.yml up -d
./scripts/dev-setup.sh
pnpm --filter @vibeyeeter/api db:migrate
pnpm dev
```

- Web UI: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:3002](http://localhost:3002)
- tf-runner: [http://localhost:4001](http://localhost:4001)

`DEV_AUTH_BYPASS=true` (on by default in `apps/api/.env.example`) skips SAML
and logs you in as a fake local admin. GitHub App and SAML credentials are
optional locally — the API starts without them and logs a warning.

To exercise real Kubernetes provisioning, install
[Rancher Desktop](https://rancherdesktop.io/) and run `pnpm smoke-test`
(see [docs/runbook.md](docs/runbook.md) for details).

## Code structure

```
apps/web              Next.js control plane UI
apps/api               Fastify API server
packages/types         Shared TypeScript types — no runtime code
packages/github-app    GitHub App webhooks + repo operations
services/tf-runner      OpenTofu runner service
infra/cluster           Platform's own AWS infra (OpenTofu)
infra/platform          Kubernetes manifests to deploy the platform itself
infra/helm-chart        Shared Helm chart for managed apps
infra/app-templates     Files pushed into every newly registered app repo
```

Dependency order: `types` ← `github-app` ← `api` ← `web`, and `types` ← `tf-runner`.

See [CLAUDE.md](CLAUDE.md) for the full set of conventions this codebase
follows (error handling, auth, Kubernetes access patterns, etc.) — it's
written for AI coding agents but is equally useful as a human contributor
guide.

## Before opening a PR

```bash
pnpm typecheck
pnpm lint
pnpm test
```

All three run in CI (`.github/workflows/ci.yml`) and must pass.

- Keep changes scoped — a bug fix shouldn't carry an unrelated refactor
- Add or update tests for behavior you change (see `apps/api/src/routes/*.test.ts`
  and `packages/github-app/src/*.test.ts` for the existing patterns)
- Don't add business logic to `packages/types` — types only
- Don't add secret values to logs, the platform database, or test fixtures
  committed to the repo

## PR process

1. Fork the repo and create a branch off `main`
2. Make your change, with tests
3. Open a PR describing what changed and why
4. CI must pass; a maintainer will review

## License

By contributing, you agree that your contributions will be licensed under
the [MIT License](LICENSE) that covers this project.
