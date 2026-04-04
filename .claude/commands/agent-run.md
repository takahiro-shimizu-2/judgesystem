---
description: Autonomous Agent実行 - planning-first orchestration と safe handler 実行入口
---

# Autonomous Agent実行

`judgesystem` の repo-local autonomous runtime を実行する入口です。
現在の `agents:parallel:exec` は、Issue を分解して DAG / execution plan / report を作り、
接続済み handler があれば safe に実行します。

## 現在の実行モデル

```text
Issue取得
  ↓
CoordinatorAgent
  ↓
IssueAgent      → label/state sync (token がある場合)
CodeGenAgent    → implementation brief artifact
ReviewAgent     → npm run typecheck / npm test
PRAgent         → local draft PR artifact
DeploymentAgent → env-gated command only
```

以下はまだ前提にしないこと:

- external model による product code 自動生成
- GitHub 上の remote PR 自動作成
- deploy の常時実行
- 固定の品質スコアや coverage を成功条件として断定すること

## 実行コマンド

### 単一Issue

```bash
npm run agents:parallel:exec -- --issue 123
```

### 複数Issue

```bash
npm run agents:parallel:exec -- --issues 123,124,125 --concurrency 3
```

### Dry run

```bash
npm run agents:parallel:exec -- --issue 123 --dry-run
```

### ヘルプ

```bash
npm run agents:parallel:exec -- --help
```

## 主な出力

- `.ai/parallel-reports/execution-plan-*.json`
- `.ai/parallel-reports/agents-parallel-*.json`
- `.ai/worktrees/issue-*/...`
- `.ai/logs/YYYY-MM-DD.md`

## 環境変数

必須ではないが、あると connected handler が広がるもの:

```bash
GITHUB_TOKEN=ghp_xxx
GH_TOKEN=ghp_xxx
REPOSITORY=owner/repo
DEVICE_IDENTIFIER=local-runner
AUTOMATION_ENABLE_DEPLOY=true
AUTOMATION_DEPLOY_COMMAND="npm run deploy:staging"
```

補足:

- `GITHUB_TOKEN` が無くても dry-run や local artifact 生成は可能
- `ANTHROPIC_API_KEY` は現行 repo-local handler の必須条件ではない

## 実行前のおすすめ

アプリコードに触る Issue なら先に:

```bash
npm run pipeline:plan:init -- "Issue #123 summary" M
npx gitnexus query "keyword" --repo judgesystem
```

## トラブルシューティング

### Issue を取れない

- Issue番号を確認する
- `GITHUB_TOKEN` / `REPOSITORY` を確認する

### handler が skip / planned になる

- token や env gate が無い可能性がある
- その task は未接続 capability かもしれない
- report の `notes` と `warnings` を確認する

### 実行結果を見る

```bash
cat .ai/logs/$(date +%Y-%m-%d).md
cat .ai/parallel-reports/agents-parallel-*.json | jq
```

## 期待値の置き方

このコマンドは「完全自動で codegen → review → PR → deploy を終える」ことを
常には意味しない。今の主目的は、plan / report / safe handler を truthfully 動かすことにある。
