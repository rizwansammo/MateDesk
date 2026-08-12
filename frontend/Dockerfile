FROM node:20-alpine AS base

# ── Install dependencies ──────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# autoprefixer is a declared devDependency (postcss.config.mjs requires it), so
# npm ci installs it from the lockfile. It used to be appended here as an
# unpinned `npm install autoprefixer`, which made the image non-reproducible and
# left a plain `npm ci` unbuildable for local development.
RUN npm ci

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Baked at build time — set NEXT_PUBLIC_API_URL="" to use same-origin nginx routing
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_APP_DOMAIN="matedesk.pro"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_DOMAIN=$NEXT_PUBLIC_APP_DOMAIN

RUN npm run build

# ── Production runner ─────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static

USER nextjs

EXPOSE 3005
ENV PORT=3005
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
