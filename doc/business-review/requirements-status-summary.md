# judgesystem 要件・設計 決定状況サマリー

**対象**: 非エンジニア向け  
**目的**: 何が整理済みで、何がまだ正式決定されていないかを明確にする

---

## 1. まず結論

現時点では、次の状態です。

- **現状把握はかなり進んでいる**
- **おすすめ方針も整理できている**
- **ただし、正式承認はまだ終わっていない**

つまり、  
**「決まった」のではなく、「決めるための材料が揃った」段階**です。

---

## 2. いま整理できていること

### 1. 業務の流れ

整理済みです。  
公告取り込み、文書取得、OCR、要件登録、判定、人の確認、画面利用まで、流れを確認できる状態です。

参照文書:
[business-process-review.md](/home/shimizu/project/package/judgesystem/doc/business-review/business-process-review.md)

### 2. 業務ルールの候補

整理済みです。  
何を正式な公告とみなすか、情報不足をどう扱うか、最終判定を人が持つかなど、主要ルールのおすすめ案があります。

参照文書:
[business-rules-confirmation.md](/home/shimizu/project/package/judgesystem/doc/business-review/business-rules-confirmation.md)

### 3. 全体アーキテクチャのおすすめ方針

整理済みです。  
Backend を正規入口にする、API仕様を正本にする、段階移行にする、といった方針が示されています。

参照文書:
[rearchitecture-basic-policy.md](/home/shimizu/project/package/judgesystem/doc/best-practice/rearchitecture-basic-policy.md)

### 4. DBとマスターの現状

整理済みです。  
どんなマスターがあり、主な項目は何か、どの資源がどこに置かれているかを確認できます。

参照文書:
[master-and-storage-inventory.md](/home/shimizu/project/package/judgesystem/doc/business-review/master-and-storage-inventory.md)

### 5. 受入の考え方

整理済みです。  
何ができれば「業務的に使える」と言えるかの基準があります。

参照文書:
[acceptance-criteria.md](/home/shimizu/project/package/judgesystem/doc/business-review/acceptance-criteria.md)

---

## 3. まだ正式に決まっていないこと

次はまだ**正式承認前**です。

### 1. 業務要件

- 正式な公告の定義
- 重要項目の人確認範囲
- 情報不足の扱い
- 最終判定の責任者
- 参考情報と正式情報の区別

### 2. 全体アーキテクチャ

- Backend を唯一の正規入口にすることの正式承認
- Engine を将来DB直アクセスさせない方針
- API仕様を正本にする方針

### 3. DB構成

- 命名規則統一
- 内部IDと業務番号の分離
- 外部キー・制約の付与方針
- どのマスターを正式採用とするか

### 4. 資源配置

- 文書ファイルをどこに置くか
- 添付ファイルをDB保存のままにするか、オブジェクトストレージへ寄せるか
- `data/master` や Google Sheets を正式な元データとするか、移行用入力とみなすか

### 5. 機能要件

- どの機能が「必須」か
- 何を後回しにしてよいか
- どの役割が何をできるべきか

### 6. 非機能要件

- セキュリティレベル
- 応答速度の目標
- バックアップ・復旧目標
- 監査・ログ要件
- 許容停止時間

---

## 4. これから承認すべき文書

以下の文書を見て承認すると、要件が正式化しやすくなります。

1. [business-requirements-approval-sheet.md](/home/shimizu/project/package/judgesystem/doc/business-review/business-requirements-approval-sheet.md)
2. [solution-architecture-approval-sheet.md](/home/shimizu/project/package/judgesystem/doc/business-review/solution-architecture-approval-sheet.md)
3. [functional-requirements-approval-sheet.md](/home/shimizu/project/package/judgesystem/doc/business-review/functional-requirements-approval-sheet.md)
4. [non-functional-requirements-approval-sheet.md](/home/shimizu/project/package/judgesystem/doc/business-review/non-functional-requirements-approval-sheet.md)

---

## 5. 承認が終わったと言える状態

次の4つが終われば、「正式に決まった」と言いやすくなります。

1. 業務要件が承認されている
2. アーキテクチャ / DB / 資源配置の方針が承認されている
3. 必須機能と後回し機能が承認されている
4. 非機能要件の最低ラインが承認されている

---

## 6. 今のおすすめ

今のおすすめは、次の順番で承認することです。

1. 業務要件
2. 全体アーキテクチャ / DB / 資源配置
3. 機能要件
4. 非機能要件

理由は、業務意味が決まらないまま機能や性能の話をしても、後で手戻りしやすいからです。
