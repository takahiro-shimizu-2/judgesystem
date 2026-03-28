/**
 * 発注者一覧用フィルターモーダル
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Close as CloseIcon,
  FilterAlt as FilterIcon,
  Category as CategoryIcon,
  Place as PlaceIcon,
  AccountBalance as OrganizationIcon,
} from '@mui/icons-material';
import type { GridFilterModel } from '@mui/x-data-grid';
import { ordererCategoryConfig } from '../../data';
import {
  FILTER_OPERATOR_OPTIONS,
  type ColumnFilterItem,
  type GridFilterOperator,
} from '../../constants/datagrid';
import type { OrdererCategory } from '../../types/orderer';
import { getAvailableRegionGroups } from '../../constants/prefectures';
import { organizationGroupsByRegion } from '../../constants/organizations';
import { FilterOptionButton, SelectAllButton } from '../common';
import { fontSizes, iconStyles, borderRadius, colors } from '../../constants/styles';

// フィルター状態の型
export interface OrdererFilterState {
  categories: OrdererCategory[];
  prefectures: string[];
  organizations: string[];
}

// 列フィルターのデフォルト設定
const DEFAULT_COLUMN_FILTERS: Record<string, ColumnFilterItem> = {
  name: { value: '', operator: 'contains' },
  announcementCount: { value: '', operator: 'contains' },
  lastAnnouncementDate: { value: '', operator: 'contains' },
};

// 列フィールドのラベル
const COLUMN_LABELS: Record<string, { label: string; placeholder: string }> = {
  name: { label: '機関名', placeholder: '機関名で検索...' },
  announcementCount: { label: '公告数', placeholder: '公告数で検索...' },
  lastAnnouncementDate: { label: '最終公告日', placeholder: '例: 2025-01' },
};

interface OrdererFilterModalProps {
  filters: OrdererFilterState;
  gridFilterModel: GridFilterModel;
  prefectures: string[];
  onApply: (filters: OrdererFilterState) => void;
  onGridFilterApply: (model: GridFilterModel) => void;
  onClose: () => void;
}

export function OrdererFilterModal({
  filters,
  gridFilterModel,
  prefectures,
  onApply,
  onGridFilterApply,
  onClose,
}: OrdererFilterModalProps) {
  const [activeTab, setActiveTab] = useState<'preset' | 'column'>('preset');
  const [localFilters, setLocalFilters] = useState<OrdererFilterState>(filters);
  const initialColumnFilters = useMemo(() => {
    const newColumnFilters = { ...DEFAULT_COLUMN_FILTERS };
    gridFilterModel.items.forEach(item => {
      if (item.field in newColumnFilters) {
        newColumnFilters[item.field] = {
          value: item.value || '',
          operator: (item.operator as GridFilterOperator) || 'contains',
        };
      }
    });
    return newColumnFilters;
  }, [gridFilterModel]);
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterItem>>(initialColumnFilters);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleApply = () => {
    onApply(localFilters);
    const items: GridFilterModel['items'] = [];
    Object.entries(columnFilters).forEach(([field, filter]) => {
      if (filter.operator === 'isEmpty' || filter.operator === 'isNotEmpty' || filter.value) {
        items.push({ field, operator: filter.operator, value: filter.value });
      }
    });
    onGridFilterApply({ items });
    onClose();
  };

  const handleReset = () => {
    setLocalFilters({ categories: [], prefectures: [], organizations: [] });
    setColumnFilters({ ...DEFAULT_COLUMN_FILTERS });
  };

  // 種別
  const allCategories = Object.keys(ordererCategoryConfig) as OrdererCategory[];
  const toggleCategory = (category: OrdererCategory) => {
    setLocalFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(category) ? prev.categories.filter(c => c !== category) : [...prev.categories, category],
    }));
  };
  const toggleAllCategories = () => {
    setLocalFilters(prev => ({ ...prev, categories: prev.categories.length === allCategories.length ? [] : [...allCategories] }));
  };
  const categorySelectionState = (): 'all' | 'partial' | 'none' => {
    if (localFilters.categories.length === 0) return 'none';
    if (localFilters.categories.length === allCategories.length) return 'all';
    return 'partial';
  };

  // 都道府県
  const regionGroups = getAvailableRegionGroups(prefectures);
  const togglePrefecture = (prefecture: string) => {
    setLocalFilters(prev => ({
      ...prev,
      prefectures: prev.prefectures.includes(prefecture) ? prev.prefectures.filter(p => p !== prefecture) : [...prev.prefectures, prefecture],
    }));
  };
  const toggleAllPrefectures = () => {
    setLocalFilters(prev => ({ ...prev, prefectures: prev.prefectures.length === prefectures.length ? [] : [...prefectures] }));
  };
  const toggleRegion = (regionPrefectures: readonly string[]) => {
    const availableInRegion = regionPrefectures.filter(p => prefectures.includes(p));
    const allSelected = availableInRegion.every(p => localFilters.prefectures.includes(p));
    setLocalFilters(prev => ({
      ...prev,
      prefectures: allSelected
        ? prev.prefectures.filter(p => !availableInRegion.includes(p))
        : [...new Set([...prev.prefectures, ...availableInRegion])],
    }));
  };
  const getRegionSelectionState = (regionPrefectures: readonly string[]): 'all' | 'partial' | 'none' => {
    const availableInRegion = regionPrefectures.filter(p => prefectures.includes(p));
    const selectedCount = availableInRegion.filter(p => localFilters.prefectures.includes(p)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === availableInRegion.length) return 'all';
    return 'partial';
  };
  const prefectureSelectionState = (): 'all' | 'partial' | 'none' => {
    if (localFilters.prefectures.length === 0) return 'none';
    if (localFilters.prefectures.length === prefectures.length) return 'all';
    return 'partial';
  };

  // 発注機関
  const toggleOrganization = (org: string) => {
    setLocalFilters(prev => ({
      ...prev,
      organizations: prev.organizations.includes(org) ? prev.organizations.filter(o => o !== org) : [...prev.organizations, org],
    }));
  };
  const allOrganizations = organizationGroupsByRegion.flatMap(g => g.items);
  const toggleAllOrganizations = () => {
    setLocalFilters(prev => ({ ...prev, organizations: prev.organizations.length === allOrganizations.length ? [] : [...allOrganizations] }));
  };
  const toggleOrgRegion = (regionItems: string[]) => {
    const allSelected = regionItems.every(item => localFilters.organizations.includes(item));
    setLocalFilters(prev => ({
      ...prev,
      organizations: allSelected
        ? prev.organizations.filter(o => !regionItems.includes(o))
        : [...new Set([...prev.organizations, ...regionItems])],
    }));
  };
  const getOrgRegionSelectionState = (regionItems: string[]): 'all' | 'partial' | 'none' => {
    const selectedCount = regionItems.filter(item => localFilters.organizations.includes(item)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === regionItems.length) return 'all';
    return 'partial';
  };
  const organizationSelectionState = (): 'all' | 'partial' | 'none' => {
    if (localFilters.organizations.length === 0) return 'none';
    if (localFilters.organizations.length === allOrganizations.length) return 'all';
    return 'partial';
  };

  const activeFilterCount = localFilters.categories.length + localFilters.prefectures.length + localFilters.organizations.length;
  const columnFilterCount = Object.values(columnFilters).filter(f => f.value || f.operator === 'isEmpty' || f.operator === 'isNotEmpty').length;
  const totalFilterCount = activeFilterCount + columnFilterCount;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', width: '90%', maxWidth: 500, maxHeight: '80vh', backgroundColor: colors.text.white, borderRadius: borderRadius.xs, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${colors.border.main}`, background: `linear-gradient(135deg, ${colors.primary.main} 0%, ${colors.primary.dark} 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FilterIcon style={{ color: colors.text.white, ...iconStyles.large }} />
            <span style={{ fontWeight: 700, fontSize: fontSizes.lg, color: colors.text.white }}>フィルター</span>
            {totalFilterCount > 0 && (
              <span style={{ padding: '2px 8px', borderRadius: borderRadius.lg, fontSize: fontSizes.xs, fontWeight: 600, background: colors.accent.orange, color: colors.text.white }}>{totalFilterCount}</span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: borderRadius.xs, padding: '8px', cursor: 'pointer', display: 'flex' }}>
            <CloseIcon style={{ color: colors.text.white, ...iconStyles.medium }} />
          </button>
        </div>

        {/* タブ */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border.main}` }}>
          <button
            onClick={() => setActiveTab('preset')}
            style={{
              flex: 1, padding: '12px', border: 'none', cursor: 'pointer',
              background: activeTab === 'preset' ? colors.text.white : colors.background.hover,
              color: activeTab === 'preset' ? colors.primary.main : colors.text.muted,
              fontWeight: activeTab === 'preset' ? 600 : 500,
              borderBottom: activeTab === 'preset' ? `2px solid ${colors.primary.main}` : '2px solid transparent',
            }}
          >
            一括フィルター {activeFilterCount > 0 && <span style={{ marginLeft: 4, padding: '2px 6px', borderRadius: borderRadius.xs, fontSize: fontSizes.xs, background: colors.primary.main, color: colors.text.white }}>{activeFilterCount}</span>}
          </button>
          <button
            onClick={() => setActiveTab('column')}
            style={{
              flex: 1, padding: '12px', border: 'none', cursor: 'pointer',
              background: activeTab === 'column' ? colors.text.white : colors.background.hover,
              color: activeTab === 'column' ? colors.primary.main : colors.text.muted,
              fontWeight: activeTab === 'column' ? 600 : 500,
              borderBottom: activeTab === 'column' ? `2px solid ${colors.primary.main}` : '2px solid transparent',
            }}
          >
            列フィルター {columnFilterCount > 0 && <span style={{ marginLeft: 4, padding: '2px 6px', borderRadius: borderRadius.xs, fontSize: fontSizes.xs, background: colors.primary.main, color: colors.text.white }}>{columnFilterCount}</span>}
          </button>
        </div>

        {/* フィルター内容 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {activeTab === 'preset' ? (
            <>
              {/* 種別 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CategoryIcon style={{ ...iconStyles.medium, color: colors.text.muted }} />
                    <span style={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.secondary }}>種別</span>
                  </div>
                  <SelectAllButton state={categorySelectionState()} count={localFilters.categories.length} total={allCategories.length} onClick={toggleAllCategories} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {allCategories.map((category) => {
                    const config = ordererCategoryConfig[category];
                    return (
                      <FilterOptionButton
                        key={category}
                        label={config.label}
                        selected={localFilters.categories.includes(category)}
                        onClick={() => toggleCategory(category)}
                        color={config.color}
                        bgColor={config.bgColor}
                      />
                    );
                  })}
                </div>
              </div>

              {/* 発注機関 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <OrganizationIcon style={{ ...iconStyles.medium, color: colors.text.muted }} />
                    <span style={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.secondary }}>発注機関</span>
                  </div>
                  <SelectAllButton state={organizationSelectionState()} count={localFilters.organizations.length} total={allOrganizations.length} onClick={toggleAllOrganizations} />
                </div>
                {organizationGroupsByRegion.map((group) => {
                  const regionState = getOrgRegionSelectionState(group.items);
                  const selectedCount = group.items.filter(item => localFilters.organizations.includes(item)).length;
                  return (
                    <div key={group.region} style={{ marginBottom: '16px' }}>
                      <label
                        onClick={() => toggleOrgRegion(group.items)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '10px',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <span
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '3px',
                            border: regionState === 'none' ? `2px solid ${colors.border.dark}` : `2px solid ${colors.accent.blue}`,
                            background: regionState === 'all' ? colors.accent.blue : regionState === 'partial' ? colors.accent.blue : colors.text.white,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            color: colors.text.white,
                            fontWeight: 700,
                          }}
                        >
                          {regionState === 'all' && '✓'}
                          {regionState === 'partial' && '−'}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: fontSizes.sm, color: colors.primary.main }}>{group.region}</span>
                        <span style={{ fontSize: fontSizes.xs, color: colors.text.muted }}>({selectedCount}/{group.items.length})</span>
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {group.items.map((org) => (
                          <FilterOptionButton key={org} label={org} selected={localFilters.organizations.includes(org)} onClick={() => toggleOrganization(org)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 都道府県 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PlaceIcon style={{ ...iconStyles.medium, color: colors.text.muted }} />
                    <span style={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.secondary }}>都道府県</span>
                  </div>
                  <SelectAllButton state={prefectureSelectionState()} count={localFilters.prefectures.length} total={prefectures.length} onClick={toggleAllPrefectures} />
                </div>
                {regionGroups.map((group) => {
                  const regionState = getRegionSelectionState(group.prefectures);
                  const selectedCount = group.prefectures.filter(p => localFilters.prefectures.includes(p)).length;
                  return (
                    <div key={group.region} style={{ marginBottom: '16px' }}>
                      <label
                        onClick={() => toggleRegion(group.prefectures)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '10px',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <span
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '3px',
                            border: regionState === 'none' ? `2px solid ${colors.border.dark}` : `2px solid ${colors.accent.blue}`,
                            background: regionState === 'all' ? colors.accent.blue : regionState === 'partial' ? colors.accent.blue : colors.text.white,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            color: colors.text.white,
                            fontWeight: 700,
                          }}
                        >
                          {regionState === 'all' && '✓'}
                          {regionState === 'partial' && '−'}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: fontSizes.sm, color: colors.primary.main }}>{group.region}</span>
                        <span style={{ fontSize: fontSizes.xs, color: colors.text.muted }}>({selectedCount}/{group.prefectures.length})</span>
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {group.prefectures.map((pref) => (
                          <FilterOptionButton key={pref} label={pref} selected={localFilters.prefectures.includes(pref)} onClick={() => togglePrefecture(pref)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* 列フィルタータブ */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: fontSizes.sm, color: colors.text.muted, marginBottom: '4px' }}>
                各列の値を検索条件で絞り込みます
              </div>
              {Object.entries(COLUMN_LABELS).map(([field, { label, placeholder }]) => (
                <div key={field}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: fontSizes.sm, color: colors.text.secondary, marginBottom: '6px' }}>{label}</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={columnFilters[field].operator}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, [field]: { ...prev[field], operator: e.target.value as GridFilterOperator } }))}
                      style={{ padding: '10px 8px', borderRadius: borderRadius.xs, border: `1px solid ${colors.border.main}`, fontSize: fontSizes.sm, outline: 'none', backgroundColor: colors.background.hover, minWidth: '90px' }}
                    >
                      {FILTER_OPERATOR_OPTIONS.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={columnFilters[field].value}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, [field]: { ...prev[field], value: e.target.value } }))}
                      placeholder={placeholder}
                      disabled={columnFilters[field].operator === 'isEmpty' || columnFilters[field].operator === 'isNotEmpty'}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: borderRadius.xs, border: `1px solid ${colors.border.main}`, fontSize: fontSizes.md, outline: 'none',
                        backgroundColor: (columnFilters[field].operator === 'isEmpty' || columnFilters[field].operator === 'isNotEmpty') ? colors.background.default : colors.text.white,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        <div style={{ display: 'flex', gap: '12px', padding: '16px 24px', borderTop: `1px solid ${colors.border.main}`, background: colors.background.hover }}>
          <button onClick={handleReset} style={{ flex: 1, padding: '12px', borderRadius: borderRadius.xs, fontSize: fontSizes.md, fontWeight: 600, cursor: 'pointer', border: `1px solid ${colors.border.main}`, background: colors.text.white, color: colors.text.muted }}>リセット</button>
          <button onClick={handleApply} style={{ flex: 2, padding: '12px', borderRadius: borderRadius.xs, fontSize: fontSizes.md, fontWeight: 600, cursor: 'pointer', border: 'none', background: `linear-gradient(135deg, ${colors.primary.main} 0%, ${colors.primary.dark} 100%)`, color: colors.text.white }}>適用する</button>
        </div>
      </div>
    </div>
  );
}
