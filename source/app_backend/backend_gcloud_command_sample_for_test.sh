#!/bin/bash

# 改行コードは LF。

set -e # 失敗したら止める


frontend_url=""
project_id=""
dataset_name=""
pdfurl=""

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
    --pdfurl)
      if [[ $# -lt 2 ]]; then
        echo "Error: --pdfurl requires a value"
        exit 1
      fi
      pdfurl="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 --url <URL>"
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
echo "pdfurl: $pdfurl"


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

if [[ -n "$pdfurl" ]]; then
  if grep -q "PDFURL" app/index.ts; then
    sed -i "s|PDFURL|$pdfurl|g" app/index.ts
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
REPO_NAME=bidapp-backend-for-test
# イメージ名
IMAGE_NAME=bidapp-backend-for-test
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

# Cloud Run デプロイ
gcloud run deploy $IMAGE_NAME \
  --image $LOCATION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME:$TAG_NAME \
  --region $LOCATION \
  --allow-unauthenticated
