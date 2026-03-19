# Backend app_v3 (PostgreSQL)

このバージョンは BigQuery ではなく Cloud SQL for PostgreSQL を参照します。Cloud SQL Proxy または Private IP 経由で到達できる状態の PostgreSQL を用意し、以下の環境変数を設定してください。

## アーキテクチャ

3層アーキテクチャで構成されています：

```
src/
├── config/          # データベース設定
├── controllers/     # Presentation層 (リクエスト/レスポンス処理)
├── services/        # Business Logic層 (ビジネスロジック)
├── repositories/    # Data Access層 (データベース操作)
└── types/           # 型定義
```

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

一覧 API (`/api/evaluations`) は `page` / `pageSize` によるページネーションと、`statuses` / `workStatuses` / `priorities` / `categories` / `bidTypes` / `organizations` / `prefectures` / `searchQuery` / `sortField` / `sortOrder` といったクエリパラメータに対応しています。JSON 応答は `Cache-Control: public, max-age=1800` で 30 分キャッシュ可能です。

## API エンドポイント

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/evaluations` | 入札一覧ページ向けの判定結果サマリ。ページ番号・フィルター・ソート・検索で絞り込み、フロント表示に必要なフィールドのみを JSON で返します。 |
| GET | `/api/evaluations/:id` | 詳細ページ用。`id` で 1 件の判定結果を取得し、`requirements` や `announcement` の全文情報を返します。 |
| PATCH | `/api/evaluations/:evaluationNo` | 進捗ステータスの更新。`workStatus` を `not_started` / `in_progress` / `completed` のいずれかに変更します。 |
