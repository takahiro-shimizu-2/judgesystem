import type { DocumentType } from '../types';

/**
 * 資料種別の表示設定
 *
 * 資料の種類は案件ごとに異なるため、以下は既知の種類の設定です。
 * 未知の種類には getDocumentTypeConfig() でデフォルト設定が適用されます。
 */

export interface DocumentTypeStyle {
  label: string;
  color: string;
  bgColor: string;
}

// 既知の資料種別の設定
export const knownDocumentTypes: Record<string, DocumentTypeStyle> = {
  // 基本（頻度高）
  announcement: { label: '入札公告', color: '#2563eb', bgColor: '#eff6ff' },
  specification: { label: '仕様書', color: '#7c3aed', bgColor: '#f5f3ff' },
  bid_form: { label: '入札書', color: '#dc2626', bgColor: '#fef2f2' },

  // 説明書系
  explanation: { label: '入札説明書', color: '#059669', bgColor: '#ecfdf5' },
  bid_documents: { label: '入札関連書', color: '#0891b2', bgColor: '#ecfeff' },

  // 図面・設計系
  drawing: { label: '図面', color: '#ea580c', bgColor: '#fff7ed' },
  design: { label: '設計書', color: '#ca8a04', bgColor: '#fefce8' },

  // その他
  contract: { label: '契約書', color: '#be185d', bgColor: '#fdf2f8' },
  estimate: { label: '見積書', color: '#4f46e5', bgColor: '#eef2ff' },
  certificate: { label: '証明書', color: '#0d9488', bgColor: '#f0fdfa' },
  report: { label: '報告書', color: '#6366f1', bgColor: '#eef2ff' },
  other: { label: 'その他', color: '#64748b', bgColor: '#f1f5f9' },
};

// デフォルトスタイル（未知の種類用）
const defaultStyle: DocumentTypeStyle = {
  label: '',  // 空の場合はtypeの値をそのまま表示
  color: '#64748b',
  bgColor: '#f1f5f9',
};

/**
 * 資料種別の表示設定を取得
 * 既知の種類には定義済みの設定を、未知の種類にはデフォルト設定を返す
 */
export function getDocumentTypeConfig(type: DocumentType): DocumentTypeStyle {
  const config = knownDocumentTypes[type];
  if (config) {
    return config;
  }
  // 未知の種類の場合、type値をラベルとして使用
  return {
    ...defaultStyle,
    label: type,
  };
}

// 後方互換性のため、旧形式も維持（非推奨）
/** @deprecated getDocumentTypeConfig() を使用してください */
export const documentTypeConfig = knownDocumentTypes;

/**
 * ファイル形式の表示設定
 */
export interface FileFormatStyle {
  label: string;
  color: string;
  bgColor: string;
  extension: string;
}

export const fileFormatConfig: Record<string, FileFormatStyle> = {
  pdf: { label: 'PDF', color: '#dc2626', bgColor: '#fef2f2', extension: '.pdf' },
  excel: { label: 'Excel', color: '#16a34a', bgColor: '#f0fdf4', extension: '.xlsx' },
  word: { label: 'Word', color: '#2563eb', bgColor: '#eff6ff', extension: '.docx' },
  other: { label: 'その他', color: '#64748b', bgColor: '#f1f5f9', extension: '' },
};

/**
 * ファイル形式の表示設定を取得
 */
export function getFileFormatConfig(format?: string): FileFormatStyle {
  if (!format) {
    return fileFormatConfig.pdf; // デフォルトはPDF
  }
  return fileFormatConfig[format] || fileFormatConfig.other;
}
