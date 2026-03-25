/**
 * 担当者関連の型定義
 */

// 担当者マスター
export interface Staff {
  id: string;
  no: number;
  name: string;           // 氏名
  department: string;     // 部署
  email: string;          // メールアドレス
  phone: string;          // 電話番号
}

// ワークフローステップへの担当者割り当て
export interface StepAssignee {
  stepId: string;         // 'judgment' | 'orderer' | 'partner' | 'request' | 'award'
  staffId: string;        // 担当者ID
  assignedAt: string;     // 割り当て日時
}
