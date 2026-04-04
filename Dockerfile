# ── Build stage ────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Production stage ──────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Only copy what the production server needs
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY server.js ./
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "server.js"]
