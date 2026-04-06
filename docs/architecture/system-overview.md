# システムアーキテクチャ概要

## 1. システム全体像

入札参加資格審査（判定）システム。公告情報を収集・OCR解析し、企業の入札参加資格を自動判定する。

```mermaid
graph TB
    subgraph "外部サービス"
        GOV[公告サイト<br>防衛省等]
        GEMINI[Vertex AI / Gemini<br>OCR・情報抽出]
        GCS[Google Cloud Storage<br>PDF/Markdown保存]
    end

    subgraph "packages/engine (Python)"
        CLI[cli/entry.py<br>CLIエントリーポイント]
        STEP0[Step0: Document Pipeline<br>HTML取得→PDF DL→OCR]
        STEP3[Step3: Judgement<br>要件判定処理]
        EREPO[repository/<br>postgres.py / sqlite.py / bigquery.py]
    end

    subgraph "packages/backend (TypeScript/Express)"
        API[Express API Server<br>index.ts]
        CTRL[Controllers<br>evaluation / announcement / partner / orderer / contact / company]
        SVC[Services<br>ビジネスロジック層]
        BREPO[Repositories<br>SQL実行層]
    end

    subgraph "packages/frontend (React/TypeScript)"
        UI[React SPA<br>Vite 7 + MUI v7]
        PAGES[Pages<br>12ページ]
        DATA[data/<br>APIクライアント + モック混在]
    end

    subgraph "データストア"
        PG[(PostgreSQL<br>35テーブル)]
    end

    GOV -->|HTML取得| STEP0
    STEP0 -->|PDF送信| GEMINI
    GEMINI -->|OCR結果| STEP0
    STEP0 -->|PDF保存| GCS
    STEP0 -->|直接SQL| EREPO
    STEP3 -->|直接SQL| EREPO
    EREPO -->|読み書き| PG

    UI --> DATA
    DATA -->|HTTP| API
    API --> CTRL
    CTRL --> SVC
    SVC --> BREPO
    BREPO -->|読み書き| PG

    CLI --> STEP0
    CLI --> STEP3

    style PG fill:#f9f,stroke:#333
    style GEMINI fill:#bbf,stroke:#333
    style GOV fill:#bfb,stroke:#333
```

## 2. パッケージ構成

```
judgesystem/
├── packages/
│   ├── engine/           # Python 判定エンジン
│   │   ├── cli/          #   CLIエントリーポイント
│   │   ├── application/  #   アプリケーションサービス
│   │   ├── domain/       #   ドメインロジック（OCR, 判定, パイプライン）
│   │   ├── repository/   #   DB操作（PostgreSQL/SQLite/BigQuery）
│   │   ├── requirements/ #   要件判定ロジック
│   │   └── sources/      #   公告ソース定義
│   │
│   ├── backend/          # TypeScript Express API
│   │   └── src/
│   │       ├── controllers/  # ルーティング + リクエスト処理
│   │       ├── services/     # ビジネスロジック
│   │       ├── repositories/ # SQL実行
│   │       ├── middleware/   # 認証・認可
│   │       └── types/        # 型定義
│   │
│   ├── frontend/         # React SPA
│   │   └── src/
│   │       ├── pages/        # 12ページコンポーネント
│   │       ├── components/   # 再利用コンポーネント
│   │       ├── hooks/        # カスタムフック
│   │       ├── contexts/     # グローバル状態
│   │       ├── data/         # APIクライアント層
│   │       ├── types/        # 型定義
│   │       └── constants/    # 定数・設定
│   │
│   └── shared/           # 共有型定義（TypeScript のみ）
│
├── db/
│   ├── migrations/       # SQLマイグレーション
│   └── seeds/            # シードデータ
│
├── deploy/               # Docker Compose
├── scripts/              # デプロイ・管理スクリプト
└── data/                 # マスターデータ（TSVファイル）
```

## 3. データフロー

```mermaid
sequenceDiagram
    participant GOV as 公告サイト
    participant ENGINE as Engine (Python)
    participant GEMINI as Vertex AI/Gemini
    participant DB as PostgreSQL
    participant BACKEND as Backend API
    participant UI as Frontend

    Note over ENGINE: Step0: ドキュメント準備
    ENGINE->>GOV: HTML取得
    GOV-->>ENGINE: 公告ページHTML
    ENGINE->>ENGINE: リンク抽出・PDF URL特定
    ENGINE->>GOV: PDF ダウンロード
    GOV-->>ENGINE: PDFファイル
    ENGINE->>GEMINI: PDF送信（OCR依頼）
    GEMINI-->>ENGINE: 公告情報JSON + 要件テキスト
    ENGINE->>DB: bid_announcements INSERT
    ENGINE->>DB: bid_requirements INSERT
    ENGINE->>DB: announcements_documents_master INSERT
    ENGINE->>DB: bid_announcements_dates INSERT

    Note over ENGINE: Step3: 要件判定
    ENGINE->>ENGINE: マスターデータ読込（TSVファイル）
    ENGINE->>DB: company × office 組み合わせ取得
    ENGINE->>ENGINE: 並列判定処理（CPUコア数）
    ENGINE->>DB: company_bid_judgement INSERT
    ENGINE->>DB: sufficient_requirements INSERT
    ENGINE->>DB: insufficient_requirements INSERT

    Note over UI: ユーザー操作
    UI->>BACKEND: GET /api/evaluations
    BACKEND->>DB: SELECT company_bid_judgement + 関連テーブル
    DB-->>BACKEND: 判定結果
    BACKEND-->>UI: JSON レスポンス

    UI->>BACKEND: PATCH /api/evaluations/:id
    BACKEND->>DB: UPDATE backend_evaluation_statuses
    DB-->>BACKEND: 更新結果
    BACKEND-->>UI: 更新完了
```

## 4. 技術スタック

| 層 | 技術 | バージョン |
|---|------|-----------|
| Frontend | React + TypeScript | React 19 |
| UI Library | MUI (Material UI) | v7 |
| Bundler | Vite | 7 |
| Router | React Router | v7 |
| Backend | Express.js + TypeScript | - |
| DB | PostgreSQL | - |
| Engine | Python | 3.12 |
| AI/OCR | Vertex AI / Gemini | gemini-2.5-flash |
| PDF解析 | pdfplumber, PyMuPDF | - |
| ORM | なし（生SQL） | - |
| 認証 | JWT Bearer Token | - |
| ストレージ | Google Cloud Storage | - |
| デプロイ | Cloud Run + Docker | - |

## 5. 既知の設計問題

| 問題 | Issue | 影響 |
|------|-------|------|
| Engine と Backend が同じDBを独立に直接操作 | #120 | データ不整合、競合状態 |
| DBカラム命名規則の混在 | #121 | SQLバグの温床 |
| Frontend ページ肥大化・状態管理パターン乱立 | #122 | 保守性低下 |
| shared パッケージが TypeScript 限定 | #123 | Engine との型乖離 |
