# Fly.io runs containers, so the app ships as one. Three stages keep the
# runtime image to the server and its assets — no source, no build tooling.

# --- dependencies ---
FROM node:22-alpine AS deps
# Next's SWC binaries expect glibc symbols that Alpine's musl needs shimmed.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Nothing here needs root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# `output: 'standalone'` emits the server and its traced dependencies, but
# NOT the static assets. Copying .next/static is what stops the deployed site
# rendering with no CSS — the one mistake this Dockerfile exists to prevent.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
# Binding to localhost would make the app unreachable from outside the machine.
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
