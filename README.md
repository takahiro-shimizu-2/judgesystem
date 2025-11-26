# bid judgement

## 内容物

- data/bid_announcements_pre/bid_announcements_pre_1.txt
  - 判定前公告の表です。
- data/master/*
  - 各種マスターです。
- data/ocr/*
  - 公告idごとのOCR結果のファイル出力先を想定しています。
- data/example.db
  - sqlite3 の database ファイルです。
- source/bid_announcement_judgement_tools
  - ソースコードが置いてあります。実行方法は、実行方法の節を参照してください。
- requirements.txt
  - pythonライブラリ一覧。


## 実行環境

- 以下の2つを想定。
  - GCP VM と VM からの bigquery
  - sqlite3
- python 3.12.10
  - ライブラリについては requirements.txt を参照してください。(無関係なライブラリが含まれている可能性はあります)

## 実行方法

※ocr無し(google ai studio に接続しなくてよい)なら、ひとまずは --google_ai_studio_api_key_filepath を指定する必要はありません(以下の実行例では --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt)を削除してあります。

- GCP vm からの bigquery使用を想定
  - python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/bid_announcements_pre_1.txt --bigquery_location "asia-northeast1" --bigquery_project_id vocal-raceway-473509-f1 --bigquery_dataset_name October_20251004 --use_gcp_vm
- sqlite3想定
  - python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/bid_announcements_pre_1.txt --sqlite3_db_file_path data/example.db

