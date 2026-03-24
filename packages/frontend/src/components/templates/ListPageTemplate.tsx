/**
 * リストページテンプレート
 * 一覧表示ページの共通構造を提供
 *
 * 使用例:
 * ```tsx
 * <ListPageTemplate
 *   title="企業情報一覧"
 *   searchPlaceholder="会社名、住所で検索..."
 *   columns={columns}
 *   rows={rows}
 *   onRowClick={handleRowClick}
 *   searchQuery={searchQuery}
 *   onSearchChange={handleSearchChange}
 *   paginationModel={paginationModel}
 *   onPaginationModelChange={handlePaginationModelChange}
 * />
 * ```
 */
import { Box, Paper, Typography, TextField, InputAdornment } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridRowParams, GridPaginationModel, GridRowHeightParams, GridRowHeightReturnValue } from '@mui/x-data-grid';
import { Search as SearchIcon } from '@mui/icons-material';
import { jaJPLocaleText } from '../../constants/locales';
import { pageStyles, listDataGridStyles } from '../../constants/styles';
import { CustomPagination } from '../bid';

// ============================================================================
// 型定義
// ============================================================================

export interface ListPageTemplateProps<T extends { id: string | number }> {
  /** ページタイトル */
  title: string;
  /** 検索プレースホルダー */
  searchPlaceholder: string;
  /** 現在の検索クエリ */
  searchQuery: string;
  /** 検索変更ハンドラ */
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** DataGridの列定義 */
  columns: GridColDef[];
  /** 表示データ */
  rows: T[];
  /** 行クリックハンドラ */
  onRowClick?: (params: GridRowParams<T>) => void;
  /** ページネーションモデル */
  paginationModel: GridPaginationModel;
  /** ページネーション変更ハンドラ */
  onPaginationModelChange: (model: GridPaginationModel) => void;
  /** DataGridのキー（再レンダリング用） */
  gridKey?: number;
  /** カスタムヘッダー要素（検索フィールドの横に配置） */
  headerExtra?: React.ReactNode;
  /** DataGridの追加スタイル */
  dataGridSx?: object;
  /** ページサイズオプション */
  pageSizeOptions?: number[];
  /** 行の高さを動的に計算する関数 */
  getRowHeight?: (params: GridRowHeightParams) => GridRowHeightReturnValue;
}

// ============================================================================
// コンポーネント
// ============================================================================

export function ListPageTemplate<T extends { id: string | number }>({
  title,
  searchPlaceholder,
  searchQuery,
  onSearchChange,
  columns,
  rows,
  onRowClick,
  paginationModel,
  onPaginationModelChange,
  gridKey,
  headerExtra,
  dataGridSx,
  pageSizeOptions = [25, 50, 100],
  getRowHeight,
}: ListPageTemplateProps<T>) {
  const gridStyles = {
    ...listDataGridStyles,
    ...(onRowClick ? { '& .MuiDataGrid-row': { cursor: 'pointer' } } : {}),
    ...dataGridSx,
  };

  return (
    <Box sx={pageStyles.container}>
      <Box sx={pageStyles.contentArea}>
        <Paper sx={pageStyles.mainCard}>
          {/* ヘッダー */}
          <Box sx={pageStyles.cardHeader}>
            <Typography variant="h5" sx={pageStyles.pageTitle}>
              {title}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={onSearchChange}
                size="small"
                sx={pageStyles.searchField}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={pageStyles.searchIcon} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              {headerExtra}
            </Box>
          </Box>

          {/* DataGrid */}
          <DataGrid
            key={gridKey}
            rows={rows}
            columns={columns}
            localeText={jaJPLocaleText}
            paginationModel={paginationModel}
            onPaginationModelChange={onPaginationModelChange}
            pageSizeOptions={pageSizeOptions}
            disableRowSelectionOnClick
            hideFooter
            onRowClick={onRowClick}
            getRowHeight={getRowHeight}
            sx={gridStyles}
          />

          {/* ページネーション */}
          <CustomPagination
            page={paginationModel.page}
            pageSize={paginationModel.pageSize}
            rowCount={rows.length}
            onPageChange={(page) => onPaginationModelChange({ ...paginationModel, page })}
            onPageSizeChange={(pageSize) => onPaginationModelChange({ page: 0, pageSize })}
          />
        </Paper>
      </Box>
    </Box>
  );
}

export default ListPageTemplate;
