# judgesystem 業務レビュー文書

**対象**: 非エンジニア、業務担当者、責任者、開発チーム  
**目的**: 「システムが動くか」ではなく、「業務として正しいか」を確認する

---

## 1. このフォルダの役割

`doc/best-practice/` は、主に「どういう土台で作るべきか」を整理した文書です。  
それに対して、この `doc/business-review/` は、**業務としてこの処理で本当に良いのか** を確認するための文書群です。

つまり、役割は次のように分かれます。

- `best-practice`: どう作るか
- `business-review`: 何を正しい処理とみなすか

---

## 2. 読む順番

1. [business-process-review.md](/home/shimizu/project/package/judgesystem/doc/business-review/business-process-review.md)  
   システム全体の業務処理を、非エンジニア向けに順番に説明した文書

2. [business-rules-confirmation.md](/home/shimizu/project/package/judgesystem/doc/business-review/business-rules-confirmation.md)  
   「何を業務ルールとして正式に決めるか」を整理した確認書

3. [exception-cases.md](/home/shimizu/project/package/judgesystem/doc/business-review/exception-cases.md)  
   迷いやすい例外ケースを先回りして整理した一覧

4. [acceptance-criteria.md](/home/shimizu/project/package/judgesystem/doc/business-review/acceptance-criteria.md)  
   何ができれば「業務的にOK」と言えるかを定義した受入基準

5. [master-and-storage-inventory.md](/home/shimizu/project/package/judgesystem/doc/business-review/master-and-storage-inventory.md)  
   どんなマスターが必要で、主な項目は何か、どの資源がどこに保存されるかを整理した棚卸し

6. [requirements-status-summary.md](/home/shimizu/project/package/judgesystem/doc/business-review/requirements-status-summary.md)  
   何が整理済みで、何がまだ正式決定ではないかをまとめた状況整理

7. [business-requirements-approval-sheet.md](/home/shimizu/project/package/judgesystem/doc/business-review/business-requirements-approval-sheet.md)  
   業務要件をそのまま確認・承認できるシート

8. [solution-architecture-approval-sheet.md](/home/shimizu/project/package/judgesystem/doc/business-review/solution-architecture-approval-sheet.md)  
   全体アーキテクチャ、DB方針、資源配置を承認するためのシート

9. [functional-requirements-approval-sheet.md](/home/shimizu/project/package/judgesystem/doc/business-review/functional-requirements-approval-sheet.md)  
   必須機能と後回し機能を整理した承認シート

10. [non-functional-requirements-approval-sheet.md](/home/shimizu/project/package/judgesystem/doc/business-review/non-functional-requirements-approval-sheet.md)  
   セキュリティ、性能、運用性などを整理した承認シート

---

## 3. この文書群で確認したいこと

- 判定対象の公告を正しく拾えているか
- OCRや情報抽出の結果を、そのまま信じてよいのか
- どの条件を満たしたら「参加可能」と言うのか
- 情報が欠けているとき、機械が決めるのか人が判断するのか
- 画面に出している情報が、現場の判断に本当に役立つのか

---

## 4. 使い方

非エンジニアの方は、次の観点で見れば十分です。

- この処理の目的は納得できるか
- 自動で決めてよい範囲は妥当か
- 人が確認すべきところが抜けていないか
- 現場の感覚として「それで困らないか」

この4つのどれかに違和感があれば、その処理は見直し候補です。
