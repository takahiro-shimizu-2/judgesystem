# Backend app_v3 (PostgreSQL)

このバージョンは BigQuery ではなく Cloud SQL for PostgreSQL を参照します。Cloud SQL Proxy または Private IP 経由で到達できる状態の PostgreSQL を用意し、以下の環境変数を設定してください。

## 環境変数

- `DATABASE_URL` もしくは `PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD`
- `PG_SCHEMA` : 省略時は `public`
- `PGSSLMODE` または `PGSSL` : `require` / `true` で SSL を有効化 (Cloud SQL Proxy 経由なら通常不要)
- `PGSSL_REJECT_UNAUTHORIZED` : SSL 利用時にサーバ証明書検証を有効化する場合は `true`
- `API_DEFAULT_LIMIT` : `/api/*` のデフォルト件数 (既定値 10)
- `API_MAX_LIMIT` : 上限件数 (既定値 1000)

## 開発・デプロイ

```bash
# 依存関係導入
npm install

# 型チェック/ビルド
npm run build

# Cloud SQL Proxy などで接続可能な状態にした上で
npm run dev
```

リクエストは `limit` クエリパラメータで件数を指定できます。値が 1〜`API_MAX_LIMIT` の範囲外の場合は `400 Invalid limit` を返します。JSON 応答は `Cache-Control: public, max-age=1800` で 30 分キャッシュ可能になっています。
