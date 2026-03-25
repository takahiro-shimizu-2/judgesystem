# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy all packages so that local dependencies are available
COPY packages ./packages

WORKDIR /app/packages/backend
RUN npm ci
RUN npx tsc

# Production stage
FROM node:20-alpine AS production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001

WORKDIR /app/packages/backend

# Copy package metadata for production install
COPY packages/backend/package*.json ./
# Bring along the shared package for local dependency resolution
COPY packages/shared /app/packages/shared
RUN npm ci --omit=dev

# Copy build output
COPY --from=builder /app/packages/backend/dist ./dist

USER appuser

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]

# Development stage
FROM node:22-alpine AS development

WORKDIR /app
COPY packages ./packages

WORKDIR /app/packages/backend
RUN npm ci

EXPOSE 8080

CMD ["npx", "tsx", "watch", "index.ts"]
