# Multi-stage build — targets: api, worker. Placeholder; hardened at the DevOps workstream.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
# TODO: pnpm db:generate (prisma generate) before build once the schema exists
RUN pnpm build

FROM node:22-alpine AS api
WORKDIR /repo
COPY --from=base /repo ./
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM node:22-alpine AS worker
WORKDIR /repo
COPY --from=base /repo ./
CMD ["node", "apps/worker/dist/main.js"]
