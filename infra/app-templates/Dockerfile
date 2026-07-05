# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app
RUN corepack enable

COPY --from=build --chown=app:app /app/package.json /app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build --chown=app:app /app/dist ./dist

USER app
EXPOSE 3000
CMD ["node", "dist/index.js"]
