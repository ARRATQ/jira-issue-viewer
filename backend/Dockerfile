# syntax=docker/dockerfile:1

# ---- Build stage: compile TypeScript, generate the Prisma client ----
FROM node:20-slim AS build
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# `prisma generate` only needs DATABASE_URL to resolve, never connects to it.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"

# --include=dev overrides any ambient/build-injected NODE_ENV=production
# (some PaaS platforms, e.g. Coolify, pass through configured env vars as
# build args) — without it, npm ci silently skips devDependencies
# (typescript, tsx...) and the tsc build below fails with "command not found".
COPY package*.json ./
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY src ./src

RUN npx prisma generate --schema ./src/prisma/schema.prisma
RUN npm run build

# ---- Runtime stage: production deps only + compiled output ----
FROM node:20-slim
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/prisma ./src/prisma
RUN npx prisma generate --schema ./src/prisma/schema.prisma

COPY --from=build /app/dist ./dist
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3001
CMD ["./entrypoint.sh"]
