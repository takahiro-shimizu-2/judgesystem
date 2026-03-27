#!/bin/bash

# 改行コードは LF。

set -e # 失敗したら止める

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ $# -eq 0 ]]; then
  echo "引数がありません。--urlを指定してください。"
  exit 1
fi


URL=""
service_name=""  # Cloud Run service name

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      if [[ $# -lt 2 ]]; then
        echo "Error: --url requires a value"
        exit 1
      fi
      URL="$2"
      shift 2
      ;;
    --service_name)
      if [[ $# -lt 2 ]]; then
        echo "Error: --service_name requires a value"
        exit 1
      fi
      service_name="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 --url <URL> [--service_name <service-name>]"
      echo "  --url <URL>                     Backend API URL (required)"
      echo "  --service_name <service-name>   Cloud Run service name (default: bidapp-frontend-postgres-dev)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "Backend API URL: $URL"

# sed による置換は不要になりました（環境変数 VITE_API_URL で設定するため）
# Docker ビルド時に --build-arg で VITE_API_URL を渡します
echo "VITE_API_URL will be set to: $URL during Docker build"


# Settings
# プロジェクトIDを環境変数にセット
PROJECT_ID=$(gcloud config get-value project)
# リージョン設定
LOCATION=asia-northeast1
# プロジェクト設定
gcloud config set project $PROJECT_ID

# サービス名（デフォルト値設定）
if [[ -z "$service_name" ]]; then
  service_name="bidapp-frontend-postgres-dev"
fi

# リポジトリ名とイメージ名を service_name から設定
REPO_NAME="$service_name"
IMAGE_NAME="$service_name"
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
# cloudbuild.yaml を使用して VITE_API_URL をビルド引数として渡す
gcloud builds submit \
  --config=deploy/cloudbuild-frontend.yaml \
  --substitutions=_VITE_API_URL="$URL",_LOCATION="$LOCATION",_REPO_NAME="$REPO_NAME",_IMAGE_NAME="$IMAGE_NAME",_TAG_NAME="$TAG_NAME"

# Cloud Run デプロイ
gcloud run deploy $IMAGE_NAME \
  --image $LOCATION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME:$TAG_NAME \
  --region $LOCATION \
  --allow-unauthenticated \
  --memory 1Gi
