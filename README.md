# 公告判定システム - 判定処理

## 概要

外部から収集した官公庁の入札情報をまとめ、企業ごとに入札可否判定します。

結果をデータベースに格納し、webアプリ等の表示に用います。

処理の概要は以下の通りです。

- 判定前公告一覧表を入力として受け取る。
- 公告マスターや要件マスターを作成する。
- 公告pdfから公告・要件情報を抽出する。
- 企業 x 拠点 x 要件の組み合わせごとに要件判定を行い、判定結果を企業公告マスターにまとめる。

以下の順で処理を行います。

- step0 : 判定前公告一覧表アップロード  
- step1 : 転写処理
- step2 : OCR処理
- step3 : 要件判定

## 環境構築

### レポジトリのクローン

```
mkdir -p github/judgesystem
cd github/judgesystem
git clone https://github.com/takahiro-shimizu-2/judgesystem.git .
```

### python環境構築

#### Miniforge3 のインストール

- すでに判定システムを使用するための python 環境があれば、本手順を実行する必要はありません。
- curl コマンドは `https://github.com/conda-forge/miniforge` に由来します。
- `~/miniforge3/bin/conda init` を実行すると、.bashrc に conda 初期化処理が追記されます。
- Miniforge3 をインストールしたら、ターミナルを再起動してください。

```
cd ~/github/judgesystem
curl -L -O "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-$(uname)-$(uname -m).sh"
chmod u+x Miniforge3-$(uname)-$(uname -m).sh
./Miniforge3-$(uname)-$(uname -m).sh -b
~/miniforge3/bin/conda init
```

#### Miniforge3 を用いた python 環境作成

```
conda create -y -n python12_bid python=3.12
conda activate python12_bid
cd github/judgesystem/
pip install -r requirements.txt
```

### OCRのための gemini api キー

実行の際に、google ai studio の gemini api キーを記載したファイルパスを指定する必要があります。

`data/sec/google_ai_studio_api_key.txt` に置くとわかりやすいという想定ですが、別の場所でも構いません。

## 実行例

### sqlite3を使用する場合

- `--sqlite3_db_file_path` で、db ファイルの保存先を指定する必要があります。

```
python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/bid_announcements_pre_1.txt --sqlite3_db_file_path data/example.db --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt
```

### GCP bigqueryを使用する場合

- `--use_gcp_vm` を付ければ bigquery の使用を想定します。
- GCPのプロジェクトに応じて、以下を設定してください。
  - `--bigquery_project_id`
  - `--bigquery_dataset_name`
  - `--bigquery_location`

```
python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/bid_announcements_pre_1.txt --bigquery_location "asia-northeast1" --bigquery_project_id vocal-raceway-473509-f1 --bigquery_dataset_name October_20251004  --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --use_gcp_vm
```

## 資料類

### スクリプト資料

pdoc で作成できます。作成ファイルはレポジトリには登録していませんので、pdoc で作成してください。

以下を実行すれば、`doc/pdoc_bid_announcement_judgement_tools` 以下に html ファイルが作成されます。まずは `doc/pdoc_bid_announcement_judgement_tools/index.html` を参照してください。

`pdoc source/bid_announcement_judgement_tools/main.py source/bid_announcement_judgement_tools/requirements/experience.py source/bid_announcement_judgement_tools/requirements/grade_item.py source/bid_announcement_judgement_tools/requirements/ineligibility.py source/bid_announcement_judgement_tools/requirements/location.py source/bid_announcement_judgement_tools/requirements/technician.py -o doc/pdoc_bid_announcement_judgement_tools`


### マスターデスクリプション

`doc/master_description` 参照。


## webアプリのデプロイ

Google Cloud Platform(GCP) を用いてwebアプリをデプロイします。(GCP環境構築については省略)

### デプロイのための操作

(スクリプトの内容などは割愛します)

#### バックエンドのデプロイ1

※cors設定のため、frontend の url を指定する箇所があります。frontend のアプリをデプロイしないとわからないため、後で同様の操作を実行します。

1. source/app_backend を cloud shell にコピーする。(レポジトリをクローンするか、zip 圧縮してアップロードするなどすればよい)
2. app_backend に移動し、`./backend_gcloud_command_sample.sh` で実行。backendがデプロイされる。
3. 2. でデプロイしたbackendのurlをメモする。フロントエンドのデプロイの際に使用する。

#### フロントエンドのデプロイ

1. source/app_frontend を cloud shell にコピーする。(レポジトリをクローンするか、zip 圧縮してアップロードするなどすればよい)
2. app_frontend に移動する。
3. `git clone https://github.com/takahiro-shimizu-2/judgesystem_ui_only.git app` で app に frontend ソースを clone。githubユーザー名とパスワード(githubアクセストークン)が要求される。
4. `./frontend_gcloud_command_sample.sh --url backendのurl` で実行。backendのurlを --url 引数に与える。末bにスラッシュはつけない。
  - app_relpacement_files にあるファイルで、app の一部を置換。
  - mockData.ts の fetch 先 url を更新。
  - frontendをデプロイ。
  - frontendのurlをメモする。

#### バックエンドのデプロイ2

1. app_backend に移動し、`chmod u+x backend_gcloud_command_sample.sh` で実行権限を付与。
2. `./backend_gcloud_command_sample.sh --url frontendのurl` で実行。frontendのurlを --url 引数に与える。
  - app/index.ts の cors 先の url を変更する。
  - backendがデプロイされる。

