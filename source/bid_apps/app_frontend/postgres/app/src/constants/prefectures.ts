/**
 * 都道府県定数
 */

// 都道府県リスト（地方別）
export const prefecturesByRegion = [
  {
    region: '北海道・東北',
    prefectures: ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'],
  },
  {
    region: '関東',
    prefectures: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'],
  },
  {
    region: '中部',
    prefectures: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'],
  },
  {
    region: '近畿',
    prefectures: ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
  },
  {
    region: '中国',
    prefectures: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'],
  },
  {
    region: '四国',
    prefectures: ['徳島県', '香川県', '愛媛県', '高知県'],
  },
  {
    region: '九州・沖縄',
    prefectures: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'],
  },
] as const;

// 全都道府県フラットリスト
export const allPrefectures: string[] = prefecturesByRegion.flatMap(g => [...g.prefectures]);

// 都道府県型
export type Prefecture = (typeof allPrefectures)[number];

// 住所から都道府県を抽出
export function extractPrefecture(address: string): Prefecture | null {
  for (const pref of allPrefectures) {
    if (address.startsWith(pref)) {
      return pref as Prefecture;
    }
  }
  return null;
}

// 地方グループの型
export interface RegionGroup {
  region: string;
  prefectures: readonly string[];
}

/**
 * 利用可能な都道府県から地方グループをフィルタリング
 */
export function getAvailableRegionGroups(availablePrefectures: string[]): RegionGroup[] {
  return prefecturesByRegion
    .map(group => ({
      region: group.region,
      prefectures: group.prefectures.filter(pref => availablePrefectures.includes(pref)),
    }))
    .filter(group => group.prefectures.length > 0);
}
