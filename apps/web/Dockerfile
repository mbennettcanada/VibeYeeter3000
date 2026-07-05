# Build from the monorepo root: docker build -f apps/web/Dockerfile .
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @vibeyeeter/web... build

# next.config.mjs sets output: "standalone". In a pnpm monorepo, Next mirrors
# the workspace layout under .next/standalone, so the server entrypoint ends
# up at apps/web/server.js relative to the standalone root.
FROM node:20-alpine
RUN addgroup -S vibeyeeter && adduser -S vibeyeeter -G vibeyeeter
WORKDIR /app

COPY --from=builder --chown=vibeyeeter:vibeyeeter /app/apps/web/.next/standalone ./
COPY --from=builder --chown=vibeyeeter:vibeyeeter /app/apps/web/.next/static ./apps/web/.next/static

USER vibeyeeter
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
