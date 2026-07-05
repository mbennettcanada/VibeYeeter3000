# Build from the monorepo root: docker build -f services/tf-runner/Dockerfile .
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @vibeyeeter/tf-runner... build
RUN pnpm --filter @vibeyeeter/tf-runner deploy --prod /app/out

# Bundles the tofu binary directly so the runner image doesn't depend on a
# host-installed toolchain (see CLAUDE.md: TOFU_BIN configurability).
FROM alpine:3.19 AS tofu
ARG TOFU_VERSION=1.7.1
RUN apk add --no-cache curl unzip
RUN ARCH=$(case "$(uname -m)" in x86_64) echo amd64 ;; aarch64) echo arm64 ;; *) echo amd64 ;; esac) && \
    curl -fsSL -o /tmp/tofu.zip \
      "https://github.com/opentofu/opentofu/releases/download/v${TOFU_VERSION}/tofu_${TOFU_VERSION}_linux_${ARCH}.zip" && \
    unzip /tmp/tofu.zip -d /usr/local/bin tofu && \
    chmod +x /usr/local/bin/tofu

FROM node:20-alpine
RUN addgroup -S vibeyeeter && adduser -S vibeyeeter -G vibeyeeter
WORKDIR /app
COPY --from=builder --chown=vibeyeeter:vibeyeeter /app/out ./
COPY --from=tofu /usr/local/bin/tofu /usr/local/bin/tofu

USER vibeyeeter
ENV NODE_ENV=production
ENV TOFU_BIN=tofu
EXPOSE 4001
CMD ["node", "dist/index.js"]
