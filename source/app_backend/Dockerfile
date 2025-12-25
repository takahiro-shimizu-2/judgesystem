# Node.js の公式イメージ
FROM node:18

# 作業ディレクトリ
WORKDIR /app

# package.json をコピーして依存関係をインストール
COPY app/package*.json ./
RUN npm install
COPY app/ .

# TypeScript をビルド（index.ts → index.js）
RUN npx tsc

# Cloud Run は 8080 を使う
ENV PORT=8080

# コンテナ起動時に実行するコマンド
CMD ["node", "dist/index.js"]
