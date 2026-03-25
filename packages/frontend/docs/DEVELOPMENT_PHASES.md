# 開発フェーズとタスク

このドキュメントは各開発フェーズで実施すべきタスクを記載しています。

## 現在のフェーズ: UIプロトタイプ

モックデータを使用してUI/UXを固める段階。

### 完了済み
- [x] 型定義の整理（types/に集約）
- [x] 定数の分離（constants/に集約）
- [x] 共通コンポーネントの抽出
- [x] スタイルシステムの統一
- [x] 協力会社と企業情報を「会社情報」に統合
- [x] 一覧ページをカード形式に統一
- [x] 右パネル（詳細プレビュー）追加
- [x] borderRadiusをxs(4px)に統一

### このフェーズでやること
- UIの見た目・操作性の確定
- コンポーネントの分割・共通化
- モックデータは`src/data/`に直接配置してOK

### このフェーズでやらないこと
- Service層の実装（API抽象化）
- ローディング/エラー状態の実装
- 認証・認可の実装

---

## フェーズ2: バックエンドAPI設計確定後

バックエンドのAPI仕様が決まった段階で実施。

### タスク一覧

#### 1. Service層の作成
```
src/services/
├── index.ts
├── bidService.ts           # 判定結果API
├── announcementService.ts  # 入札案件API
├── partnerService.ts       # 会社情報API（協力会社＋企業情報を統合）
└── ordererService.ts       # 発注者API
```

各Serviceの実装パターン:
```typescript
// src/services/bidService.ts
import type { BidEvaluation, BidRowData } from '../types';

export const bidService = {
  // 一覧取得
  getList: async (filters?: FilterState): Promise<BidRowData[]> => {
    // 今: return mockBidData;
    // 後: return api.get('/bids', { params: filters });
  },

  // 詳細取得
  getById: async (id: string): Promise<BidEvaluation | null> => {
    // 今: return mockBidData.find(...)
    // 後: return api.get(`/bids/${id}`);
  },

  // 更新
  update: async (id: string, data: Partial<BidEvaluation>): Promise<BidEvaluation> => {
    // return api.put(`/bids/${id}`, data);
  },
};
```

#### 2. データ取得フックの作成
```
src/hooks/
├── useBidList.ts           # 判定結果一覧
├── useBidDetail.ts         # 判定結果詳細
├── useAnnouncementList.ts  # 入札案件一覧
├── usePartnerList.ts       # 会社情報一覧（協力会社＋企業情報）
└── useOrdererList.ts       # 発注者一覧
```

フックの実装パターン:
```typescript
// src/hooks/useBidList.ts
export function useBidList(filters?: FilterState) {
  const [data, setData] = useState<BidRowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    bidService.getList(filters)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [filters]);

  return { data, loading, error, refetch: () => {...} };
}
```

#### 3. 共通UIコンポーネントの追加
```
src/components/common/
├── LoadingSkeleton.tsx   # ローディング表示
├── ErrorView.tsx         # エラー表示
└── EmptyState.tsx        # データなし表示
```

#### 4. ページコンポーネントの修正

Before（現在）:
```typescript
import { mockBidData } from '../data/mockData';

export default function BidListPage() {
  const rows = mockBidData.filter(...);
  return <DataGrid rows={rows} />;
}
```

After:
```typescript
import { useBidList } from '../hooks/useBidList';

export default function BidListPage() {
  const { data, loading, error } = useBidList();

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorView error={error} />;
  if (data.length === 0) return <EmptyState />;

  return <DataGrid rows={data} />;
}
```

#### 5. API設定
```
src/lib/
└── api.ts               # Axios/fetchのラッパー、ベースURL設定
```

---

## フェーズ3: 本番環境移行

### タスク一覧

#### 1. 環境変数の設定
```
.env.development
.env.production
```

#### 2. 認証・認可の実装
- ログイン画面の作成
- 認証状態の管理（Context or 外部ライブラリ）
- 保護されたルートの実装

#### 3. エラーハンドリングの強化
- グローバルエラーバウンダリ
- API エラーの統一処理
- ユーザーへの通知（Toast等）

#### 4. パフォーマンス最適化
- React.lazy による遅延ローディング
- React Query / SWR の導入検討
- バンドルサイズの最適化

#### 5. テストの追加
```
src/__tests__/
├── components/
├── hooks/
└── services/
```

---

## 移行時の注意点

### モックデータの扱い
- `src/data/`のモックファイルは削除せず、開発用に残しておく
- Service層で環境変数によりモック/実APIを切り替える設計も可能

### 型定義の更新
- バックエンドのAPIスキーマが確定したら`types/`を更新
- OpenAPI等からの自動生成も検討

### 破壊的変更を避ける
- コンポーネントのPropsは変えない（データ取得方法だけ変える）
- 表示ロジックとデータ取得ロジックを分離しておく
