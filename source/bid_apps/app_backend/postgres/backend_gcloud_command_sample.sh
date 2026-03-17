#!/bin/bash

# 改行コードは LF。

set -e # 失敗したら止める


frontend_url=""
project_id=""
dataset_name=""
cloud_sql_instance=""
pg_host=""
pg_user=""
pg_password=""
pg_database=""
pg_port=""
pg_sslmode=""
pg_schema=""

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
    --help)
      cat <<'EOF'
Usage: backend_gcloud_command_sample_postgres.sh [options]
  --frontend_url <url>
  --project_id <gcp-project>
  --dataset_name <dataset>
  --cloud_sql_instance <project:region:instance>
  --pg_host </cloudsql/... or hostname>
  --pg_user <user>
  --pg_password <password>
  --pg_database <dbname>
  --pg_port <port>
  --pg_sslmode <disable|require|...>
  --pg_schema <schema>
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


if [[ -n "$frontend_url" ]]; then
  if grep -q "https://frontend-xxxxx\.a\.run\.app" app/index.ts; then
    sed -i "s|https://frontend-xxxxx\.a\.run\.app|$frontend_url|g" app/index.ts
    echo "Replaced app/index.ts"
  else
    echo "No replacement target found."
  fi
fi

if [[ -n "$project_id" ]]; then
  if grep -q "PROJECT_ID" app/index.ts; then
    sed -i "s|PROJECT_ID|$project_id|g" app/index.ts
    echo "Replaced app/index.ts"
  else
    echo "No replacement target found."
  fi
fi

if [[ -n "$dataset_name" ]]; then
  if grep -q "DATASET_NAME" app/index.ts; then
    sed -i "s|DATASET_NAME|$dataset_name|g" app/index.ts
    echo "Replaced app/index.ts"
  else
    echo "No replacement target found."
  fi
fi

# Settings
# プロジェクトIDを環境変数にセット
PROJECT_ID=$(gcloud config get-value project)
# リージョン設定
LOCATION=asia-northeast1
# プロジェクト設定
gcloud config set project $PROJECT_ID
# リポジトリ名
REPO_NAME=bidapp-backend-postgres
# イメージ名
IMAGE_NAME=bidapp-backend-postgres
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
gcloud builds submit --tag $LOCATION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$REPO_NAME:$TAG_NAME

if [[ -z "$pg_host" && -n "$cloud_sql_instance" ]]; then
  pg_host="/cloudsql/${cloud_sql_instance}"
fi

env_vars=()
[[ -n "$pg_host" ]] && env_vars+=("PGHOST=${pg_host}")
[[ -n "$pg_user" ]] && env_vars+=("PGUSER=${pg_user}")
[[ -n "$pg_password" ]] && env_vars+=("PGPASSWORD=${pg_password}")
[[ -n "$pg_database" ]] && env_vars+=("PGDATABASE=${pg_database}")
[[ -n "$pg_port" ]] && env_vars+=("PGPORT=${pg_port}")
[[ -n "$pg_sslmode" ]] && env_vars+=("PGSSLMODE=${pg_sslmode}")
[[ -n "$pg_schema" ]] && env_vars+=("PG_SCHEMA=${pg_schema}")

deploy_cmd=(
  gcloud run deploy $IMAGE_NAME
  --image $LOCATION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME:$TAG_NAME
  --region $LOCATION
  --allow-unauthenticated
  --vpc-connector=cloudrun-connector
  --vpc-egress=private-ranges-only
)

if [[ -n "$cloud_sql_instance" ]]; then
  deploy_cmd+=(--add-cloudsql-instances "$cloud_sql_instance")
fi

if [[ ${#env_vars[@]} -gt 0 ]]; then
  env_vars_joined=$(IFS=','; echo "${env_vars[*]}")
  deploy_cmd+=(--set-env-vars "$env_vars_joined")
fi

# Cloud Run デプロイ
"${deploy_cmd[@]}"
