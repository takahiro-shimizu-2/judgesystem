/**
 * ワークフローステップID
 */
export const WORKFLOW_STEP_IDS = {
  JUDGMENT: 'judgment',
  ORDERER: 'orderer',
  PARTNER: 'partner',
  REQUEST: 'request',
  AWARD: 'award',
} as const;

export type WorkflowStepId = (typeof WORKFLOW_STEP_IDS)[keyof typeof WORKFLOW_STEP_IDS];

/**
 * ワークフローステップ定義（アイコンなし）
 * アイコンはコンポーネント側で付与する
 */
export const WORKFLOW_STEP_CONFIG = [
  { id: WORKFLOW_STEP_IDS.JUDGMENT, label: '判定結果', shortLabel: '判定', subLabel: '' },
  { id: WORKFLOW_STEP_IDS.ORDERER, label: '発注者', shortLabel: '発注者', subLabel: '確認・架電・事前提出資料' },
  { id: WORKFLOW_STEP_IDS.PARTNER, label: '協力会社', shortLabel: '協力', subLabel: '候補リスト・資料管理' },
  { id: WORKFLOW_STEP_IDS.REQUEST, label: '確認依頼', shortLabel: '確認依頼', subLabel: '見積書・入札書・結果報告' },
  { id: WORKFLOW_STEP_IDS.AWARD, label: '落札情報', shortLabel: '落札', subLabel: '落札結果・参加企業' },
] as const;

/**
 * サイドバーパネルのスタイル設定
 */
export const PANEL_STYLES = {
  bidInfo: {
    iconGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    backgroundColor: 'rgba(59,130,246,0.03)',
    hoverColor: 'rgba(59,130,246,0.06)',
  },
  orderer: {
    iconGradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    backgroundColor: 'rgba(139,92,246,0.03)',
    hoverColor: 'rgba(139,92,246,0.06)',
  },
  company: {
    iconGradient: 'linear-gradient(135deg, #1e3a5f 0%, #334155 100%)',
    backgroundColor: 'rgba(30,58,95,0.03)',
    hoverColor: 'rgba(30,58,95,0.06)',
  },
  estimate: {
    iconGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    backgroundColor: 'rgba(16,185,129,0.03)',
    hoverColor: 'rgba(16,185,129,0.06)',
  },
} as const;

/**
 * サイドバーの幅設定
 */
export const SIDEBAR_WIDTH = {
  left: 340,
  right: 300,
} as const;
