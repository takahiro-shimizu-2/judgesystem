# Share TypeScript version across stages
ARG TYPESCRIPT_VERSION=5.9.3

# Build stage
FROM node:20-alpine AS builder
ARG TYPESCRIPT_VERSION

WORKDIR /app

# Install TypeScript globally so shared package prepare can run
RUN npm install -g typescript@${TYPESCRIPT_VERSION}

# Copy all packages so that local dependencies are available
COPY packages ./packages

WORKDIR /app/packages/backend
RUN npm ci
RUN npx tsc

# Production stage
FROM node:20-alpine AS production
ARG TYPESCRIPT_VERSION

RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001

# Install TypeScript globally for shared package build step
RUN npm install -g typescript@${TYPESCRIPT_VERSION}

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
ARG TYPESCRIPT_VERSION

WORKDIR /app
COPY packages ./packages

# Install TypeScript globally for shared package
RUN npm install -g typescript@${TYPESCRIPT_VERSION}

WORKDIR /app/packages/backend
RUN npm ci

EXPOSE 8080

CMD ["npx", "tsx", "watch", "index.ts"]
