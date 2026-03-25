# ============================================
# Multi-stage build for React + Vite app
# ============================================

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy packages so shared dependency is available
COPY packages ./packages

WORKDIR /app/packages/frontend

# Install dependencies
RUN npm ci

# Build引数としてAPI URLを受け取る
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Build the application
RUN npm run build

# ============================================
# Stage 2: Production with Nginx
# ============================================
FROM nginx:alpine AS production

# Copy custom nginx config
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# ============================================
# Stage 3: Development (optional target)
# ============================================
FROM node:22-alpine AS development

WORKDIR /app
COPY packages ./packages

WORKDIR /app/packages/frontend

# Install dependencies
RUN npm ci

# Expose Vite dev server port
EXPOSE 5173

# Start development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
