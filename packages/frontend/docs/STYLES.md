# スタイルガイド

このドキュメントでは、アプリケーション全体で統一されたスタイルとデザインルールを定義します。

## カラーパレット

すべてのカラーは `src/constants/styles.ts` の `colors` オブジェクトで一元管理されています。

### プライマリカラー

| 変数 | 値 | 用途 |
|------|-----|------|
| `colors.primary.main` | `#1e3a5f` | メインカラー（ヘッダー等） |
| `colors.primary.light` | `#e8f4fc` | 薄いプライマリ背景 |
| `colors.primary.dark` | `#0f172a` | 濃いプライマリ |
| `colors.primary.gradient` | グラデーション | ヘッダーグラデーション |

### ページ背景

| 変数 | 値 | 用途 |
|------|-----|------|
| `colors.page.background` | `#e2e8f0` | 全ページの背景色（統一） |

### ステータスカラー

| カテゴリ | 変数 | 用途 |
|---------|------|------|
| 成功 | `colors.status.success.main` (`#059669`) | 完了・参加可能 |
| 警告 | `colors.status.warning.main` (`#d97706`) | 注意・進行中 |
| エラー | `colors.status.error.main` (`#dc2626`) | エラー・参加不可 |
| 情報 | `colors.status.info.main` (`#3b82f6`) | 情報・リンク |

### アクセントカラー

| 変数 | 値 | 用途 |
|------|-----|------|
| `colors.accent.blue` | `#3b82f6` | 青（リンク、情報） |
| `colors.accent.blueHover` | `#2563eb` | 青ホバー |
| `colors.accent.blueDark` | `#1d4ed8` | 濃い青 |
| `colors.accent.green` | `#10b981` | 緑 |
| `colors.accent.greenDark` | `#059669` | 濃い緑 |
| `colors.accent.greenSuccess` | `#16a34a` | 成功緑 |
| `colors.accent.purple` | `#8b5cf6` | 紫 |
| `colors.accent.orange` | `#f59e0b` | オレンジ |
| `colors.accent.orangeDark` | `#ea580c` | 濃いオレンジ |
| `colors.accent.red` | `#ef4444` | 赤 |
| `colors.accent.yellow` | `#fbbf24` | 黄（星評価等） |

### テキストカラー

| 変数 | 値 | 用途 |
|------|-----|------|
| `colors.text.primary` | `#0f172a` | メインテキスト |
| `colors.text.secondary` | `#1e293b` | セカンダリテキスト |
| `colors.text.muted` | `#64748b` | ミュートテキスト |
| `colors.text.light` | `#94a3b8` | 薄いテキスト |
| `colors.text.white` | `#ffffff` | 白テキスト |

### 背景カラー

| 変数 | 値 | 用途 |
|------|-----|------|
| `colors.background.default` | `#f8fafc` | デフォルト背景 |
| `colors.background.paper` | `#ffffff` | ペーパー背景 |
| `colors.background.alt` | `#f1f5f9` | 代替背景 |
| `colors.background.hover` | `#f8fafc` | ホバー背景 |

### ボーダーカラー

| 変数 | 値 | 用途 |
|------|-----|------|
| `colors.border.light` | `#f1f5f9` | 薄いボーダー |
| `colors.border.main` | `#e2e8f0` | メインボーダー |
| `colors.border.dark` | `#cbd5e1` | 濃いボーダー |

## フォントサイズ

```typescript
fontSizes: {
  xs: '0.7rem',   // 極小
  sm: '0.8rem',   // 小
  md: '0.85rem',  // 中
  base: '0.9rem', // 基本
  lg: '1rem',     // 大
  xl: '1.1rem',   // 特大
}
```

## スペーシング

MUIのspacing単位を使用（1単位 = 8px）

```typescript
spacing: {
  xs: 0.5,  // 4px
  sm: 1,    // 8px
  md: 1.5,  // 12px
  lg: 2,    // 16px
  xl: 3,    // 24px
}
```

## ボーダー半径（統一: 4px）

```typescript
borderRadius: {
  xs: '4px',   // 統一使用（全コンポーネント）
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px', // 完全な丸
}
```

**重要**: 全てのコンポーネントで `borderRadius.xs` (4px) を使用してください。

## アイコン使用ルール

アイコンは `src/constants/icons.ts` で一元管理されています。

### 連絡先

| 用途 | アイコン |
|------|---------|
| 電話番号 | `PhoneIcon` |
| メールアドレス | `EmailIcon` |
| FAX番号 | `FaxIcon` (Print) |
| 住所・場所 | `LocationIcon` |

### ファイル・ドキュメント

| 用途 | アイコン |
|------|---------|
| 添付ファイル | `AttachFileIcon` (クリップ) |
| ドキュメント・書類 | `DocumentIcon` |
| アップロード | `UploadIcon` |

### 組織・人物

| 用途 | アイコン |
|------|---------|
| 企業・会社 | `BusinessIcon` |
| 個人・担当者 | `PersonIcon` |
| グループ・チーム | `GroupIcon` |
| 協力会社 | `HandshakeIcon` |
| 店舗・支店 | `StoreIcon` |

### ステータス

| 用途 | アイコン |
|------|---------|
| 完了・チェック済 | `CheckCircleIcon` (塗りつぶし) |
| 完了（軽め） | `CheckCircleOutlineIcon` (線のみ) |
| 未チェック | `UncheckedIcon` |

### アクション

| 用途 | アイコン |
|------|---------|
| 追加 | `AddIcon` |
| 編集 | `EditIcon` |
| 削除 | `DeleteIcon` |
| 保存 | `SaveIcon` |
| 確定 | `CheckIcon` |
| 閉じる・キャンセル | `CloseIcon` |

## 共通スタイルパターン

### ページコンテナ

```typescript
import { pageStyles, borderRadius } from '../constants/styles';

<Box sx={pageStyles.container}>
  <Box sx={pageStyles.contentArea}>
    <Paper sx={pageStyles.mainCard}>
      {/* コンテンツ */}
    </Paper>
  </Box>
</Box>
```

### 詳細ページ

```typescript
import { detailPageStyles } from '../constants/detailPageStyles';

<Box sx={detailPageStyles.page}>
  <Box sx={detailPageStyles.header}>
    {/* ヘッダー */}
  </Box>
  <Box sx={detailPageStyles.content}>
    <Box sx={detailPageStyles.twoColumnLayout}>
      {/* 2カラムコンテンツ */}
    </Box>
  </Box>
</Box>
```

### セクションスタイル

```typescript
import { sectionStyles, borderRadius } from '../constants/styles';

<Box sx={sectionStyles.container}>
  <Typography sx={sectionStyles.title}>
    <SomeIcon /> タイトル
  </Typography>
  <Paper sx={{ ...sectionStyles.paper, borderRadius: borderRadius.xs }}>
    {/* コンテンツ */}
  </Paper>
</Box>
```

### カード形式レイアウト（一覧ページ）

```typescript
// 一覧ページでのカード形式レイアウト
<Box sx={{ display: 'flex', gap: 2, height: '100%' }}>
  {/* 左側: DataGrid */}
  <Box sx={{ flex: 1 }}>
    <DataGrid ... />
  </Box>
  {/* 右側: 詳細パネル */}
  <Box sx={{ width: 320, borderRadius: borderRadius.xs }}>
    {/* 選択アイテムの詳細 */}
  </Box>
</Box>
```

## コンポーネント使用ガイド

### 連絡先情報

```tsx
import { ContactInfo, ContactActions } from '../components/common/ContactInfo';

// 連絡先情報の表示
<ContactInfo
  phone="03-1234-5678"
  email="example@email.com"
  fax="03-1234-5679"
  contactPerson="担当者名"
  layout="row" // または "column"
/>

// 電話・メールボタン
<ContactActions phone="03-1234-5678" email="example@email.com" />
```

### ステータスチップ

```tsx
import { EvaluationStatusChip, WorkStatusChip, PriorityChip } from '../components/common';
import { ConfigChip } from '../components/common';

// 判定結果
<EvaluationStatusChip status="all_met" />

// 作業ステータス
<WorkStatusChip status="in_progress" />

// 汎用チップ
<ConfigChip
  config={{ label: 'ラベル', color: colors.accent.blue, bgColor: 'rgba(59,130,246,0.1)' }}
  variant="outlined"
/>
```

### 一覧ページテンプレート

```tsx
import { ListPageTemplate } from '../components/templates';

<ListPageTemplate
  title="一覧タイトル"
  searchPlaceholder="検索..."
  searchQuery={searchQuery}
  onSearchChange={handleSearchChange}
  columns={columns}
  rows={rows}
  onRowClick={handleRowClick}
  paginationModel={paginationModel}
  onPaginationModelChange={handlePaginationModelChange}
/>
```

## ルール

### カラーコードの直書き禁止

```tsx
// NG
<Box sx={{ color: '#64748b' }}>

// OK
<Box sx={{ color: colors.text.muted }}>
```

### アイコンのインポート

```tsx
// NG - MUIから直接インポート
import { Phone } from '@mui/icons-material';

// OK - icons.tsから統一インポート
import { PhoneIcon } from '../constants/icons';
```

### スタイルの一元管理

```tsx
// NG - インラインで定義
<Box sx={{ backgroundColor: '#f8fafc', borderRadius: '8px' }}>

// OK - 定数を使用
<Box sx={{ backgroundColor: colors.background.default, borderRadius: borderRadius.xs }}>
```

### borderRadiusの統一

```tsx
// NG - 異なる値を使用
<Box sx={{ borderRadius: '8px' }}>
<Box sx={{ borderRadius: '12px' }}>

// OK - 統一して4px
<Box sx={{ borderRadius: borderRadius.xs }}>  // '4px'
```
