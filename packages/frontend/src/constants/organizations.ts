/**
 * 発注機関グループ（地域別に整理）
 */
export interface OrganizationRegion {
  region: string;
  items: string[];
}

export const organizationGroupsByRegion: OrganizationRegion[] = [
  {
    region: '中央省庁',
    items: ['国土交通省', '農林水産省', '防衛省', '厚生労働省', '文部科学省', '環境省', '経済産業省', '法務省', '財務省', '総務省'],
  },
  {
    region: '北海道・東北',
    items: ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '札幌市', '仙台市'],
  },
  {
    region: '関東',
    items: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', 'さいたま市', '千葉市', '横浜市', '川崎市', '相模原市'],
  },
  {
    region: '中部',
    items: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '新潟市', '静岡市', '浜松市', '名古屋市'],
  },
  {
    region: '近畿',
    items: ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '京都市', '大阪市', '堺市', '神戸市'],
  },
  {
    region: '中国',
    items: ['鳥取県', '島根県', '岡山県', '広島県', '山口県', '岡山市', '広島市'],
  },
  {
    region: '四国',
    items: ['徳島県', '香川県', '愛媛県', '高知県'],
  },
  {
    region: '九州・沖縄',
    items: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県', '北九州市', '福岡市', '熊本市'],
  },
];

// フラットなリスト（フィルタリング用）
export const organizationGroups = organizationGroupsByRegion.flatMap(g => g.items);

// 発注機関マッチング関数
export const getOrganizationGroup = (org: string): string => {
  for (const group of organizationGroups) {
    if (org.includes(group.replace('県', '').replace('府', '').replace('都', '').replace('市', ''))) {
      return group;
    }
  }
  return 'その他';
};
