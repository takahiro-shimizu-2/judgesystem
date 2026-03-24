export const WORKFLOW_STEP_IDS = {
  JUDGMENT: 'judgment',
  ORDERER: 'orderer',
  PARTNER: 'partner',
  REQUEST: 'request',
  AWARD: 'award',
} as const;

export type WorkflowStepId = (typeof WORKFLOW_STEP_IDS)[keyof typeof WORKFLOW_STEP_IDS];

export const WORKFLOW_STEP_CONFIG = [
  { id: WORKFLOW_STEP_IDS.JUDGMENT, label: '判定結果', shortLabel: '判定', subLabel: '' },
  { id: WORKFLOW_STEP_IDS.ORDERER, label: '発注者', shortLabel: '発注者', subLabel: '確認・架電・事前提出資料' },
  { id: WORKFLOW_STEP_IDS.PARTNER, label: '協力会社', shortLabel: '協力', subLabel: '候補リスト・資料管理' },
  { id: WORKFLOW_STEP_IDS.REQUEST, label: '確認依頼', shortLabel: '確認依頼', subLabel: '見積書・入札書・結果報告' },
  { id: WORKFLOW_STEP_IDS.AWARD, label: '落札情報', shortLabel: '落札', subLabel: '落札結果・参加企業' },
] as const;
