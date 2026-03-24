/**
 * 協力会社マスターデータ（企業情報を統合）
 */
import type { PartnerListItem } from '../types';
import { getApiUrl } from '../config/api';

export async function fetchPartnerList(): Promise<PartnerListItem[]> {
  const response = await fetch(getApiUrl('/api/partners'));
  if (!response.ok) {
    throw new Error(`Failed to load partners: ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function createPartnerRecord(
  data: {
    name: string;
    postalCode: string;
    address: string;
    phone: string;
    fax: string;
    email: string;
    url: string;
    representative: string;
    established: string;
    capital: string;
    employeeCount: string;
    categories: string[];
    branches: { name: string; address: string }[];
  }
): Promise<PartnerListItem | null> {
  try {
    const response = await fetch(getApiUrl('/api/partners'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to create partner: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to create partner:', error);
    return null;
  }
}

export async function updatePartnerRecord(
  id: string,
  data: Record<string, unknown>
): Promise<PartnerListItem | null> {
  try {
    const response = await fetch(getApiUrl(`/api/partners/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to update partner: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to update partner:', error);
    return null;
  }
}

export async function deletePartnerRecord(id: string): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl(`/api/partners/${id}`), {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete partner: ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error('Failed to delete partner:', error);
    return false;
  }
}

// 後方互換エクスポート
export const partners: PartnerListItem[] = await fetchPartnerList();

// 種別（100種類以上）
export const allCategories = [
  '土木一式', '建築一式', '大工', '左官', 'とび・土工', '石',
  '屋根', '電気', '管', 'タイル・れんが・ブロック', '鋼構造物',
  '鉄筋', '舗装', 'しゅんせつ', '板金', 'ガラス', '塗装',
  '防水', '内装仕上', '機械器具設置', '熱絶縁', '電気通信',
  '造園', 'さく井', '建具', '水道施設', '消防施設', '清掃施設',
  '解体', '測量', '地質調査', '土木設計', '建築設計', '補償コンサル',
  '土木コンサル', '建築コンサル', '環境調査', '交通量調査', '不動産鑑定',
  '道路維持', '河川維持', '公園管理', '街路樹管理', '除草', '清掃',
  '警備', '交通誘導', '廃棄物処理', '産廃収集', 'アスベスト除去',
  'PCB処理', '土壌汚染調査', '地下水調査', '騒音振動調査', '大気調査',
  '水質調査', '生態系調査', '文化財調査', '埋蔵文化財', '用地測量',
  '路線測量', '河川測量', '深浅測量', '地形測量', '基準点測量',
  '航空写真', 'ドローン測量', '3Dスキャン', 'BIM/CIM', 'GIS',
  '橋梁点検', 'トンネル点検', '道路点検', '河川点検', 'ダム点検',
  '港湾点検', '空港点検', '鉄道点検', '上水道点検', '下水道点検',
  'ガス管点検', '電力設備点検', '通信設備点検', '建築物点検', '設備点検',
  '耐震診断', '劣化診断', '補修設計', '補強設計', '長寿命化計画',
  '維持管理計画', 'アセットマネジメント', 'LCC分析', 'VE提案',
  '積算', '原価管理', '工程管理', '品質管理', '安全管理', '環境管理',
  'ISO9001', 'ISO14001', 'ISO45001', 'COHSMS', 'エコアクション21',
];

// ヘルパー関数
export const findPartnerById = (id: string): PartnerListItem | undefined =>
  partners.find(p => p.id === id);

export const findPartnerByName = (name: string): PartnerListItem | undefined =>
  partners.find(p => p.name === name);
