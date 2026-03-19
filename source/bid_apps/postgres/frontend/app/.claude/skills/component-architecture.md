# Component Architecture

コンポーネント設計のパターンと原則。

## 1. コンポーネント階層 (Atomic Design)

```
src/components/
├── common/           # 原子・分子レベル（再利用性高）
├── templates/        # ページテンプレート
├── layout/           # レイアウトコンポーネント
├── [domain]/         # ドメイン固有コンポーネント
└── pages/            # ページコンポーネント（ルートレベル）
```

### 階層の役割

| 階層 | 役割 | 例 |
|------|------|-----|
| common | 汎用的なUI部品 | Chip, InfoRow, Button |
| templates | ページの骨格 | ListPageTemplate |
| layout | アプリ全体の構造 | Sidebar, Header, MainLayout |
| [domain] | ドメイン固有のUI | FilterModal, StatusCell |
| pages | ルーティング対象 | ListPage, DetailPage |

## 2. カードパターン

### 基本カード構造

```tsx
<Box sx={{
  backgroundColor: 'white',
  borderRadius: borderRadius.xs,
  border: `1px solid ${colors.border.main}`,
  p: 2-3,
  // ホバー効果（クリック可能な場合）
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  '&:hover': {
    borderColor: 'rgba(accent, 0.4)',
    boxShadow: shadows.md,
  },
}}>
```

### カラーバー付きカード

ステータスを視覚的に示すカラーバーを左端に配置。

```tsx
<Box sx={{
  position: 'relative',
  // カラーバー
  '&::before': {
    content: '""',
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '3-4px',
    backgroundColor: statusColor,
  },
}}>
```

### 折りたたみカード (Accordion)

詳細ページのセクションに使用。

```tsx
<Accordion
  defaultExpanded
  sx={{
    boxShadow: 'none',
    border: `1px solid ${colors.border.main}`,
    borderRadius: `${borderRadius.xs} !important`,
    '&:before': { display: 'none' },
    '&.Mui-expanded': { margin: 0 },
  }}
>
  <AccordionSummary
    expandIcon={<ExpandIcon />}
    sx={{
      minHeight: 48,
      borderBottom: `1px solid ${colors.border.main}`,
      '&.Mui-expanded': { minHeight: 48 },
    }}
  >
    <Typography sx={{ fontWeight: 600 }}>セクションタイトル</Typography>
  </AccordionSummary>
  <AccordionDetails sx={{ p: 2-2.5 }}>
    {/* コンテンツ */}
  </AccordionDetails>
</Accordion>
```

## 3. 情報表示パターン

### キー・バリュー行

```tsx
interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  variant?: 'default' | 'list';
}

// default: 横並び（space-between）
<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <Typography sx={{ color: colors.text.muted }}>{label}</Typography>
  <Typography sx={{ color: colors.text.secondary, fontWeight: 500 }}>{value}</Typography>
</Box>

// list: アイコン付き、区切り線付き
<Box sx={{
  display: 'flex',
  alignItems: 'flex-start',
  gap: 1.5-2,
  py: 1-1.5,
  borderBottom: `1px solid ${colors.border.light}`,
  '&:last-child': { borderBottom: 'none' },
}}>
  {icon && <Box sx={{ mt: 0.25 }}>{icon}</Box>}
  <Typography sx={{ color: colors.text.muted, minWidth: 80-100 }}>{label}</Typography>
  <Typography sx={{ color: colors.text.secondary, flex: 1 }}>{value}</Typography>
</Box>
```

### 統計カード

```tsx
<Box sx={{
  p: 2-2.5,
  borderRadius: borderRadius.xs,
  textAlign: 'center',
  backgroundColor: colors.background.default,
}}>
  <Box sx={{ color: accentColor, mb: 1 }}>{icon}</Box>
  <Typography sx={{ fontSize: fontSizes.xl, fontWeight: 700, color: accentColor }}>{value}</Typography>
  <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>{label}</Typography>
</Box>
```

## 4. ステータスチップパターン

### Config駆動チップ

設定オブジェクトからチップを生成する汎用コンポーネント。

```tsx
interface ChipConfig {
  label: string;
  color: string;
  bgColor?: string;
  borderColor?: string;
  gradient?: string;
  icon?: SvgIconComponent;
}

type ChipVariant = 'filled' | 'outlined';

function ConfigChip({ config, variant = 'outlined', showIcon = true }: {
  config: ChipConfig;
  variant?: ChipVariant;
  showIcon?: boolean;
}) {
  return (
    <Chip
      icon={showIcon && config.icon ? <config.icon /> : undefined}
      label={config.label}
      size="small"
      sx={{
        ...(variant === 'filled'
          ? { background: config.gradient || config.color, color: 'white' }
          : { backgroundColor: config.bgColor, color: config.color, border: config.borderColor ? `1px solid ${config.borderColor}` : undefined }
        ),
        fontWeight: 600,
        fontSize: fontSizes.xs,
      }}
    />
  );
}
```

### 専用ステータスチップ

特定のステータス型に対応するラッパーコンポーネント。

```tsx
function StatusChip({ status }: { status: StatusType }) {
  const config = statusConfig[status];
  return <ConfigChip config={config} variant="outlined" showIcon={false} />;
}
```

## 5. フォームコンポーネント

### 検索フィールド

```tsx
<TextField
  placeholder="検索..."
  value={query}
  onChange={handleChange}
  size="small"
  sx={{
    width: { xs: '100%', md: 400 },
    '& .MuiOutlinedInput-root': {
      backgroundColor: colors.background.hover,
      borderRadius: borderRadius.xs,
      '& fieldset': { borderColor: colors.border.main },
      '&:hover fieldset': { borderColor: colors.border.dark },
      '&.Mui-focused fieldset': { borderColor: colors.accent.blue },
    },
  }}
  slotProps={{
    input: {
      startAdornment: (
        <InputAdornment position="start">
          <SearchIcon sx={{ color: colors.text.light }} />
        </InputAdornment>
      ),
    },
  }}
/>
```

### フィルターチップ（削除可能）

```tsx
<Chip
  label={filterLabel}
  size="small"
  onDelete={handleDelete}
  sx={{
    height: 28,
    fontSize: fontSizes.xs,
    fontWeight: 500,
    backgroundColor: colors.background.default,
    color: colors.text.mutedDark,
    border: `1px solid ${colors.border.main}`,
    '& .MuiChip-deleteIcon': {
      color: colors.text.light,
      '&:hover': { color: colors.accent.red },
    },
  }}
/>
```

## 6. ナビゲーションパターン

### 戻るボタン

```tsx
<Button
  size="small"
  startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
  onClick={onBack}
  sx={{
    color: colors.text.muted,
    fontWeight: 500,
    fontSize: fontSizes.sm,
    textTransform: 'none',
    px: 1,
    minWidth: 'auto',
    '&:hover': { backgroundColor: colors.border.light },
  }}
>
  一覧に戻る
</Button>
```

### タブナビゲーション

```tsx
<Tabs
  value={activeTab}
  onChange={(_, v) => setActiveTab(v)}
  sx={{
    '& .MuiTabs-indicator': { backgroundColor: colors.primary.main, height: 2 },
    '& .MuiTab-root': {
      textTransform: 'none',
      fontSize: fontSizes.md,
      fontWeight: 500,
      color: colors.text.muted,
      minWidth: 'auto',
      px: 2,
      py: 1.5,
      '&.Mui-selected': { color: colors.primary.main, fontWeight: 600 },
    },
  }}
>
  <Tab label="タブ1" />
  <Tab label={`タブ2 (${count})`} />
</Tabs>
```

### フローティングボタン

```tsx
<Fab
  size="small"
  onClick={onAction}
  sx={{
    position: 'fixed',
    bottom: 24,
    right: 24,
    backgroundColor: colors.primary.main,
    color: 'white',
    '&:hover': { backgroundColor: colors.primary.dark },
  }}
>
  <ActionIcon />
</Fab>
```

## 7. レイアウトパターン

### Flexboxレイアウト

```tsx
// 横並び（中央揃え）
<Box sx={{ display: 'flex', alignItems: 'center', gap: 1-2 }}>

// 横並び（両端揃え）
<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

// 縦並び
<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
```

### グリッドレイアウト

```tsx
// 2カラム（レスポンシブ）
<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2-3 }}>

// 3カラム（レスポンシブ）
<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>

// 比率指定
<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr' }, gap: 3 }}>
```

## 8. 空状態・エラー状態

### 空状態

```tsx
<Box sx={{ p: 4, textAlign: 'center', color: colors.text.muted }}>
  該当するデータがありません
</Box>
```

### Not Found

```tsx
function NotFoundView({ message, backLabel, onBack }) {
  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Alert severity="error" sx={{ mb: 3 }}>{message}</Alert>
      <Button startIcon={<ArrowBackIcon />} onClick={onBack}>{backLabel}</Button>
    </Box>
  );
}
```

## 9. コンポーネント設計原則

### Props設計

```tsx
interface ComponentProps {
  // 必須props
  data: DataType;
  onClick: () => void;

  // オプションprops（デフォルト値あり）
  variant?: 'default' | 'compact';
  showIcon?: boolean;

  // スタイル拡張
  sx?: SxProps;

  // 子要素
  children?: React.ReactNode;
}
```

### コンポーネントの分離基準

1. **再利用性**: 2箇所以上で使う → 共通化
2. **複雑性**: 50行以上 → 分割を検討
3. **関心の分離**: 異なる責務 → 別コンポーネント

### ローカルコンポーネント

ページ内でのみ使用する小さなコンポーネントは、同一ファイル内に定義。

```tsx
// ページコンポーネントの下に定義
function ItemCard({ item, onClick }) { /* ... */ }
function InfoRow({ label, value }) { /* ... */ }

export default function SomePage() {
  return (
    <Box>
      {items.map(item => <ItemCard key={item.id} item={item} />)}
    </Box>
  );
}
```
