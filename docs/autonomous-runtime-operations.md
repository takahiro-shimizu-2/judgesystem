# Autonomous Runtime Operations

作成日: 2026-04-04
最終更新: 2026-04-04

## 1. 目的

`judgesystem` の full autonomy は、
「機能がある」だけでなく、
毎回同じ契約で検証できることを運用上の条件にする。

この文書は、現在の repo-local runtime に対する smoke 導線、
artifact 運用責務、
そして quality/test/review parity の運用判断を固定する。

## 2. Smoke Test

repo-local smoke の入口は次で固定する。

```bash
npm run automation:smoke
```

このコマンドは次を順に確認する。

- `npm run typecheck`
- `npx tsx scripts/agents-parallel-exec.ts --help`
- `quality-pipeline` parity smoke
- `TestAgent` contract smoke
- `ReviewAgent` contract smoke
- `PRAgent` remote-PR contract smoke
- `DeploymentAgent` `github-pages` preset smoke

quality / test / review / PR / deploy の smoke は
`scripts/automation/smoke/handler-contracts.ts`
と `scripts/automation/smoke/quality-pipeline.ts`
で行い、外部副作用は fake Octokit と temp git repo で閉じる。

## 3. CI

push / PR 時には `.github/workflows/ci.yml` の `automation-smoke` job が
`npm run automation:smoke` を実行する。

これにより、Phase 9 の最小運用条件として
次が継続確認される。

- runtime entrypoint が壊れていない
- `CodeGen -> Test -> Review -> PR` handoff と shared worktree contract が壊れていない
- `TestAgent` contract が壊れていない
- review loop contract が壊れていない
- remote draft PR contract が壊れていない
- provider-dispatch deploy contract が壊れていない

## 4. Artifact Ownership

運用責務は次で固定する。

- `project_memory/tasks.json`
  - phase や計画状態が変わったときだけ更新する
- `project_memory/worklog.md`
  - notable な phase 変更や運用判断を記録する
- `.ai/parallel-reports/*`
  - 実行ごとの artifact
  - commit 対象ではなく、run 出力として扱う
- `.ai/logs/*`
  - 実行ログ
  - commit 対象ではなく、run 出力として扱う

つまり、
`project_memory/*` は「計画と判断の記録」、
`.ai/*` は「実行結果」であり、
役割を混ぜない。

## 5. Quality Runtime Decision

`judgesystem` では、Miyabi parity の判断に従って
`TestAgent` を **独立 runtime として追加する**。

最終判断:

- `TestAgent` が test / coverage / integration handoff を担う
- `ReviewAgent` は review / score / review loop / escalation を担う
- quality pipeline は `CodeGen -> Test -> Review -> PR` を基本 handoff とする
- review は `TestAgent` artifact を読み、必要なら `AUTOMATION_REVIEW_FIX_COMMAND` つき loop を回す

`ReviewAgent` に test 実行責務を戻さない理由:

- authority / escalation / state / artifact を review と分離したい
- coverage gate と review gate を別 failure surface として追いたい
- `CodeGen` 後の shared worktree handoff を明示したい

## 6. この計画で残さないこと

この運用 DoD で完了扱いにするのは、
あくまで current plan の範囲である。

次は別計画として扱う。

- Cloud Run / GitHub Pages 以外の provider orchestration
- external-model / remote push を含む stronger codegen
- richer review comment publish policy
