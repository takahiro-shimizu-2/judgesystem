# GitNexus Mandatory Runtime Integration Plan

作成日: 2026-04-06
最終更新: 2026-04-06

## 1. 目的

`judgesystem` の Miyabi runtime は、
guide / agent prompt / hook では GitNexus 前提になっていたが、
実際の repo-local runtime は GitNexus artifact なしでも進めてしまえていた。

この計画の目的は、
GitNexus を「使うべき補助ツール」ではなく、
`Issue -> planning -> CodeGen -> Test -> Review` の主経路に入る mandatory runtime context として固定することである。

## 2. 根本原因

- `TaskManager` が Omega / DAG / plan/report は作るが、GitNexus artifact を作らない
- `TaskExecutor` と handler が GitNexus context なしでも進む
- `CodeGen/Test/Review` artifact に GitNexus handoff が残らない
- smoke / docs / project memory がこの契約を継続確認していない

## 3. あるべき状態

- planning 時に必ず GitNexus runtime artifact を作る
- artifact には issue-level query と runtime anchor symbol の context / impact が入る
- task ごとに GitNexus binding が作られ、`CodeGen/Test/Review` はそれを handoff として消費する
- summary / living plan / smoke / docs から GitNexus artifact が見える

## 4. 実装フェーズ

### Phase G1: planning artifact

- `scripts/automation/gitnexus/*` を新設する
- `TaskManager` で issue-level query と runtime anchor symbol の context / impact を収集する
- `.ai/parallel-reports/gitnexus-runtime-*.json` を生成する

### Phase G2: handler handoff

- task ごとに GitNexus binding を解決する
- `TaskExecutor` は binding なし task を実行しない
- `CodeGen/Test/Review` は GitNexus note を artifact に残す

### Phase G3: operational DoD

- living plan / workflow summary に GitNexus artifact を表示する
- `planning-artifacts`, `quality-pipeline`, `handler-contracts`, `worktree-lifecycle`, `omega-integration-learning` で契約を固定する
- `project_memory/*` と運用 docs を更新する

## 5. 完成条件

- GitNexus runtime artifact が planning ごとに必ず生成される
- `TaskManager` の全 task に GitNexus binding が付く
- `CodeGen/Test/Review` artifact に GitNexus note が残る
- `npm run automation:smoke` が green

## 6. 非目標

- GitNexus index 自動再生成そのものを runtime の中に入れること
- `gitnexus-stable-ops` を repo-local runtime に取り込むこと
- PR / Deploy 側の business policy を GitNexus 依存にすること
