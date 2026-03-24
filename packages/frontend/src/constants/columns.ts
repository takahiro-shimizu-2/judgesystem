/**
 * DataGrid列の共通定義
 */
import type { GridColDef } from '@mui/x-data-grid';

/**
 * No列の共通定義（8桁の数字表示）
 * @param field - フィールド名（デフォルト: 'id'）
 */
export function createNoColumn(field: string = 'id'): GridColDef {
  return {
    field,
    headerName: 'No',
    flex: 0.6,
    minWidth: 75,
    maxWidth: 90,
    valueGetter: (_, row) => {
      const num = String(row[field]).replace(/\D/g, '');
      return num.padStart(8, '0');
    },
  };
}
