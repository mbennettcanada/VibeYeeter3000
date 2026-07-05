# App Template — CLAUDE.md

This is the `CLAUDE.md` file that lives in every app repo managed by VibeYeeter3000.
It is the AI agent's primary orientation document.

Copy this into the root of each app repo as `CLAUDE.md`. Fill in the "What this app does" section.
Everything else should remain as-is — it reflects platform conventions.

---

```markdown
# [App Name] — AI Agent Guide

This file tells your AI coding agent everything it needs to know about this repo:
how it's structured, how to develop locally, how infrastructure works, and how
deployment happens. Do not delete or rename this file.

---

## What this app does

[Fill this in: describe the app's purpose, key features, and who uses it.
This is the only section you should customize.]

---

## Stack

- **Language**: TypeScript (strict mode — `tsc --noEmit` must pass before committing)
- **Framework**: Next.js 14+ (App Router)
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (managed by the VibeYeeter3000 platform)
- **Runtime**: Node.js 20+
- **Package manager**: pnpm

---

## Local development

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker (for local Postgres)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment template
cp .env.example .env.local
# Fill in .env.local with values for local dev

# 3. Start local Postgres
docker run -d \
  --name app-db \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=appdb \
  -p 5432:5432 \
  postgres:16

# 4. Run migrations
pnpm db:migrate

# 5. Start dev server
pnpm dev
```

The app runs at `http://localhost:3000`.

### Useful commands

```bash
pnpm dev          # start dev server with HMR
pnpm build        # production build (run this to catch build errors)
pnpm typecheck    # TypeScript strict check — must pass before committing
pnpm lint         # ESLint
pnpm test         # run tests
pnpm db:generate  # generate a new Drizzle migration after schema changes
pnpm db:migrate   # apply pending migrations
pnpm db:studio    # open Drizzle Studio (local DB browser)
```

---

## Project structure

```
src/
├── app/                    Next.js App Router
│   ├── layout.tsx          Root layout
│   ├── page.tsx            Home page
│   └── api/                API routes
├── lib/
│   ├── db.ts               Drizzle client (reads DATABASE_URL from env)
│   └── ...                 Other shared utilities
db/
├── schema.ts               Drizzle schema — all table definitions go here
└── migrations/             Auto-generated SQL migration files (commit these)
infra/
├── main.tf                 App-specific AWS resources (S3, SQS, etc.)
├── variables.tf            Terraform input variables
├── outputs.tf              Terraform outputs (values your app may need)
└── backend.tf              MANAGED BY PLATFORM — do not edit
helm/
└── values.yaml             MANAGED BY PLATFORM — do not edit
.github/
└── workflows/              MANAGED BY PLATFORM — do not edit
```

---

## Database and migrations

### Schema changes

All schema changes go through Drizzle migrations. Never use `drizzle-kit push`.

1. Edit `db/schema.ts`
2. Generate the migration:
   ```bash
   pnpm db:generate
   ```
3. Review the generated SQL file in `db/migrations/`
4. Commit both `db/schema.ts` and the migration file
5. Migrations run automatically before each production deployment

### Rules

- Never edit migration files after they have been committed to `main`
- Never use `drizzle-kit push` — always use `generate` + `migrate`
- Never delete migration files
- If a migration has a mistake, write a new migration to correct it

### Accessing the database

In code, always use the Drizzle client from `src/lib/db.ts`:

```typescript
import { db } from "@/lib/db";
import { users } from "../../db/schema";

const allUsers = await db.select().from(users);
```

Never hardcode database credentials. Always read `DATABASE_URL` from `process.env`.

---

## Environment variables

All environment variables are managed by the platform in AWS Secrets Manager.

- Add new variables via the VibeYeeter3000 dashboard (Secrets tab)
- Add them to `.env.example` with a description but no real value
- Read them in code via `process.env.VARIABLE_NAME`
- Never commit `.env.local` or any file with real secret values
- `DATABASE_URL` is always pre-populated by the platform

```bash
# .env.example format
DATABASE_URL=postgres://...        # Set by platform — do not add manually
NEXTAUTH_SECRET=                   # Required: random string for session encryption
SOME_API_KEY=                      # Required: API key for [service name]
```

---

## Infrastructure

App-specific AWS resources go in `infra/`. Use this for resources your app needs:

- S3 buckets (file storage, exports, etc.)
- SQS queues (async job processing)
- Additional IAM policies for your app's service account
- Lambda functions (if needed)

### What NOT to put in infra/

- EKS, VPC, or networking resources — managed by platform
- Cloudflare resources — managed by platform
- Postgres clusters — managed by platform
- Other apps' resources

### Terraform workflow

1. Add or modify resources in `infra/main.tf`
2. Add variables to `infra/variables.tf` if needed
3. Add outputs to `infra/outputs.tf` for values your app needs at runtime
4. Open a PR — the platform runs `terraform plan` and posts a diff as a comment
5. Review the diff carefully (especially anything marked with `-` destroy)
6. Merge when ready — the platform runs `terraform apply` automatically

`infra/backend.tf` is generated by the platform. Do not edit it.

---

## Deployment

### How it works

Every push to `main` triggers a deployment:

1. Docker image built and pushed to ECR
2. Drizzle migrations run as a Kubernetes Job
3. Helm release updated with the new image tag
4. Rolling update: new pods start, health check passes, old pods terminate
5. Deployment status appears in the VibeYeeter3000 dashboard

### Rollback

Use the VibeYeeter3000 dashboard (Deployments tab → Roll Back) to revert to any previous image.

### Files managed by the platform

These are generated and maintained by the platform. Do not edit them:

- `Dockerfile`
- `.github/workflows/deploy.yml`
- `.github/workflows/migrate.yml`
- `.github/workflows/tf-plan.yml`
- `.github/workflows/tf-apply.yml`
- `helm/values.yaml`
- `infra/backend.tf`

### User identity in production

Your app runs behind Cloudflare Access. Authenticated users' identity is passed
via the `CF-Access-JWT-Assertion` header. To get the current user's email:

```typescript
import { jwtDecode } from "jwt-decode";

function getUserEmail(request: Request): string | null {
  const jwt = request.headers.get("CF-Access-JWT-Assertion");
  if (!jwt) return null;
  const payload = jwtDecode<{ email: string }>(jwt);
  return payload.email;
}
```

You do not need to implement OAuth or session management for access control —
Cloudflare handles authentication. You only need user identity for application
logic (e.g. showing "Hello, mark@company.com").

---

## Code conventions

- **TypeScript strict mode**: all code must pass `pnpm typecheck` with zero errors
- **No `any` types**: use proper types or `unknown` with type narrowing
- **No `console.log` in production paths**: use a structured logger
- **Error handling**: never let unhandled errors reach Next.js's default error boundary in production code
- **Environment variables**: always access via `process.env`, never hardcode
- **Database queries**: always use Drizzle — never raw SQL strings with user input (SQL injection)
- **Secrets**: never log secrets, never return them in API responses, never commit them

---

## What NOT to do

- Do not edit `helm/values.yaml` — managed by platform
- Do not edit `infra/backend.tf` — managed by platform
- Do not edit `.github/workflows/` — managed by platform
- Do not run `drizzle-kit push` — always use generate + migrate
- Do not edit migration files after they are committed to `main`
- Do not commit `.env.local` or any file with real credentials
- Do not add `console.log` in production code paths
- Do not hardcode database connection strings, API keys, or secrets
- Do not define EKS, VPC, Cloudflare, or platform-level Terraform resources in `infra/`
```
