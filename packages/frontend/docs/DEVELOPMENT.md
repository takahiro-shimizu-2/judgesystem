# 開発ガイドライン

## 開発環境のセットアップ

> **Note**: このプロジェクトはDocker環境で開発・実行することを前提としています。

### Docker環境（推奨）

```bash
# 本番ビルド＆起動（http://localhost:8080）
docker compose up -d --build

# 停止
docker compose down
```

### Docker開発環境（ホットリロード対応）

```bash
# 開発サーバー起動（http://localhost:5173）
docker compose --profile dev up dev

# バックグラウンドで起動
docker compose --profile dev up -d dev

# 停止
docker compose --profile dev down
```

### ローカル開発（Docker未使用）

Docker環境を使用できない場合のみ：

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build

# リント
npm run lint
```

---

## コーディング規約

### ファイル命名規則

- **コンポーネント**: PascalCase（例: `BidListHeader.tsx`）
- **ユーティリティ/定数**: camelCase（例: `styles.ts`）
- **カスタムフック**: `use` プレフィックス + camelCase（例: `useBidListState.ts`）
- **型定義**: `index.ts` でまとめてエクスポート

### コンポーネント設計

1. **単一責任の原則**: 1コンポーネント = 1つの役割
2. **メモ化**: パフォーマンスが重要なコンポーネントは `React.memo()` を使用
3. **Props型定義**: 必ずinterfaceで型を定義

```tsx
interface MyComponentProps {
  title: string;
  onClick: () => void;
}

export function MyComponent({ title, onClick }: MyComponentProps) {
  // ...
}
```

### カスタムフック設計

- 状態管理ロジックはカスタムフックに抽出
- ページコンポーネントはUI描画に集中
- 永続化（localStorage等）はフック内で完結

```tsx
// hooks/useBidListState.ts - 判定結果一覧専用
export function useBidListState() {
  const [filters, setFilters] = useState(...);

  // localStorage永続化
  useEffect(() => {
    localStorage.setItem('key', JSON.stringify(filters));
  }, [filters]);

  return { filters, setFilters };
}

// hooks/useListPageState.ts - 各一覧ページ共通
export function useListPageState<T>(
  data: T[],
  filterFn: (items: T[], query: string) => T[]
) {
  const [searchQuery, setSearchQuery] = useState('');
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
  const { isOpen } = useSidebar();
  const [gridKey, setGridKey] = useState(0);

  // サイドバー開閉時のDataGrid再レンダリング
  useEffect(() => {
    const timer = setTimeout(() => setGridKey(prev => prev + 1), 220);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const rows = useMemo(() => filterFn(data, searchQuery), [data, searchQuery, filterFn]);

  return {
    searchQuery, setSearchQuery,
    paginationModel, setPaginationModel,
    gridKey, rows
  };
}

// pages/BidListPage.tsx
export default function BidListPage() {
  const { filters, setFilters } = useBidListState();
  // UIのみに集中
}

// pages/PartnerListPage.tsx
export default function PartnerListPage() {
  const { searchQuery, rows, ... } = useListPageState(partners, filterFn);
  // UIのみに集中
}
```

### スタイリング

- **カラー定数**: `src/constants/styles.ts` の `colors` オブジェクトを使用
- **フォントサイズ**: `fontSizes` オブジェクトを使用
- **borderRadius**: `borderRadius.xs` (4px) を統一使用
- **ハードコード禁止**: カラーコードを直接記述しない
- **レスポンシブ**: MUIのbreakpoints（xs, sm, md, lg, xl）を活用

```tsx
import { colors, fontSizes, borderRadius } from '../constants/styles';

// Good
sx={{
  color: colors.primary.main,
  fontSize: fontSizes.md,
  borderRadius: borderRadius.xs,
}}

// Bad
sx={{
  color: '#1e3a5f',
  fontSize: '0.85rem',
  borderRadius: '8px',
}}
```

## ディレクトリ構成ルール

### components/

再利用可能なUIコンポーネントを配置。

```
components/
├── bid/             # 入札ドメイン固有コンポーネント
│   ├── BidListHeader.tsx
│   ├── CustomPagination.tsx
│   ├── FilterModal.tsx
│   ├── DisplayConditionsPanel.tsx
│   ├── PriorityCell.tsx
│   ├── RequirementCard.tsx
│   ├── StatusCell.tsx
│   └── index.ts
├── common/          # 汎用コンポーネント
│   ├── ContactInfo.tsx
│   ├── ConfigChip.tsx
│   ├── DetailComponents.tsx
│   ├── FloatingButtons.tsx
│   └── index.ts
├── workflow/        # ワークフロー関連
│   ├── WorkflowStepper.tsx
│   ├── WorkflowSection.tsx
│   └── sections/
├── layout/          # レイアウトコンポーネント
│   ├── MainLayout.tsx
│   └── Sidebar.tsx
├── announcement/    # 入札案件関連
├── orderer/         # 発注者関連
├── partner/         # 会社情報関連
└── index.ts
```

### hooks/

カスタムReactフックを配置。

```
hooks/
├── useBidListState.ts   # 判定結果一覧の状態管理（フィルター・localStorage永続化）
├── useListPageState.ts  # 各一覧ページ共通の状態管理
└── index.ts
```

### pages/

ルーティングに対応するページコンポーネント。

### constants/

アプリケーション全体で使用する定数（ラベル・色・設定値）。

```
constants/
├── styles.ts              # 共通スタイル・カラー定数・borderRadius
├── detailPageStyles.ts    # 詳細ページスタイル
├── status.ts              # 判定結果ステータス設定
├── workStatus.ts          # 作業ステータス設定
├── priority.ts            # 優先順位の色・ラベル
├── partnerStatus.ts       # 協力会社ステータス（ラベル・色・優先度）
├── announcementStatus.ts  # 入札案件ステータス設定
├── bidType.ts             # 入札方式設定
├── documentType.ts        # ドキュメント種別設定
├── workflow.ts            # ワークフロー設定
├── categories.ts          # 工事カテゴリ
├── prefectures.ts         # 都道府県
├── organizations.ts       # 発注機関
├── emailTemplates.ts      # メールテンプレート
├── icons.ts               # アイコン定義
├── locales.ts             # DataGrid日本語化
├── datagrid.ts            # DataGrid設定
└── index.ts
```

### types/

TypeScriptの型定義。定数は含めず、純粋な型のみ。

```
types/
├── index.ts          # 共通型（EvaluationStatus, WorkStatus, Company等）+ 全型のre-export
├── workflow.ts       # ワークフロー型（Partner, PartnerStatus, Document, CheckItem, CallLog等）
├── partner.ts        # 会社情報型（PartnerListItem, PastProject, Qualifications等）
├── orderer.ts        # 発注者型（Orderer, OrdererCategory）
└── announcement.ts   # 入札案件型（AnnouncementStatus, AnnouncementWithStatus）
```

### data/

データ関連（モックデータ）。

```
data/
├── index.ts          # データのre-export
├── evaluations.ts    # 判定結果データ
├── announcements.ts  # 入札案件データ
├── partners.ts       # 会社マスター（協力会社＋企業情報統合）
├── companies.ts      # 企業参照用マスター
└── orderers.ts       # 発注者マスター
```

### utils/

ユーティリティ関数。

## パフォーマンス最適化

### DataGrid

MUI DataGrid の仮想スクロール機能を活用。

```tsx
<DataGrid
  rows={rows}
  columns={columns}
  pageSizeOptions={[25, 50, 100]}
  hideFooter  // CustomPaginationを使用
/>
```

### メモ化

- `useMemo`: 計算コストの高い値のキャッシュ
- `useCallback`: コールバック関数の安定化
- `React.memo`: コンポーネントの再レンダリング防止

```tsx
// 列定義のメモ化
function useColumns(): GridColDef[] {
  return useMemo(() => [
    { field: 'title', headerName: '公告名' },
    // ...
  ], []);
}

// フィルタリング結果のメモ化
const filteredRows = useMemo(() => {
  return data.filter(...);
}, [data, filters]);
```

## 型定義

### ステータス

```typescript
type EvaluationStatus = 'all_met' | 'other_only_unmet' | 'unmet';
```

| ステータス | 表示名 | 意味 |
|-----------|--------|------|
| `all_met` | 参加可能 | 全要件を満たしている |
| `other_only_unmet` | 特殊条件 | その他要件のみ未達 |
| `unmet` | 参加不可 | 必須要件が未達 |

### 作業ステータス

```typescript
type WorkStatus = 'not_started' | 'in_progress' | 'completed';
```

| ステータス | 表示名 | 色 |
|-----------|--------|-----|
| `not_started` | 未着手 | グレー |
| `in_progress` | 着手中 | 青 |
| `completed` | 完了 | 緑 |

### 企業優先順位

```typescript
type CompanyPriority = 1 | 2 | 3 | 4 | 5;
```

| 優先度 | 表示 | 色 |
|--------|------|-----|
| 1 | ★★★ | 赤 |
| 2 | ★★☆ | オレンジ |
| 3 | ★★ | 黄 |
| 4 | ★☆ | 緑 |
| 5 | ★ | グレー |

## インポートの順序

1. React関連
2. サードパーティライブラリ
3. カスタムフック
4. 型定義
5. 定数
6. ユーティリティ
7. コンポーネント

```tsx
// 1. React
import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

// 2. サードパーティ
import { Box, Paper } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

// 3. カスタムフック
import { useBidListState } from '../hooks/useBidListState';

// 4. 型定義
import type { EvaluationStatus } from '../types';

// 5. 定数
import { statusConfig } from '../constants/status';
import { colors, borderRadius } from '../constants/styles';

// 6. ユーティリティ
import { japaneseIncludes } from '../utils/search';

// 7. コンポーネント
import { StatusCell, FilterModal } from '../components/bid';
```

## Git運用

### ブランチ

- `main`: 本番環境
- `develop`: 開発環境
- `feature/*`: 機能開発

### コミットメッセージ

```
<type>: <subject>

<body>
```

**type**:
- `feat`: 新機能
- `fix`: バグ修正
- `refactor`: リファクタリング
- `docs`: ドキュメント
- `style`: フォーマット変更
- `test`: テスト追加・修正
