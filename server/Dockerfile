# ============================================
# Backend Dockerfile
# Multi-stage build: prebuilt runtime or npm ci -> tsc -> runtime
# ============================================

FROM node:22-bookworm-slim AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM mcr.microsoft.com/playwright:v1.58.2-noble AS runtime-base

WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]

FROM runtime-base AS prebuilt-runtime

COPY dist ./dist

USER pwuser

FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM deps AS builder

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build

FROM runtime-base AS runtime

COPY --from=builder /app/dist ./dist

USER pwuser
