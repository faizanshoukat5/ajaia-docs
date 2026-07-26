# Multi-stage build producing a small runtime image.
#
# Debian slim rather than Alpine on purpose: `better-sqlite3` ships prebuilt
# binaries for glibc reliably, and the build tools are only present in the builder
# stage as a fallback if a prebuild is unavailable for the target platform.

# ---------------------------------------------------------------------------
# deps — install node_modules once, cached on package files alone
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS deps
WORKDIR /app

# Fallback toolchain in case better-sqlite3 has to compile from source.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# builder — compile the Next.js standalone server
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Emits .next/standalone (see next.config.ts). Not set outside Docker, because
# standalone output breaks `next start`.
ENV BUILD_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------------
# runner — only what is needed to serve
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Must be a mounted volume, or the database is lost on every restart.
ENV DATABASE_PATH=/data/ajaia.db

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# The migration runner reads these .sql files from disk at boot, so they must be
# in the image — the standalone trace only follows JavaScript imports.
COPY --from=builder /app/src/db/migrations ./src/db/migrations

# `node` is a pre-existing unprivileged user in the base image.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

# No VOLUME declaration on purpose: the hosts that run this mount /data through
# their own config (fly.toml's [[mounts]], Railway's volume settings), and
# Railway rejects images that declare VOLUME.
EXPOSE 3000

# Migrations and first-boot seeding happen in src/instrumentation.ts, so there is
# no separate release command to forget.
CMD ["node", "server.js"]
