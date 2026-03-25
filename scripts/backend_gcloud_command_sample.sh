#!/bin/bash

# 改行コードは LF。

set -e # 失敗したら止める

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"


frontend_url=""
project_id=""
dataset_name=""
cloud_sql_instance=""
connection_type="proxy"  # "proxy" or "vpc"
pg_host=""
pg_user=""
pg_password=""
pg_database=""
pg_port=""
pg_sslmode=""
pg_schema=""
enable_contact_delete="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --frontend_url)
      if [[ $# -lt 2 ]]; then
        echo "Error: --frontend_url requires a value"
        exit 1
      fi
      frontend_url="$2"
      shift 2
      ;;
    --project_id)
      if [[ $# -lt 2 ]]; then
        echo "Error: --project_id requires a value"
        exit 1
      fi
      project_id="$2"
      shift 2
      ;;
    --dataset_name)
      if [[ $# -lt 2 ]]; then
        echo "Error: --dataset_name requires a value"
        exit 1
      fi
      dataset_name="$2"
      shift 2
      ;;
    --cloud_sql_instance)
      if [[ $# -lt 2 ]]; then
        echo "Error: --cloud_sql_instance requires a value"
        exit 1
      fi
      cloud_sql_instance="$2"
      shift 2
      ;;
    --connection_type)
      if [[ $# -lt 2 ]]; then
        echo "Error: --connection_type requires a value"
        exit 1
      fi
      connection_type="$2"
      shift 2
      ;;
    --pg_host)
      if [[ $# -lt 2 ]]; then
        echo "Error: --pg_host requires a value"
        exit 1
      fi
      pg_host="$2"
      shift 2
      ;;
    --pg_user)
      if [[ $# -lt 2 ]]; then
        echo "Error: --pg_user requires a value"
        exit 1
      fi
      pg_user="$2"
      shift 2
      ;;
    --pg_password)
      if [[ $# -lt 2 ]]; then
        echo "Error: --pg_password requires a value"
        exit 1
      fi
      pg_password="$2"
      shift 2
      ;;
    --pg_database)
      if [[ $# -lt 2 ]]; then
        echo "Error: --pg_database requires a value"
        exit 1
      fi
      pg_database="$2"
      shift 2
      ;;
    --pg_port)
      if [[ $# -lt 2 ]]; then
        echo "Error: --pg_port requires a value"
        exit 1
      fi
      pg_port="$2"
      shift 2
      ;;
    --pg_sslmode)
      if [[ $# -lt 2 ]]; then
        echo "Error: --pg_sslmode requires a value"
        exit 1
      fi
      pg_sslmode="$2"
      shift 2
      ;;
    --pg_schema)
      if [[ $# -lt 2 ]]; then
        echo "Error: --pg_schema requires a value"
        exit 1
      fi
      pg_schema="$2"
      shift 2
      ;;
    --enable_contact_delete)
      if [[ $# -lt 2 ]]; then
        echo "Error: --enable_contact_delete requires a value (true|false)"
        exit 1
      fi
      enable_contact_delete="$2"
      shift 2
      ;;
    --help)
      cat <<'EOF'
Usage: backend_gcloud_command_sample_postgres.sh [options]
  --frontend_url <url>
  --project_id <gcp-project>
  --dataset_name <dataset>
  --cloud_sql_instance <project:region:instance>
  --connection_type <proxy|vpc>  (default: proxy)
  --pg_host </cloudsql/... or private IP>
  --pg_user <user>
  --pg_password <password>
  --pg_database <dbname>
  --pg_port <port>
  --pg_sslmode <disable|require|...>
  --pg_schema <schema>
  --enable_contact_delete <true|false> (default: false)

Connection types:
  proxy: Cloud SQL Proxy (Unix socket, no VPC needed)
  vpc:   VPC Private IP (requires VPC Connector)
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "frontend_url: $frontend_url"
echo "Project ID: $project_id"
echo "Dataset Name: $dataset_name"
echo "cloud_sql_instance: $cloud_sql_instance"
echo "connection_type: $connection_type"


# sed による置換は不要になりました（環境変数で設定するため）
# frontend_url は CORS_ORIGIN 環境変数として Cloud Run に渡されます
echo "CORS_ORIGIN will be set to: $frontend_url"

# Settings
# プロジェクトIDを環境変数にセット
PROJECT_ID=$(gcloud config get-value project)
# リージョン設定
LOCATION=asia-northeast1
# プロジェクト設定
gcloud config set project $PROJECT_ID
# リポジトリ名
REPO_NAME=bidapp-backend-postgres-dev
# イメージ名
IMAGE_NAME=bidapp-backend-postgres-dev
# タグ名
TAG_NAME=v1

# リポジトリ作成
if ! gcloud artifacts repositories describe $REPO_NAME --location=$LOCATION >/dev/null 2>&1; then
   gcloud artifacts repositories create $REPO_NAME \
     --repository-format=docker \
     --location=$LOCATION \
     --description="${REPO_NAME} container repository"
fi

# Cloud Build → Artifact Registry
# LOCATION-docker.pkg.dev/PROJECT_ID/REPOSITORY/IMAGE_NAME:TAG
# (gcr.io/PROJECT_ID/REPOSITORY/IMAGE_NAME:TAG)
gcloud builds submit \
  --tag $LOCATION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$REPO_NAME:$TAG_NAME \
  --file packages/backend/Dockerfile \
  .

# 接続タイプに応じてPGHOSTを設定
if [[ "$connection_type" == "proxy" ]]; then
  # Cloud SQL Proxy (Unixソケット)
  if [[ -z "$pg_host" && -n "$cloud_sql_instance" ]]; then
    pg_host="/cloudsql/${cloud_sql_instance}"
  fi
elif [[ "$connection_type" == "vpc" ]]; then
  # VPC Private IP
  if [[ -z "$pg_host" ]]; then
    echo "Error: --pg_host (private IP) is required when using --connection_type vpc"
    exit 1
  fi
fi

env_vars=()
[[ -n "$frontend_url" ]] && env_vars+=("CORS_ORIGIN=${frontend_url}")
[[ -n "$pg_host" ]] && env_vars+=("PGHOST=${pg_host}")
[[ -n "$pg_user" ]] && env_vars+=("PGUSER=${pg_user}")
[[ -n "$pg_password" ]] && env_vars+=("PGPASSWORD=${pg_password}")
[[ -n "$pg_database" ]] && env_vars+=("PGDATABASE=${pg_database}")
[[ -n "$pg_port" ]] && env_vars+=("PGPORT=${pg_port}")
[[ -n "$pg_sslmode" ]] && env_vars+=("PGSSLMODE=${pg_sslmode}")
[[ -n "$pg_schema" ]] && env_vars+=("PG_SCHEMA=${pg_schema}")
env_vars+=("ENABLE_CONTACT_DELETE=${enable_contact_delete}")

# デプロイコマンド構築
deploy_cmd=(
  gcloud run deploy $IMAGE_NAME
  --image $LOCATION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME:$TAG_NAME
  --region $LOCATION
  --allow-unauthenticated
)

# 接続タイプに応じて設定を追加
if [[ "$connection_type" == "proxy" ]]; then
  # Cloud SQL Proxy使用
  if [[ -n "$cloud_sql_instance" ]]; then
    deploy_cmd+=(--add-cloudsql-instances "$cloud_sql_instance")
  fi
elif [[ "$connection_type" == "vpc" ]]; then
  # VPC Private IP使用
  deploy_cmd+=(--vpc-connector=cloudrun-connector)
  deploy_cmd+=(--vpc-egress=private-ranges-only)
fi

if [[ ${#env_vars[@]} -gt 0 ]]; then
  env_vars_joined=$(IFS=','; echo "${env_vars[*]}")
  deploy_cmd+=(--set-env-vars "$env_vars_joined")
fi

# Cloud Run デプロイ
"${deploy_cmd[@]}"
