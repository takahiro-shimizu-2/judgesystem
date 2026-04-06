# Miyabi 統合システム診断レポート — judgesystem

**診断日**: 2026-03-24 | **ブランチ**: `refactor/system-optimization` | **診断者**: Miyabi Agent

---

## Executive Summary

judgesystemは機能的には動作するが、スケーラブルなシステムとして運用するには基盤が未成熟。
7つの観点から包括的に診断した結果、**総合スコアは 34/100**。

```
judgesystem 総合システム成熟度: 34/100  [Lv.1 初期段階]
目標: Lv.3 スケール運用可能 (75/100)
```

---

## 7軸スコアカード

| # | 診断軸 | スコア | 判定 | 最大リスク |
|---|--------|--------|------|-----------|
| 1 | アーキテクチャ成熟度 | 45/100 | WARN | DI欠如・モジュール結合度高 |
| 2 | スケーラビリティ & パフォーマンス | 25/100 | CRITICAL | N+1クエリ・キャッシュ皆無・ILIKE全件スキャン |
| 3 | 開発基盤 (DX) | 30/100 | CRITICAL | ワンコマンド起動不可・Monorepo管理なし |
| 4 | 運用基盤 (Ops) | 15/100 | CRITICAL | 構造化ログなし・ヘルスチェックなし・手動デプロイ |
| 5 | セキュリティ & コンプライアンス | 20/100 | CRITICAL | 認証認可なし・.gitignore致命的不備 |
| 6 | コード品質 & 技術的負債 | 35/100 | CRITICAL | God Object・テスト0件・巨大コンポーネント |
| 7 | データ基盤 | 40/100 | WARN | インデックス不明・バックアップ戦略不明確 |

---

## 1. アーキテクチャ成熟度 — 45/100

### 現状
3層アーキテクチャ（Controller→Service→Repository）の骨格はあるが、結合度が高く拡張困難。

### 主要問題

| 項目 | 評価 | 問題 |
|------|------|------|
| モジュール分離 | B | 3層は存在するが、Repository内にビジネスロジック混在 |
| 依存性注入 | D | DIコンテナなし。`new Service()` の手動注入でテスト不可能 |
| コンポーネント境界 | C | Python↔Backend間のデータフロー契約が曖昧 |
| API設計 | C | RESTful部分的。レスポンス形式不統一、バージョニングなし |

### 致命的問題: Backend DI なし

```typescript
// テスト不可能な密結合
class EvaluationController {
  constructor() {
    this.service = new EvaluationService(); // ハードコーディング
  }
}
```

---

## 2. スケーラビリティ & パフォーマンス — 25/100

### 現状
同時接続100ユーザーが限界。DBクエリが最大のボトルネック。

### 主要問題

| 項目 | 評価 | 問題 |
|------|------|------|
| DBクエリ効率 | F | 12+ JOINの巨大クエリ。COUNT(*)が独立実行。ILIKE全テーブルスキャン |
| インデックス戦略 | F | 可視的なインデックス定義なし |
| キャッシュ | F | API・DB・フロントエンド全てにキャッシュなし |
| 非同期処理 | F | ジョブキュー未実装。GCS I/Oがメインスレッドでブロック |
| コード分割 | D | Vite設定が最小限。Route-based lazy loadingなし |

### 致命的問題: 検索がILIKEで全件スキャン

```sql
WHERE "workName" ILIKE '%検索語%' OR "topAgencyName" ILIKE '%検索語%'
```

---

## 3. 開発基盤 (DX) — 30/100

### 現状
新規開発者がプロジェクトに参加するのに手順書が不十分で、品質ゲートがない。

### 主要問題

| 項目 | 評価 | 問題 |
|------|------|------|
| ローカル起動 | F | ワンコマンド起動不可。統合docker-composeなし |
| READMEの完成度 | D | Python処理エンジンのみ記載。Webアプリの開発手順なし |
| コード品質ツール | D | ESLint(Frontendのみ)。Prettier/Husky/commitlintなし |
| Monorepo管理 | F | npm workspaces/Turborepo未導入。設定が散在 |
| CI/CDパイプライン | B | 14ワークフローでAgent自動化は高度。しかしテスト/ビルド検証なし |

---

## 4. 運用基盤 (Ops) — 15/100

### 現状
本番運用に必要な基盤がほぼ皆無。障害発生時に原因追跡が不可能。

### 主要問題

| 項目 | 評価 | 問題 |
|------|------|------|
| ログ設計 | F | `console.log/error` のみ。構造化ログなし |
| ヘルスチェック | F | `/health` エンドポイントなし |
| エラーハンドリング | F | グローバルエラーハンドラなし |
| グレースフルシャットダウン | F | SIGTERM/SIGINT ハンドリングなし |
| デプロイ戦略 | F | 手動スクリプト実行 |
| 監視・アラート | F | APM/Sentry/Prometheus なし |

---

## 5. セキュリティ & コンプライアンス — 20/100

### 現状
認証認可が完全欠落。OWASP Top 10の4項目でCritical違反。

### OWASP Top 10 違反状況

| 項目 | 状態 | リスク |
|------|------|--------|
| A01 Broken Access Control | CRITICAL | 認証・認可なし、全ルート公開 |
| A04 Insecure Design | CRITICAL | 認証・RBAC 設計なし |
| A07 Auth Failures | CRITICAL | 認証機構なし |
| A09 Logging Failures | CRITICAL | 詳細エラーログ、PII 露出 |
| A03 Injection | MEDIUM | パラメータ化クエリ使用だがsortField検証不足 |
| A05 Security Misconfiguration | MEDIUM | ログレベル過剰、SSL デフォルト無効 |

### .gitignore 致命的不備

ルートレベルの .gitignore に以下が未登録:
- `.env*` — 環境変数漏洩リスク
- `node_modules/` — 依存パッケージ
- `__pycache__/` / `*.pyc` — Pythonキャッシュ
- `.venv/` — 仮想環境
- `dist/` / `build/` — ビルド出力

---

## 6. コード品質 & 技術的負債 — 35/100

### テスト: 全コンポーネントで0件

| コンポーネント | テストフレームワーク | テスト件数 | カバレッジ |
|--------------|-------------------|----------|-----------|
| Frontend | なし | 0 | 0% |
| Backend | なし | 0 | 0% |
| Python | なし | 0 | 0% |

### SOLID原則遵守状況

| 原則 | 遵守度 | 主な違反 |
|------|--------|---------|
| S (Single Responsibility) | 30% | BidJudgementSan: 1クラスで7-8責務 |
| O (Open/Closed) | 40% | 要件タイプ追加時にメインクラス修正必要 |
| I (Interface Segregation) | 50% | FilterParams: 35+フィールドの巨大インターフェース |
| D (Dependency Inversion) | 60% | DIコンテナなし、テスト時mock困難 |

### 巨大ファイル Top10

| ファイル | 行数 | 負債度 |
|---------|------|--------|
| main_bak.py | 7,167 | デッドコード。即削除可 |
| bid_judgement.py | 3,855 | God Object。75メソッド |
| db_operator.py | 2,838 | 3DB対応を1ファイルで |
| AnnouncementDetailPage.tsx | 2,435 | 12個のuseState+フィルタ混在 |
| OrdererWorkflowSection.tsx | 1,700 | 15個のuseState+6段Props Drilling |
| PartnerDetailPage.tsx | 1,507 | 構造重複 |
| PartnerSection.tsx | 1,357 | 巨大コンポーネント |
| check_html/for_win/4_get_documents/main.py | 1,145 | 90%重複 |
| check_html/use_claude/4_get_documents/main.py | 1,188 | 90%重複 |
| DisplayConditionsPanel.tsx | 894 | フィルタUI肥大化 |

### TODO/FIXME: 12件

- P1: 2件（bid_judgement.py 改行分割、ineligibility.py 社会保険ロジック）
- P2: 6件
- P3: 4件

---

## 7. データ基盤 — 40/100

### 主要問題

| 項目 | 評価 | 問題 |
|------|------|------|
| スキーマ設計 | C | 16テーブル。部分的に正規化。冗長カラムあり |
| インデックス | F | 明示的なインデックス定義が確認できない |
| マスタデータ管理 | C | TSV+日本語ヘッダ重複版。更新戦略不明 |
| バックアップ | D | スクリプト存在するがスケジュール/暗号化/検証なし |
| 接続プール | D | デフォルト設定（max未指定で枯渇リスク） |

---

## 改善ロードマップ

```
現在 (34点)                                         目標 (75点)
   │                                                    │
   ▼                                                    ▼
Phase 0    Phase 1       Phase 2        Phase 3       Phase 4
衛生管理 → 基盤構築  →  品質向上   →   スケール対応 → 運用成熟
(1週間)   (3-4週間)    (3-4週間)      (3-4週間)     (2-3週間)
```

### Phase 0: 衛生管理（1週間）

- .gitignore 完全化
- デッドコード削除（main_bak.py, proto版, test版, backup/）
- check_html重複解消
- .env.example のSSLデフォルトを require に変更
- Helmet.js導入

### Phase 1: 基盤構築（3-4週間）

- 統合docker-compose
- Husky + lint-staged + commitlint
- 構造化ログ導入（Winston/Pino）
- グローバルエラーハンドラ + /health エンドポイント
- グレースフルシャットダウン
- JWT認証基盤 + RBAC設計
- テスト自動化パイプライン

### Phase 2: 品質向上（3-4週間）

- BidJudgementSan分割（5モジュールへ）
- AnnouncementDetailPage / OrdererWorkflowSection 分割
- evaluationRepository から SQLQueryBuilder 抽出
- Zodバリデーション層導入
- DI導入
- 状態管理統一
- テストフレームワーク導入（Vitest/Jest/pytest）

### Phase 3: スケール対応（3-4週間）

- インデックス戦略策定・適用
- 全文検索対応（pg_trgm or Elasticsearch）
- COUNT(*)をWindow関数に置換
- Redis キャッシュ導入
- APIレスポンス形式統一 + バージョニング
- Route-based code splitting
- Backend Dockerfileマルチステージ化

### Phase 4: 運用成熟（2-3週間）

- APM導入
- Error Boundary + Sentry連携
- IaC化（Terraform）
- 自動デプロイパイプライン
- npm audit / pip audit CI統合
- OpenAPI/Swagger自動生成

---

## 期待される効果

| 指標 | 現在 | Phase 2後 | Phase 4後 |
|------|------|-----------|-----------|
| 総合スコア | 34/100 | 55/100 | 75/100 |
| 同時接続限界 | ~100 | ~500 | ~5,000+ |
| テストカバレッジ | 0% | 40% | 70% |
| 障害復旧時間(MTTR) | 不明 | ~30分 | ~5分 |
| セキュリティ | OWASP 4項目違反 | 1項目 | 0項目 |
