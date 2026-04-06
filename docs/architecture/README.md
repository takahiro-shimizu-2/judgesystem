# アーキテクチャドキュメント

入札参加資格審査（判定）システムの現状設計を記録したドキュメント群。

## ドキュメント一覧

| ファイル | 内容 |
|---------|------|
| [system-overview.md](./system-overview.md) | システム全体像、パッケージ構成、データフロー、技術スタック |
| [database-schema.md](./database-schema.md) | 全35テーブルのスキーマ定義、ER図、リレーション、命名規則の問題 |
| [api-specification.md](./api-specification.md) | Backend API全エンドポイント、認証・認可、リクエスト/レスポンス仕様 |
| [engine-pipeline.md](./engine-pipeline.md) | Python Engine処理パイプライン（Step0〜Step3）、Gemini OCR、判定ロジック |
| [frontend-screens.md](./frontend-screens.md) | 全12ページの画面構成、画面遷移図、ワークフロー、コンポーネント構成 |

## システム構成の概要

```
公告サイト → Engine(Python) → PostgreSQL → Backend(Express) → Frontend(React)
                ↑                                  
          Vertex AI/Gemini                         
```

- **Engine**: 公告HTMLを取得し、Gemini AIでOCR・情報抽出を行い、企業の入札参加資格を判定
- **Backend**: 判定結果やマスターデータのCRUD APIを提供
- **Frontend**: 判定結果の閲覧・ワークフロー管理UI

## 既知の設計問題

設計上の構造的問題は GitHub Issues で追跡中:

- #120: Engine と Backend が同じDBを独立に直接操作
- #121: DBカラム命名規則の混在 + 外部キー制約の不備
- #122: Frontend ページ肥大化・状態管理パターンの乱立
- #123: shared パッケージが TypeScript 限定

作成日: 2026-03-31
