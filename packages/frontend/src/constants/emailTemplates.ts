/**
 * メールテンプレート定数
 * 依頼タブ・落札タブで使用するメールテンプレート
 */

import type { EmailTemplate } from '../types/workflow';

// ============================================================================
// 依頼タブ用テンプレート
// ============================================================================

/** 依頼元企業向け - 見積書確認依頼 */
const ESTIMATE_CONFIRMATION: EmailTemplate = {
  id: 'estimate-confirmation',
  label: '見積書確認依頼',
  category: 'request',
  recipientType: 'requester',
  subject: '【{{案件名}}】見積書確認のお願い',
  body: `{{企業名}}
{{担当者名}} 様

お世話になっております。
{{自社名}}の{{自社担当者}}でございます。

「{{案件名}}」につきまして、
見積書を取りまとめましたのでご確認をお願いいたします。

ご確認後、ご連絡いただけますと幸いです。
何卒よろしくお願いいたします。

──────────────────────
{{自社名}}
{{自社担当者}}
──────────────────────`,
};

/** 依頼元企業向け - 入札書確認依頼 */
const BID_CONFIRMATION: EmailTemplate = {
  id: 'bid-confirmation',
  label: '入札書確認依頼',
  category: 'request',
  recipientType: 'requester',
  subject: '【{{案件名}}】入札書確認のお願い',
  body: `{{企業名}}
{{担当者名}} 様

お世話になっております。
{{自社名}}の{{自社担当者}}でございます。

「{{案件名}}」につきまして、
入札書を作成いたしましたのでご確認をお願いいたします。

ご確認後、ご連絡いただけますと幸いです。
何卒よろしくお願いいたします。

──────────────────────
{{自社名}}
{{自社担当者}}
──────────────────────`,
};

/** 協力会社向け - 見積採用通知 */
const ESTIMATE_ADOPTED: EmailTemplate = {
  id: 'estimate-adopted',
  label: '見積採用通知',
  category: 'request',
  recipientType: 'adopted_partner',
  subject: '【{{案件名}}】見積採用のご連絡',
  body: `{{企業名}}
{{担当者名}} 様

お世話になっております。
{{自社名}}の{{自社担当者}}でございます。

「{{案件名}}」につきまして、
貴社のお見積りを採用させていただくことになりました。

今後の手続きについては、追ってご連絡させていただきます。
引き続きよろしくお願いいたします。

──────────────────────
{{自社名}}
{{自社担当者}}
──────────────────────`,
};

/** 協力会社向け - 不採用通知 */
const ESTIMATE_NOT_ADOPTED: EmailTemplate = {
  id: 'estimate-not-adopted',
  label: '不採用通知',
  category: 'request',
  recipientType: 'non_adopted_partner',
  subject: '【{{案件名}}】選定結果のご報告',
  body: `{{企業名}}
{{担当者名}} 様

お世話になっております。
{{自社名}}の{{自社担当者}}でございます。

「{{案件名}}」につきまして、
お見積りをご提出いただき誠にありがとうございました。

慎重に検討いたしました結果、
誠に残念ながら今回は他社様のお見積りを採用させていただくことになりました。

またの機会がございましたら、ぜひご協力をお願いできれば幸いです。
今後とも何卒よろしくお願いいたします。

──────────────────────
{{自社名}}
{{自社担当者}}
──────────────────────`,
};

// ============================================================================
// 落札タブ用テンプレート
// ============================================================================

/** 依頼元企業向け - 落札通知 */
const AWARD_WON_REQUESTER: EmailTemplate = {
  id: 'award-won-requester',
  label: '落札通知',
  category: 'award',
  recipientType: 'requester',
  subject: '【落札報告】{{案件名}}',
  body: `{{企業名}}
{{担当者名}} 様

お世話になっております。
{{自社名}}の{{自社担当者}}でございます。

「{{案件名}}」につきまして、
落札いたしましたことをご報告いたします。

【落札金額】
{{落札金額}}

今後の契約手続き等について、
ご確認・ご指示いただけますと幸いです。

引き続きよろしくお願いいたします。

──────────────────────
{{自社名}}
{{自社担当者}}
──────────────────────`,
};

/** 依頼元企業向け - 落選通知 */
const AWARD_LOST_REQUESTER: EmailTemplate = {
  id: 'award-lost-requester',
  label: '落選通知',
  category: 'award',
  recipientType: 'requester',
  subject: '【選定結果報告】{{案件名}}',
  body: `{{企業名}}
{{担当者名}} 様

お世話になっております。
{{自社名}}の{{自社担当者}}でございます。

「{{案件名}}」につきまして、
誠に残念ながら落選となりましたことをご報告いたします。

【落札企業】{{落札企業}}
【落札金額】{{落札金額}}

ご支援いただいたにもかかわらず、
このような結果となり申し訳ございません。

またの機会がございましたら、
何卒よろしくお願いいたします。

──────────────────────
{{自社名}}
{{自社担当者}}
──────────────────────`,
};

/** 協力会社向け - 落札通知 */
const AWARD_WON_PARTNER: EmailTemplate = {
  id: 'award-won-partner',
  label: '落札通知',
  category: 'award',
  recipientType: 'adopted_partner',
  subject: '【落札報告】{{案件名}}',
  body: `{{企業名}}
{{担当者名}} 様

お世話になっております。
{{自社名}}の{{自社担当者}}でございます。

「{{案件名}}」につきまして、
落札いたしましたことをご報告いたします。

貴社のご協力により、落札に至ることができました。
誠にありがとうございます。

今後の契約・施工について、
追ってご連絡させていただきます。

引き続きよろしくお願いいたします。

──────────────────────
{{自社名}}
{{自社担当者}}
──────────────────────`,
};

/** 協力会社向け - 落選通知 */
const AWARD_LOST_PARTNER: EmailTemplate = {
  id: 'award-lost-partner',
  label: '落選通知',
  category: 'award',
  recipientType: 'adopted_partner',
  subject: '【選定結果報告】{{案件名}}',
  body: `{{企業名}}
{{担当者名}} 様

お世話になっております。
{{自社名}}の{{自社担当者}}でございます。

「{{案件名}}」につきまして、
誠に残念ながら落選となりましたことをご報告いたします。

【落札企業】{{落札企業}}
【落札金額】{{落札金額}}

ご協力いただいたにもかかわらず、
このような結果となり申し訳ございません。

またの機会がございましたら、
ぜひご協力をお願いできれば幸いです。

──────────────────────
{{自社名}}
{{自社担当者}}
──────────────────────`,
};

// ============================================================================
// エクスポート
// ============================================================================

/** 依頼タブ用テンプレート */
export const requestEmailTemplates: EmailTemplate[] = [
  ESTIMATE_CONFIRMATION,
  BID_CONFIRMATION,
  ESTIMATE_ADOPTED,
  ESTIMATE_NOT_ADOPTED,
];

/** 落札タブ用テンプレート */
export const awardEmailTemplates: EmailTemplate[] = [
  AWARD_WON_REQUESTER,
  AWARD_LOST_REQUESTER,
  AWARD_WON_PARTNER,
  AWARD_LOST_PARTNER,
];

/** 全テンプレート */
export const allEmailTemplates: EmailTemplate[] = [
  ...requestEmailTemplates,
  ...awardEmailTemplates,
];

/**
 * プレースホルダーを置換する
 * @param template テンプレート文字列
 * @param data 置換データ
 * @returns 置換後の文字列
 */
export const replacePlaceholders = (
  template: string,
  data: Record<string, string>
): string => {
  return Object.entries(data).reduce(
    (result, [key, value]) =>
      result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
    template
  );
};
