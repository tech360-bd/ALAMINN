# ═══════════════════════════════════════════════════════════════════
#  Alaminn.info — Production Dockerfile (multi-stage)
#  Builds the Next.js standalone output and runs it on Node.js 22.
# ═══════════════════════════════════════════════════════════════════

# ── Stage 1: deps ──────────────────────────────────────────────────
FROM node:22.22.3-bookworm-slim AS deps
WORKDIR /app

# Copy the locked dependencies and inputs needed by the install-time generator.
COPY package.json package-lock.json ./
COPY scripts/prisma-generate.mjs ./scripts/
COPY prisma/schema*.prisma ./prisma/
RUN npm ci --no-audit --no-fund && npm cache clean --force

# ── Migration image (explicit operation; not part of app startup) ──
FROM node:22.22.3-bookworm-slim AS migrator
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
COPY src/lib/load-env.ts src/lib/database-url.ts ./src/lib/
RUN mkdir -p db && chown node:node db
USER node
CMD ["npm", "run", "db:migrate:deploy"]

# ── Stage 2: builder ───────────────────────────────────────────────
FROM migrator AS builder
USER root
COPY . .

# Build Next.js (standalone output) using an ephemeral initialized SQLite schema for static generation.
ENV NEXT_TELEMETRY_DISABLED=1
RUN export DATABASE_URL="file:/tmp/build.db" JWT_SECRET="$(openssl rand -hex 32)" && \
    npm run db:migrate:deploy && npm run build && \
    rm -f /tmp/build.db /tmp/build.db-journal /tmp/build.db-wal /tmp/build.db-shm

# ── Stage 3: runner (final, minimal image) ────────────────────────
FROM node:22.22.3-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create a non-root user for security.
RUN usermod --login nextjs node && groupmod --new-name nextjs node

# Copy standalone build + static + public.
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/prisma ./prisma

# Create writable dirs for logs/backups.
RUN mkdir -p storage/logs storage/backups storage/temporary storage/exports db/backups && \
    chown -R nextjs:nextjs storage db

USER nextjs

EXPOSE 3000

# Health check — hit the lightweight endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
