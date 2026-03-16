/**
 * DataGrid日本語ローカライゼーション
 */
export const jaJPLocaleText = {
  // 列メニュー
  columnMenuSortAsc: '昇順でソート',
  columnMenuSortDesc: '降順でソート',
  columnMenuFilter: 'フィルター',
  columnMenuUnsort: 'ソート解除',
  // フィルター
  filterPanelAddFilter: 'フィルターを追加',
  filterPanelDeleteIconLabel: '削除',
  filterPanelOperator: '演算子',
  filterPanelOperatorAnd: 'かつ',
  filterPanelOperatorOr: 'または',
  filterPanelColumns: '列',
  filterPanelInputLabel: '値',
  filterPanelInputPlaceholder: 'フィルター値',
  filterOperatorContains: '含む',
  filterOperatorDoesNotContain: '含まない',
  filterOperatorEquals: '等しい',
  filterOperatorDoesNotEqual: '等しくない',
  filterOperatorStartsWith: '始まる',
  filterOperatorEndsWith: '終わる',
  filterOperatorIsEmpty: '空',
  filterOperatorIsNotEmpty: '空でない',
  filterOperatorIsAnyOf: 'いずれか',
  // ツールバー
  toolbarColumns: '列の管理',
  toolbarColumnsLabel: '列を選択',
  toolbarFilters: '列フィルター',
  toolbarFiltersLabel: 'フィルターを表示',
  toolbarFiltersTooltipHide: 'フィルターを非表示',
  toolbarFiltersTooltipShow: 'フィルターを表示',
  toolbarFiltersTooltipActive: (count: number) => `${count}件のフィルター`,
  // 列パネル
  columnsPanelTextFieldLabel: '列を検索',
  columnsPanelTextFieldPlaceholder: '列タイトル',
  columnsPanelShowAllButton: 'すべて表示',
  columnsPanelHideAllButton: 'すべて非表示',
  // その他
  noRowsLabel: 'データがありません',
  noResultsOverlayLabel: '結果が見つかりません',
  footerRowSelected: (count: number) => `${count}行選択中`,
  MuiTablePagination: {
    labelRowsPerPage: '行数:',
    labelDisplayedRows: ({ from, to, count }: { from: number; to: number; count: number }) =>
      `${from}–${to} / ${count !== -1 ? count : `${to}以上`}`,
  },
};
