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
CodeGenAgent    → implementation brief artifact + optional code-writing command
ReviewAgent     → repo-root configured checks + score/retry/escalation artifact
PRAgent         → local draft PR artifact + optional remote draft PR
DeploymentAgent → preflight + deploy + optional healthcheck/rollback contract
```

以下はまだ前提にしないこと:

- external model による product code 自動生成
- gate を開いていない code-writing / remote PR / deploy を「自動実行済み」とみなすこと
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

## GitHub Actions からの起動契約

- `workflow_dispatch`
  - `execution_mode=planning|execute` を明示して起動できる
- `issues` + `🤖agent-execute`
  - workflow は起動するが、デフォルトでは `planning`
  - `AUTONOMOUS_AGENT_LABEL_EXECUTE_ENABLED=true` が repo variable にあると、ラベル付与イベント時だけ `execute` を開けられる
- `issue_comment`
  - `/agent ...` や `@miyabi` で workflow は起動する
  - `/agent execute` や `@miyabi ... execute` でも、デフォルトでは `planning`
  - `AUTONOMOUS_AGENT_COMMENT_EXECUTE_ENABLED=true` が repo variable にある場合だけ comment-triggered `execute` を開けられる

つまり、Issue / comment は「意図の表明」、実際の `execute` は workflow gate が開いているときだけである。

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
AUTOMATION_ENABLE_PR_WRITE=true
AUTOMATION_ENABLE_CODEGEN_WRITE=true
AUTOMATION_CODEGEN_COMMAND="npm run agent:codegen"
AUTOMATION_REVIEW_MIN_SCORE=100
AUTOMATION_REVIEW_MAX_RETRIES=1
AUTOMATION_REVIEW_CHECKS_JSON='[{"label":"typecheck","command":"npm","args":["run","typecheck"]},{"label":"tests","command":"npm","args":["test"]}]'
AUTOMATION_ENABLE_DEPLOY=true
AUTOMATION_DEPLOY_PROVIDER="cloud-run"
AUTOMATION_DEPLOY_TARGET="backend"
AUTOMATION_DEPLOY_COMMAND="npm run deploy:staging"
AUTOMATION_DEPLOY_BUILD_COMMAND="npm run build -w packages/backend"
AUTOMATION_DEPLOY_REQUIRE_APPROVAL=required
AUTOMATION_DEPLOY_ALLOWED_APPROVERS="takahiro-shimizu-2"
AUTOMATION_DEPLOY_APPROVED_BY="takahiro-shimizu-2"
AUTOMATION_DEPLOY_APPROVAL_REASON="manual staging rollout"
AUTOMATION_DEPLOY_PREFLIGHT_COMMAND="npm run typecheck"
AUTOMATION_DEPLOY_HEALTHCHECK_COMMAND="curl -fsS https://example.com/health"
AUTOMATION_DEPLOY_ROLLBACK_COMMAND="npm run deploy:rollback"
```

補足:

- `GITHUB_TOKEN` が無くても dry-run や local artifact 生成は可能
- `ANTHROPIC_API_KEY` は現行 repo-local handler の必須条件ではない

GitHub Actions 側の gate に使う repo variable:

```bash
AUTONOMOUS_AGENT_LABEL_EXECUTE_ENABLED=true
AUTONOMOUS_AGENT_COMMENT_EXECUTE_ENABLED=true
```

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
