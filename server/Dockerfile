# ============================================
# Backend Dockerfile
# Multi-stage build: npm ci -> tsc -> runtime
# ============================================

FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM deps AS builder

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
COPY package.json ./

RUN addgroup -S nodejs && adduser -S appuser -G nodejs

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
