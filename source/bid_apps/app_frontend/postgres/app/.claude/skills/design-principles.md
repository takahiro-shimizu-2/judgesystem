# Design Principles

UIデザインシステムの基本原則。新しいコンポーネントやページを作成する際の指針。

## 1. 一元管理の原則

### スタイル定数の一元化

全てのデザイントークン（色、フォント、スペーシング等）は定数ファイルで一元管理する。

```
src/constants/
├── styles.ts          # カラー、フォント、スペーシング、共通スタイル
├── icons.ts           # アイコンのエクスポート
├── [status].ts        # 各種ステータス定義（色・ラベル）
└── ...
```

**ルール:**
- ハードコードされた色・サイズは禁止
- 全ての値は定数からインポートして使用
- 新しい色やサイズが必要な場合は定数ファイルに追加

```tsx
// NG
<Box sx={{ color: '#64748b', fontSize: '0.875rem' }}>

// OK
<Box sx={{ color: colors.text.muted, fontSize: fontSizes.sm }}>
```

### アイコンの一元化

アイコンは専用ファイルでエイリアスを定義し、セマンティックな名前で使用する。

```tsx
// icons.ts
export { Phone as PhoneIcon } from '@mui/icons-material';
export { Email as EmailIcon } from '@mui/icons-material';

// 使用側
import { PhoneIcon } from '../constants/icons';
```

**メリット:**
- アイコンの変更が1箇所で完結
- 用途に応じた命名で可読性向上
- 未使用アイコンの特定が容易

## 2. カラーシステム

### セマンティックカラー

色は用途（セマンティクス）で命名する。

```tsx
colors = {
  // 階層構造で整理
  primary: { main, light, dark },

  // ステータス色（成功/警告/エラー/情報）
  status: {
    success: { main, light, bg, border },
    warning: { main, light, bg, border },
    error: { main, light, bg, border },
    info: { main, light, bg, border },
  },

  // テキスト色（濃度順）
  text: { primary, secondary, muted, light, white },

  // 背景色
  background: { default, paper, alt, hover },

  // ボーダー色
  border: { light, main, dark },

  // ページ背景
  page: { background },

  // アクセントカラー
  accent: { blue, green, orange, red, ... },
}
```

### ステータス色の構成

各ステータスは4色セットで定義する:

| Token | 用途 |
|-------|------|
| `main` | テキスト、アイコン |
| `light` | 明るめのアクセント |
| `bg` | 背景色（薄い） |
| `border` | ボーダー色 |

## 3. タイポグラフィ

### フォントサイズスケール

相対単位（rem）で一貫したスケールを定義する。

```tsx
fontSizes = {
  xs: '0.75-0.8rem',    // 最小（バッジ、補助）
  sm: '0.875rem',       // 小（ラベル、キャプション）
  md: '0.9-0.925rem',   // 中（本文）
  base: '1rem',         // 基準
  lg: '1.1rem',         // 大（サブ見出し）
  xl: '1.2rem',         // 特大（見出し）
}
```

### フォントウェイト

| Weight | 用途 |
|--------|------|
| 400 | 通常テキスト |
| 500 | 強調テキスト、ラベル |
| 600 | セクション見出し |
| 700 | ページタイトル、重要な数値 |

## 4. スペーシングと余白

### スペーシングスケール

MUIのspacing単位（8px）をベースに一貫したスケールを使用。

```tsx
spacing = {
  xs: 0.5,  // 4px
  sm: 1,    // 8px
  md: 1.5,  // 12px
  lg: 2,    // 16px
  xl: 3,    // 24px
}
```

### 余白の使い分け

| 用途 | 推奨値 |
|------|--------|
| インライン要素間 | gap: 0.5-1 |
| カード内パディング | p: 2-3 |
| セクション間 | gap/mb: 2-3 |
| ページパディング | p: 2-3 (レスポンシブ) |

## 5. Border Radius

### 統一された角丸

コンポーネントの角丸は統一する。プロジェクト全体で一貫性を保つ。

```tsx
borderRadius = {
  xs: '4px',     // 全コンポーネント共通（推奨）
  sm: '6px',
  md: '8px',
  lg: '12px',
  full: '9999px', // 丸ボタン
}
```

**原則:** 1つのサイズ（例: xs = 4px）に統一し、例外を作らない。

## 6. シャドウ

### 深度に応じたシャドウ

```tsx
shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.05)',     // フラット
  md: '0 2px 8px rgba(0,0,0,0.1)',      // カード
  lg: '0 4px 12px rgba(0,0,0,0.15)',    // モーダル
  xl: '0 8px 24px rgba(0,0,0,0.2)',     // ドロップダウン
}
```

## 7. レスポンシブデザイン

### ブレークポイント

```tsx
// MUI標準ブレークポイント
xs: 0      // モバイル
sm: 600    // タブレット縦
md: 900    // タブレット横 / 小デスクトップ
lg: 1200   // デスクトップ
xl: 1536   // 大画面
```

### レスポンシブ値の記述

```tsx
sx={{
  // パディング: モバイル→タブレット→デスクトップ
  p: { xs: 1.5, sm: 2, md: 3 },

  // グリッド: モバイル1列→デスクトップ2列
  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },

  // 表示/非表示
  display: { xs: 'none', md: 'block' },

  // フォントサイズ
  fontSize: { xs: '0.875rem', md: '1rem' },
}}
```

## 8. インタラクション

### ホバー状態

```tsx
'&:hover': {
  backgroundColor: colors.background.hover,
  borderColor: 'rgba(主色, 0.4)',
  boxShadow: shadows.md,
}
```

### トランジション

```tsx
transition: 'all 0.2s ease',
// または個別指定
transition: 'background-color 0.15s, border-color 0.15s',
```

### カーソル

| 状態 | cursor |
|------|--------|
| クリック可能 | `pointer` |
| ドラッグ可能 | `grab` / `grabbing` |
| 無効 | `not-allowed` |

## 9. 型定義とステータス

### ステータス設定の構造

各ステータスは型とConfigをセットで定義する。

```tsx
// types/index.ts
type Status = 'pending' | 'in_progress' | 'completed';

// constants/status.ts
const statusConfig: Record<Status, {
  label: string;
  color: string;
  bgColor: string;
  borderColor?: string;
  icon?: SvgIconComponent;
}> = {
  pending: { label: '未着手', color: '...', bgColor: '...' },
  in_progress: { label: '進行中', color: '...', bgColor: '...' },
  completed: { label: '完了', color: '...', bgColor: '...' },
};
```

## 10. 命名規則

### ファイル命名

| 種類 | 命名規則 | 例 |
|------|----------|-----|
| コンポーネント | PascalCase | `StatusChip.tsx` |
| 定数・ユーティリティ | camelCase | `styles.ts` |
| 型定義 | camelCase | `types/index.ts` |
| カスタムフック | use接頭辞 | `useListState.ts` |

### CSS-in-JS命名

```tsx
// スタイルオブジェクトは用途で命名
const pageStyles = { container, contentArea, mainCard };
const cardStyles = { base, elevated };
const buttonStyles = { primary, outlined, small };
```
