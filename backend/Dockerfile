# syntax=docker/dockerfile:1

# One image runs three things, chosen by the command:
#   API:        node index.js                      (default)
#   Worker:     node worker.js
#   Migrations: npm run migrate:deploy             (applies migrations, then exits)
#
# Build it:  docker build -t eshop-backend .

ARG NODE_VERSION=22

# ---------- build: generate the Prisma client ----------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

# Copy only the package files first. Docker caches this step, so dependencies
# are only reinstalled when package.json or package-lock.json change.
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma7.config.js ./
RUN npx prisma generate --config prisma7.config.js

# ---------- prod-deps: only the packages needed to run ----------
FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- runtime: the production image ----------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/generated ./generated
COPY package.json prisma7.config.js ./
COPY prisma ./prisma
COPY src ./src
COPY index.js worker.js ./

# Do not run as root. The logger writes to /app/logs, so that folder must be writable.
RUN mkdir -p logs && chown -R node:node logs
USER node

EXPOSE 3000

# Docker marks the container unhealthy if /health stops answering
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "index.js"]
