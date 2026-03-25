# Cloud Run デプロイ手順

環境変数ベースのデプロイ方法です。従来の `.sh` スクリプトを使用しますが、ファイルの書き換えは不要になりました。

---

## 📋 事前準備

### 1. gcloud CLI の設定

```bash
# ログイン
gcloud auth login

# プロジェクト設定
gcloud config set project YOUR_PROJECT_ID

# リージョン設定
gcloud config set run/region asia-northeast1
```

### 2. VPC Connector の作成（バックエンドのみ）

Cloud SQLに接続する場合は必要です。

```bash
gcloud compute networks vpc-access connectors create cloudrun-connector \
  --region=asia-northeast1 \
  --network=default \
  --range=10.8.0.0/28
```

---

## 🚀 バックエンドのデプロイ

### ディレクトリ移動

```bash
cd packages/backend
```

### デプロイコマンド

#### 方法1: Cloud SQL Proxy（デフォルト、VPC不要）

```bash
bash backend_gcloud_command_sample.sh \
  --frontend_url https://bidapp-frontend-postgres-50843898931.asia-northeast1.run.app \
  --cloud_sql_instance YOUR_PROJECT_ID:asia-northeast1:YOUR_INSTANCE_NAME \
  --pg_user YOUR_DB_USER \
  --pg_password YOUR_DB_PASSWORD \
  --pg_database YOUR_DB_NAME \
  --pg_sslmode require \
  --pg_schema public
```

#### 方法2: VPC Private IP（VPC Connector使用）

```bash
bash backend_gcloud_command_sample.sh \
  --frontend_url https://bidapp-frontend-postgres-50843898931.asia-northeast1.run.app \
  --connection_type vpc \
  --pg_host 10.x.x.x \
  --pg_user YOUR_DB_USER \
  --pg_password YOUR_DB_PASSWORD \
  --pg_database YOUR_DB_NAME \
  --pg_sslmode require \
  --pg_schema public
```

### パラメータ説明

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `--frontend_url` | フロントエンドURL（CORS用） | `https://bidapp-frontend-postgres-...` |
| `--connection_type` | 接続方法: `proxy` or `vpc` (デフォルト: `proxy`) | `proxy` または `vpc` |
| `--cloud_sql_instance` | Cloud SQLインスタンス（proxy使用時） | `project-id:region:instance-name` |
| `--pg_host` | DBホスト（vpc使用時はプライベートIP） | `10.x.x.x` または `/cloudsql/...` |
| `--pg_user` | PostgreSQLユーザー名 | `postgres` |
| `--pg_password` | PostgreSQLパスワード | `your-password` |
| `--pg_database` | データベース名 | `postgres` |
| `--pg_sslmode` | SSL接続モード | `require` または `disable` |
| `--pg_schema` | スキーマ名（オプション） | `public` |

### 接続方法の違い

| 項目 | Cloud SQL Proxy (`proxy`) | VPC Private IP (`vpc`) |
|------|--------------------------|----------------------|
| VPC Connector | **不要** | **必須** |
| 設定 | `--cloud_sql_instance` | `--pg_host 10.x.x.x` |
| Cloud Runオプション | `--add-cloudsql-instances` | `--vpc-connector`, `--vpc-egress` |
| 推奨用途 | シンプルな構成 | 既存VPC統合 |

### 設定される環境変数

- `CORS_ORIGIN`: `--frontend_url` の値
- `PGHOST`: Cloud SQL Proxyソケット (`/cloudsql/...`) またはプライベートIP (`10.x.x.x`)
- `PGUSER`, `PGPASSWORD`, `PGDATABASE`: PostgreSQL接続情報
- `PGSSLMODE`, `PG_SCHEMA`: PostgreSQL設定

---

## 🎨 フロントエンドのデプロイ

### ディレクトリ移動

```bash
cd packages/frontend
```

### デプロイコマンド

```bash
bash frontend_gcloud_command_sample.sh \
  --url https://bidapp-backend-postgres-50843898931.asia-northeast1.run.app
```

### パラメータ説明

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `--url` | バックエンドAPI URL | `https://bidapp-backend-postgres-...` |

### 設定される環境変数（ビルド時）

- `VITE_API_URL`: `--url` の値（Dockerビルド時に `--build-arg` で渡される）

---

## 🔧 ローカル開発

### バックエンド

```bash
cd packages/backend

# .env ファイルを作成
cp .env.example .env

# .env を編集
# CORS_ORIGIN=http://localhost:5173
# PGHOST=127.0.0.1
# PGUSER=postgres
# PGPASSWORD=your_password
# ...

# 起動
npm install
npm start
```

### フロントエンド

```bash
cd packages/frontend/app

# .env.local ファイルを作成
cp .env.local.example .env.local

# .env.local を編集
# VITE_API_URL=http://localhost:8080

# 起動
npm install
npm run dev
```

ブラウザで `http://localhost:5173` にアクセス

---

## 📝 デプロイの流れ

### 1. バックエンド → フロントエンド の順にデプロイ

**理由**: フロントエンドのビルド時にバックエンドURLが必要なため

```bash
# 1. バックエンドをデプロイ
cd packages/backend
bash backend_gcloud_command_sample.sh \
  --frontend_url https://bidapp-frontend-postgres-50843898931.asia-northeast1.run.app \
  --cloud_sql_instance ... \
  --pg_user ... \
  --pg_password ...

# デプロイ完了後、URLを確認
# 例: https://bidapp-backend-postgres-50843898931.asia-northeast1.run.app

# 2. フロントエンドをデプロイ（バックエンドURLを指定）
cd ../frontend
bash frontend_gcloud_command_sample.sh \
  --url https://bidapp-backend-postgres-50843898931.asia-northeast1.run.app
```

### 2. デプロイ後の確認

```bash
# バックエンドの動作確認
curl https://bidapp-backend-postgres-50843898931.asia-northeast1.run.app/

# フロントエンドにアクセス
# https://bidapp-frontend-postgres-50843898931.asia-northeast1.run.app
```

---

## 🔍 トラブルシューティング

### CORS エラーが出る場合

バックエンドの `CORS_ORIGIN` が正しく設定されているか確認:

```bash
gcloud run services describe bidapp-backend-postgres \
  --region asia-northeast1 \
  --format='value(spec.template.spec.containers[0].env)'
```

`CORS_ORIGIN` がフロントエンドのURLと一致していることを確認。

### API接続エラーが出る場合

フロントエンドのビルド時に `VITE_API_URL` が正しく設定されているか確認:

```bash
# デプロイログを確認
gcloud builds log --region=asia-northeast1

# "VITE_API_URL will be set to: ..." というメッセージを確認
```

### Cloud SQL 接続エラーが出る場合

```bash
# Cloud Runサービスの環境変数を確認
gcloud run services describe bidapp-backend-postgres \
  --region asia-northeast1 \
  --format='value(spec.template.spec.containers[0].env)'

# VPC Connector が設定されているか確認
gcloud run services describe bidapp-backend-postgres \
  --region asia-northeast1 \
  --format='value(spec.template.spec.vpcAccess.connector)'
```

---

## 💡 Tips

### 環境変数の確認

```bash
# バックエンド
gcloud run services describe bidapp-backend-postgres \
  --region asia-northeast1 \
  --format='yaml(spec.template.spec.containers[0].env)'

# 出力例:
# - name: CORS_ORIGIN
#   value: https://bidapp-frontend-postgres-...
# - name: PGHOST
#   value: /cloudsql/...
```

### ログの確認

```bash
# バックエンドのログ
gcloud run logs read bidapp-backend-postgres --region asia-northeast1 --limit 50

# フロントエンドのログ
gcloud run logs read bidapp-frontend-postgres --region asia-northeast1 --limit 50
```

### 環境変数の更新のみ（再ビルド不要）

```bash
# バックエンドのCORS_ORIGINのみ変更
gcloud run services update bidapp-backend-postgres \
  --region asia-northeast1 \
  --set-env-vars CORS_ORIGIN=https://new-frontend-url.run.app
```

**注意**: フロントエンドの `VITE_API_URL` はビルド時に埋め込まれるため、変更には再ビルドが必要です。

---

## 📚 参考リンク

- [Cloud Run ドキュメント](https://cloud.google.com/run/docs)
- [Cloud SQL 接続](https://cloud.google.com/sql/docs/postgres/connect-run)
- [VPC Connector](https://cloud.google.com/vpc/docs/configure-serverless-vpc-access)
