# ビルドステージ
FROM node:18-slim AS builder
WORKDIR /app

COPY app_for_test/package*.json ./
RUN npm install
COPY app_for_test/ .
RUN npm run build

# 配信ステージ
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA 対応 (React Router 用)
COPY app_for_test/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
