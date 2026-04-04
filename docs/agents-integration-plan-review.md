# `agents-integration-plan.md` レビュー結果

作成日: 2026-04-04
対象文書: `docs/agents-integration-plan.md`

## 1. 概要

`docs/agents-integration-plan.md` は、Miyabi の Agent 基盤を `judgesystem` に移植する計画として方向性は妥当です。
一方で、2026-04-04 時点のリポジトリ実態と突き合わせると、着手前提・検証手順・用語定義にいくつか不整合があります。

この文書は、実装前に先に直しておいたほうがよい点を、優先度順に整理したレビュー記録です。

## 2. 指摘事項

### High: 検証手順が現状のリポジトリでそのまま実行できない

計画書では以下を検証手順として案内しています。

- `npm run build -w packages/agents`
- `tsc --noEmit`

しかし現状では、ルート `package.json` の workspace に `packages/agents` が含まれていません。

- 根拠: `package.json` の `workspaces` は `packages/backend`, `packages/frontend`, `packages/shared` のみ
- 参照: `docs/agents-integration-plan.md` 279-289 行
- 参照: ルート `package.json` 6 行目

実測では以下の失敗を確認しました。

- `npm run build -w packages/agents` -> `No workspaces found: --workspace=packages/agents`
- `npm run typecheck --workspace packages/agents` -> `No workspaces found: --workspace=packages/agents`

さらに `packages/agents` 側で直接 `npm run build` / `npm run typecheck` を実行しても、現時点では `src` 配下に `.ts` 入力がないため TypeScript の `TS18003` で失敗します。

- 根拠: `packages/agents/tsconfig.json` は `include: ["src"]`
- 根拠: `packages/agents/package.json` では `build: "tsc"`, `typecheck: "tsc --noEmit"`

影響:

- 文書どおりに検証しようとしても、実装前から失敗する
- 実装者が「workspace 設定漏れ」なのか「未実装なので正常」なのか判断しづらい

推奨修正:

- 検証手順を Phase 0 前後で分けて書く
- `packages/agents` を workspace 登録する前提を明記する
- 「足場のみの時点では `tsc` が失敗しても不自然ではない」ことを補足する

### Medium: Agent 数の説明が文中で揺れている

計画書の前半では「Agent 実装コード (7Agent)」と説明されていますが、ディレクトリ構造に列挙されている実装ファイルは 6 個です。

- `coordinator-agent.ts`
- `codegen-agent.ts`
- `review-agent.ts`
- `issue-agent.ts`
- `pr-agent.ts`
- `deployment-agent.ts`

一方、型定義の統合方針では 7 種として `TaskManagerAgent` を含めています。

- 参照: `docs/agents-integration-plan.md` 16 行目
- 参照: `docs/agents-integration-plan.md` 84-91 行
- 参照: `docs/agents-integration-plan.md` 157-160 行

影響:

- 「7つ目の Agent は実装対象か、型上の概念か」が読み手に伝わらない
- 工数見積もりや責務分担を誤る可能性がある

推奨修正:

- `TaskManagerAgent` を「実装クラスではなく統合上の論理エージェント」と明記する
- もしくは実装対象 Agent 数を 6 と書き換える

### Medium: `execution-plan.json` のパス記述がプロジェクト規約とずれている

計画書では `estack-enforcer` の説明として、`execution-plan.json + impact_checked` を前提にしています。
ただし、実プロジェクトの context-and-impact スキルでは `.ai/execution-plan.json` を先に作成する運用です。

- 参照: `docs/agents-integration-plan.md` 455 行
- 参照: `.claude/skills/context-and-impact/SKILL.md` 30-31 行

影響:

- 事前準備ファイルの配置先を誤解しやすい
- hook と運用手順の関係が読み手に伝わりにくい

推奨修正:

- `execution-plan.json` を `.ai/execution-plan.json` に修正する
- 必要なら `impact_checked` の持ち方も補足する

### Low: 現状説明の一部が最新状態より古く見える

計画書の背景説明では、「judgesystem には定義書だけがコピーされており、実際のエンジンはない」と読める表現になっています。
ただし 2026-04-04 時点では、少なくとも `packages/agents/package.json` と `packages/agents/tsconfig.json` はすでに存在しています。

- 参照: `docs/agents-integration-plan.md` 9-25 行
- 参照: `packages/agents/package.json`
- 参照: `packages/agents/tsconfig.json`

これは「実装本体は未着手」という意味なら大筋で正しいものの、「足場は作成済み」である点は書き分けたほうが現在地が伝わります。

推奨修正:

- 「完全に存在しない」ではなく「足場のみ存在し、本体実装は未移植」と表現する

## 3. 追加メモ

### GitNexus の現状

今回の確認時点では、GitNexus から取得できた情報は以下のとおりで、コード影響調査に使えるほど十分ではありませんでした。

- total_nodes: 11
- total_edges: 0

このため、計画書 11 章の GitNexus 活用方針は運用方針としては妥当でも、現時点の index 状態ではそのままフル活用できない可能性があります。

### 今回は docs-only のレビュー

このレビューではコード変更は行っていません。既存の `docs/agents-integration-plan.md` を壊さないよう、指摘は別文書として記録しています。

## 4. 推奨アクション

着手前に直す順番としては、以下が分かりやすいです。

1. ルート `package.json` に `packages/agents` を追加し、検証手順の前提をそろえる
2. `packages/agents` の現在地を「足場あり / 実装未完了」と明記する
3. Agent 数の説明を 6 実装 + 1 論理 Agent のように整理する
4. `.ai/execution-plan.json` など、既存運用との接続部分を正しいパスに直す

