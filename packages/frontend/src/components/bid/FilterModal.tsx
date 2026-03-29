import { useState, useEffect, useMemo } from 'react';
import {
  Close as CloseIcon,
  FilterAlt as FilterIcon,
  CheckCircle as CheckCircleIcon,
  Star as StarIcon,
  Description as DescriptionIcon,
  AccountBalance as OrdererIcon,
  Autorenew as WorkStatusIcon,
  Gavel as BidTypeIcon,
} from '@mui/icons-material';
import type { GridFilterModel } from '@mui/x-data-grid';
import { organizationGroups, organizationGroupsByRegion } from '../../constants/organizations';
import { evaluationStatusConfig } from '../../constants/status';
import { workStatusConfig } from '../../constants/workStatus';
import { bidTypeConfig, bidTypes } from '../../constants/bidType';
import { priorityLabels, priorityColors } from '../../constants/priority';
import {
  DEFAULT_COLUMN_FILTERS,
  FILTER_OPERATOR_OPTIONS,
  type ColumnFilterItem,
  type GridFilterOperator,
} from '../../constants/datagrid';
import type { EvaluationStatus, CompanyPriority, WorkStatus, FilterState } from '../../types';
import { FilterOptionButton } from '../common/FilterOptionButton';
import { SelectAllButton } from '../common/SelectAllButton';
import { fontSizes, iconStyles, borderRadius, colors } from '../../constants/styles';
import { CompanyBranchSelect } from './CompanyBranchSelect';

// 優先順位の選択肢
const priorities: CompanyPriority[] = [1, 2, 3, 4, 5];


interface FilterModalProps {
  filters: FilterState;
  gridFilterModel: GridFilterModel;
  onApply: (filters: FilterState) => void;
  onGridFilterApply: (model: GridFilterModel) => void;
  onClose: () => void;
  statusCounts?: Record<EvaluationStatus, number>;
  categorySegmentOptions: string[];
  categoryDetailOptions: string[];
  categoryHierarchy: Record<string, readonly string[]>;
}

export function FilterModal({
  filters,
  gridFilterModel,
  onApply,
  onGridFilterApply,
  onClose,
  statusCounts,
  categorySegmentOptions,
  categoryDetailOptions,
  categoryHierarchy,
}: FilterModalProps) {
  const [activeTab, setActiveTab] = useState<'preset' | 'column'>('preset');
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

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
    // 列フィルターを構築
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
    setLocalFilters({
      statuses: [],
      workStatuses: [],
      priorities: [],
      categories: [],
      categorySegments: [],
      categoryDetails: [],
      bidTypes: [],
      organizations: [],
      prefectures: [],
      companyBranches: [],
      companyBranchLabel: null,
    });
    setColumnFilters({ ...DEFAULT_COLUMN_FILTERS });
  };

  // ステータス
  const allStatuses: EvaluationStatus[] = ['all_met', 'other_only_unmet', 'unmet'];
  const toggleStatus = (status: EvaluationStatus) => {
    setLocalFilters(prev => ({
      ...prev,
      statuses: prev.statuses.includes(status) ? prev.statuses.filter(s => s !== status) : [...prev.statuses, status],
    }));
  };
  const toggleAllStatuses = () => {
    setLocalFilters(prev => ({ ...prev, statuses: prev.statuses.length === allStatuses.length ? [] : [...allStatuses] }));
  };
  const statusSelectionState = (): 'all' | 'partial' | 'none' => {
    if (localFilters.statuses.length === 0) return 'none';
    if (localFilters.statuses.length === allStatuses.length) return 'all';
    return 'partial';
  };

  // 優先順位
  const togglePriority = (priority: CompanyPriority) => {
    setLocalFilters(prev => ({
      ...prev,
      priorities: prev.priorities.includes(priority) ? prev.priorities.filter(p => p !== priority) : [...prev.priorities, priority],
    }));
  };
  const toggleAllPriorities = () => {
    setLocalFilters(prev => ({ ...prev, priorities: prev.priorities.length === priorities.length ? [] : [...priorities] }));
  };
  const prioritySelectionState = (): 'all' | 'partial' | 'none' => {
    if (localFilters.priorities.length === 0) return 'none';
    if (localFilters.priorities.length === priorities.length) return 'all';
    return 'partial';
  };

  // 着手状況
  const allWorkStatuses: WorkStatus[] = ['not_started', 'in_progress', 'completed'];
  const toggleWorkStatus = (status: WorkStatus) => {
    setLocalFilters(prev => ({
      ...prev,
      workStatuses: prev.workStatuses.includes(status) ? prev.workStatuses.filter(s => s !== status) : [...prev.workStatuses, status],
    }));
  };
  const toggleAllWorkStatuses = () => {
    setLocalFilters(prev => ({ ...prev, workStatuses: prev.workStatuses.length === allWorkStatuses.length ? [] : [...allWorkStatuses] }));
  };
  const workStatusSelectionState = (): 'all' | 'partial' | 'none' => {
    if (localFilters.workStatuses.length === 0) return 'none';
    if (localFilters.workStatuses.length === allWorkStatuses.length) return 'all';
    return 'partial';
  };

  // カテゴリ区分
  const toggleCategorySegment = (segment: string) => {
    setLocalFilters(prev => ({
      ...prev,
      categorySegments: prev.categorySegments.includes(segment)
        ? prev.categorySegments.filter(s => s !== segment)
        : [...prev.categorySegments, segment],
    }));
  };
  const toggleAllCategorySegments = () => {
    setLocalFilters(prev => ({
      ...prev,
      categorySegments: prev.categorySegments.length === categorySegmentOptions.length ? [] : [...categorySegmentOptions],
    }));
  };
  const categorySegmentSelectionState = (): 'all' | 'partial' | 'none' => {
    if (localFilters.categorySegments.length === 0) return 'none';
    if (localFilters.categorySegments.length === categorySegmentOptions.length) return 'all';
    return 'partial';
  };

  // カテゴリ詳細
  const toggleCategoryDetail = (detail: string) => {
    setLocalFilters(prev => {
      const exists = prev.categoryDetails.includes(detail);
      const nextDetails = exists
        ? prev.categoryDetails.filter(d => d !== detail)
        : [...prev.categoryDetails, detail];
      return {
        ...prev,
        categories: nextDetails,
        categoryDetails: nextDetails,
      };
    });
  };
  const toggleAllCategoryDetails = () => {
    setLocalFilters(prev => {
      const isAllSelected = prev.categoryDetails.length === categoryDetailOptions.length;
      const nextDetails = isAllSelected ? [] : [...categoryDetailOptions];
      return {
        ...prev,
        categories: nextDetails,
        categoryDetails: nextDetails,
      };
    });
  };
  const categoryDetailSelectionState = (): 'all' | 'partial' | 'none' => {
    if (localFilters.categoryDetails.length === 0) return 'none';
    if (localFilters.categoryDetails.length === categoryDetailOptions.length) return 'all';
    return 'partial';
  };

  // 入札方式
  const toggleBidType = (bidType: string) => {
    setLocalFilters(prev => ({
      ...prev,
      bidTypes: prev.bidTypes.includes(bidType) ? prev.bidTypes.filter(b => b !== bidType) : [...prev.bidTypes, bidType],
    }));
  };
  const toggleAllBidTypes = () => {
    setLocalFilters(prev => ({ ...prev, bidTypes: prev.bidTypes.length === bidTypes.length ? [] : [...bidTypes] }));
  };
  const bidTypeSelectionState = (): 'all' | 'partial' | 'none' => {
    if (localFilters.bidTypes.length === 0) return 'none';
    if (localFilters.bidTypes.length === bidTypes.length) return 'all';
    return 'partial';
  };

  // 発注機関
  const toggleOrganization = (org: string) => {
    setLocalFilters(prev => ({
      ...prev,
      organizations: prev.organizations.includes(org) ? prev.organizations.filter(o => o !== org) : [...prev.organizations, org],
    }));
  };
  const toggleAllOrganizations = () => {
    setLocalFilters(prev => ({ ...prev, organizations: prev.organizations.length === organizationGroups.length ? [] : [...organizationGroups] }));
  };
  const organizationSelectionState = (): 'all' | 'partial' | 'none' => {
    if (localFilters.organizations.length === 0) return 'none';
    if (localFilters.organizations.length === organizationGroups.length) return 'all';
    return 'partial';
  };

  // 地域グループ一括トグル
  const toggleRegion = (regionItems: string[]) => {
    setLocalFilters(prev => {
      const allSelected = regionItems.every(item => prev.organizations.includes(item));
      if (allSelected) {
        return { ...prev, organizations: prev.organizations.filter(o => !regionItems.includes(o)) };
      } else {
        const newOrgs = new Set([...prev.organizations, ...regionItems]);
        return { ...prev, organizations: Array.from(newOrgs) };
      }
    });
  };
  const getRegionSelectionState = (regionItems: string[]): 'all' | 'partial' | 'none' => {
    const selectedCount = regionItems.filter(item => localFilters.organizations.includes(item)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === regionItems.length) return 'all';
    return 'partial';
  };

  const categoryDetailCount = localFilters.categoryDetails.length > 0
    ? localFilters.categoryDetails.length
    : localFilters.categories.length;

  const companyFilterCount = localFilters.companyBranches.length > 0 ? 1 : 0;

  const activeFilterCount =
    localFilters.statuses.length +
    localFilters.workStatuses.length +
    localFilters.priorities.length +
    localFilters.categorySegments.length +
    categoryDetailCount +
    localFilters.bidTypes.length +
    localFilters.organizations.length +
    companyFilterCount;
  const columnFilterCount = Object.values(columnFilters).filter(f => f.value || f.operator === 'isEmpty' || f.operator === 'isNotEmpty').length;
  const totalFilterCount = activeFilterCount + columnFilterCount;
  const selectedCompanyBranch = localFilters.companyBranches.length > 0 ? localFilters.companyBranches[0] : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', width: '90%', maxWidth: 500, maxHeight: '80vh', backgroundColor: colors.background.paper, borderRadius: borderRadius.xs, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
              background: activeTab === 'preset' ? colors.background.paper : colors.background.hover,
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
              background: activeTab === 'column' ? colors.background.paper : colors.background.hover,
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
              <div style={{ marginBottom: '24px' }}>
                <CompanyBranchSelect
                  value={selectedCompanyBranch}
                  valueLabel={localFilters.companyBranchLabel || undefined}
                  onChange={(officeId, label) => {
                    if (!officeId) {
                      setLocalFilters((prev) => ({
                        ...prev,
                        companyBranches: [],
                        companyBranchLabel: null,
                      }));
                    } else {
                      setLocalFilters((prev) => ({
                        ...prev,
                        companyBranches: [officeId],
                        companyBranchLabel: label ?? null,
                      }));
                    }
                  }}
                  helperText="企業・拠点を1件選択して一覧を絞り込みます。"
                />
                {selectedCompanyBranch && (
                  <button
                    onClick={() =>
                      setLocalFilters((prev) => ({
                        ...prev,
                        companyBranches: [],
                        companyBranchLabel: null,
                      }))
                    }
                    style={{
                      marginTop: '8px',
                      background: 'none',
                      border: 'none',
                      color: colors.accent.red,
                      fontSize: fontSizes.xs,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    選択解除
                  </button>
                )}
              </div>

              {/* ステータス */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircleIcon style={{ ...iconStyles.medium, color: colors.text.muted }} />
                    <span style={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.secondary }}>参加可否</span>
                  </div>
                  <SelectAllButton state={statusSelectionState()} count={localFilters.statuses.length} total={allStatuses.length} onClick={toggleAllStatuses} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(Object.keys(evaluationStatusConfig) as EvaluationStatus[]).map((status) => {
                    const config = evaluationStatusConfig[status];
                    const StatusIcon = config.icon;
                    const count = statusCounts?.[status] ?? 0;
                    return (
                      <FilterOptionButton
                        key={status}
                        label={`${config.label} (${count})`}
                        selected={localFilters.statuses.includes(status)}
                        onClick={() => toggleStatus(status)}
                        icon={<StatusIcon style={iconStyles.small} />}
                        color={config.color}
                        bgColor={config.bgColor}
                      />
                    );
                  })}
                </div>
              </div>

              {/* 優先順位 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <StarIcon style={{ ...iconStyles.medium, color: colors.text.muted }} />
                    <span style={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.secondary }}>優先順位</span>
                  </div>
                  <SelectAllButton state={prioritySelectionState()} count={localFilters.priorities.length} total={priorities.length} onClick={toggleAllPriorities} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {priorities.map((priority) => {
                    const pConfig = priorityColors[priority];
                    return (
                      <FilterOptionButton
                        key={priority}
                        label={priorityLabels[priority]}
                        selected={localFilters.priorities.includes(priority)}
                        onClick={() => togglePriority(priority)}
                        icon={<StarIcon style={iconStyles.small} />}
                        color={pConfig.color}
                        bgColor={pConfig.bgColor}
                      />
                    );
                  })}
                </div>
              </div>

              {/* 着手状況 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <WorkStatusIcon style={{ ...iconStyles.medium, color: colors.text.muted }} />
                    <span style={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.secondary }}>着手状況</span>
                  </div>
                  <SelectAllButton state={workStatusSelectionState()} count={localFilters.workStatuses.length} total={allWorkStatuses.length} onClick={toggleAllWorkStatuses} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {allWorkStatuses.map((status) => {
                    const config = workStatusConfig[status];
                    const WorkIcon = config.icon;
                    return (
                      <FilterOptionButton
                        key={status}
                        label={config.label}
                        selected={localFilters.workStatuses.includes(status)}
                        onClick={() => toggleWorkStatus(status)}
                        icon={<WorkIcon style={iconStyles.small} />}
                        color={config.color}
                        bgColor={config.bgColor}
                      />
                    );
                  })}
                </div>
              </div>

              {/* 入札方式 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BidTypeIcon style={{ ...iconStyles.medium, color: colors.text.muted }} />
                    <span style={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.secondary }}>入札方式</span>
                  </div>
                  <SelectAllButton state={bidTypeSelectionState()} count={localFilters.bidTypes.length} total={bidTypes.length} onClick={toggleAllBidTypes} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {bidTypes.map((bidType) => {
                    const config = bidTypeConfig[bidType];
                    return (
                      <FilterOptionButton
                        key={bidType}
                        label={config.label}
                        selected={localFilters.bidTypes.includes(bidType)}
                        onClick={() => toggleBidType(bidType)}
                        color={config.color}
                        bgColor={config.bgColor}
                      />
                    );
                  })}
                </div>
              </div>

              {/* カテゴリ区分 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <DescriptionIcon style={{ ...iconStyles.medium, color: colors.text.muted }} />
                    <span style={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.secondary }}>カテゴリ区分</span>
                  </div>
                  <SelectAllButton
                    state={categorySegmentSelectionState()}
                    count={localFilters.categorySegments.length}
                    total={categorySegmentOptions.length}
                    onClick={toggleAllCategorySegments}
                  />
                </div>
                {categorySegmentOptions.length === 0 ? (
                  <div style={{ fontSize: fontSizes.xs, color: colors.text.muted }}>利用可能なカテゴリ区分がありません</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {categorySegmentOptions.map((segment) => (
                      <FilterOptionButton
                        key={segment}
                        label={segment}
                        selected={localFilters.categorySegments.includes(segment)}
                        onClick={() => toggleCategorySegment(segment)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* カテゴリ詳細 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <DescriptionIcon style={{ ...iconStyles.medium, color: colors.text.muted }} />
                    <span style={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.secondary }}>カテゴリ詳細</span>
                  </div>
                  <SelectAllButton
                    state={categoryDetailSelectionState()}
                    count={localFilters.categoryDetails.length}
                    total={categoryDetailOptions.length}
                    onClick={toggleAllCategoryDetails}
                  />
                </div>
                {categoryDetailOptions.length === 0 || categorySegmentOptions.length === 0 ? (
                  <div style={{ fontSize: fontSizes.xs, color: colors.text.muted }}>利用可能なカテゴリ詳細がありません</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {categorySegmentOptions.every((segment) => (categoryHierarchy[segment]?.length ?? 0) === 0) && (
                      <div style={{ fontSize: fontSizes.xs, color: colors.text.muted }}>利用可能なカテゴリ詳細がありません</div>
                    )}
                    {categorySegmentOptions.map((segment) => {
                      const details = categoryHierarchy[segment] || [];
                      if (!details.length) {
                        return null;
                      }
                      const selectedCount = details.filter((detail) => localFilters.categoryDetails.includes(detail)).length;
                      return (
                        <div key={segment}>
                          <div style={{ fontWeight: 600, fontSize: fontSizes.sm, color: colors.text.secondary, marginBottom: '8px' }}>
                            {segment}
                            <span style={{ marginLeft: '8px', fontSize: fontSizes.xs, color: colors.text.muted }}>
                              ({selectedCount}/{details.length})
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {details.map((detail) => (
                              <FilterOptionButton
                                key={`${segment}-${detail}`}
                                label={detail}
                                selected={localFilters.categoryDetails.includes(detail)}
                                onClick={() => toggleCategoryDetail(detail)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 発注機関 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <OrdererIcon style={{ ...iconStyles.medium, color: colors.text.muted }} />
                    <span style={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.secondary }}>発注機関</span>
                  </div>
                  <SelectAllButton state={organizationSelectionState()} count={localFilters.organizations.length} total={organizationGroups.length} onClick={toggleAllOrganizations} />
                </div>
                {organizationGroupsByRegion.map((group) => {
                  const selectionState = getRegionSelectionState(group.items);
                  const selectedCount = group.items.filter(item => localFilters.organizations.includes(item)).length;
                  return (
                    <div key={group.region} style={{ marginBottom: '16px' }}>
                      <label
                        onClick={() => toggleRegion(group.items)}
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
                            border: selectionState === 'none' ? `2px solid ${colors.border.dark}` : `2px solid ${colors.accent.blue}`,
                            background: selectionState === 'all' ? colors.accent.blue : selectionState === 'partial' ? colors.accent.blue : colors.text.white,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            color: colors.text.white,
                            fontWeight: 700,
                          }}
                        >
                          {selectionState === 'all' && '✓'}
                          {selectionState === 'partial' && '−'}
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
            </>
          ) : (
            /* 列フィルタータブ */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: fontSizes.sm, color: colors.text.muted, marginBottom: '4px' }}>
                各列の値を検索条件で絞り込みます
              </div>
              {[
                { field: 'title', label: '公告名', placeholder: '公告名で検索...' },
                { field: 'company', label: '企業名', placeholder: '企業名で検索...' },
                { field: 'organization', label: '発注機関', placeholder: '発注機関で検索...' },
                { field: 'category', label: 'カテゴリ', placeholder: 'カテゴリで検索...' },
                { field: 'deadline', label: '締切日', placeholder: '例: 2025-01' },
                { field: 'evaluatedAt', label: '判定日', placeholder: '例: 2025-01' },
              ].map(({ field, label, placeholder }) => (
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
                        backgroundColor: (columnFilters[field].operator === 'isEmpty' || columnFilters[field].operator === 'isNotEmpty') ? colors.background.default : colors.background.paper,
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
