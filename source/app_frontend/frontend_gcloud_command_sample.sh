#!/bin/bash

# 改行コードは LF。

set -e # 失敗したら止める

if [[ $# -eq 0 ]]; then
  echo "引数がありません。--url などを指定してください。"
  exit 1
fi


URL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      URL="$2"
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

echo $URL


# 現状のfrontendファイルを置換
cp app_replacement_files/index.ts app/src/types/index.ts
cp app_replacement_files/mockData_mod_appget.ts app/src/data/mockData.ts

echo "Copied relpacement files."

sed -i "s|/api/result|$URL/api/result|g" app/src/data/mockData.ts

echo "Replaced mockData url."

exit 0 


# Settings
# プロジェクトIDを環境変数にセット
PROJECT_ID=$(gcloud config get-value project)
# リージョン設定
LOCATION=asia-northeast1
# プロジェクト設定
gcloud config set project $PROJECT_ID
# リポジトリ名
REPO_NAME=bidapp-frontend
# イメージ名
IMAGE_NAME=bidapp-frontend
# タグ名
TAG_NAME=v1

# リポジトリ作成
if ! gcloud artifacts repositories describe $REPO_NAME --location=$LOCATION >/dev/null 2>&1; then
   gcloud artifacts repositories create $REPO_NAME \
     --repository-format=docker \
     --location=$LOCATION \
     --description="${REPO_NMAE} container repository"
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
