# 公告判定システム - 判定処理

## システム概要

外部から収集した官公庁の入札情報をまとめ、企業ごとに入札可否判定します。

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
