# Build from the monorepo root: docker build -f apps/api/Dockerfile .
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @vibeyeeter/api... build
RUN pnpm --filter @vibeyeeter/api deploy --prod /app/out

FROM node:20-alpine
RUN addgroup -S vibeyeeter && adduser -S vibeyeeter -G vibeyeeter
WORKDIR /app
COPY --from=builder --chown=vibeyeeter:vibeyeeter /app/out ./

USER vibeyeeter
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "dist/index.js"]
