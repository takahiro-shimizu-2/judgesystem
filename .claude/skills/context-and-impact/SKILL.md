---
name: context-and-impact
description: judgesystem 用の context-and-impact 統合スキル
---

# context-and-impact for judgesystem

アプリコード変更や Agent dispatch を始める前に、この repo ローカルの wrapper を使って
execution plan と context pipeline を起動する。

## Default Flow

1. `bash scripts/context-impact/plan-init.sh "<task summary>" M`
2. `npm run pipeline:l1 -- "<keyword>"`
3. GitNexus impact とローカル文脈を集める
4. `npm run pipeline:quality -- --task "<task summary>" --context "<assembled context>"`
5. `npm run pipeline:classify -- --task "<task summary>"`
6. `bash scripts/context-impact/record-run.sh "<task summary>" success 0.8`

`pipeline:l1`, `pipeline:quality`, `pipeline:classify` は repo-local wrapper を経由して
`CONTEXT_AND_IMPACT_ROOT` または `../context-and-impact` を参照する。
`plan-init/status/clean` と `estack-enforcer` はこの repo に vendor 済みである。
`record-run.sh` と `pipeline-dashboard.sh` は `AGENT_SKILL_BUS_BIN` / `AGENT_SKILL_BUS_ROOT`
または local `node_modules/.bin/agent-skill-bus` を優先し、最後に `../agent-skill-bus` を参照する。

## Skip Conditions

以下だけを触る作業では pipeline を skip してよい:

- `.claude/*`
- `.ai/*`
- `docs/*`
- `.gitignore`
- `*.md`, `*.json`, `*.yml`, `*.yaml`, `*.txt`, `*.sh`, `*.css`, `*.html`

アプリコード変更では `.ai/execution-plan.json` を先に作成し、
`project_memory/worklog.md` と `project_memory/tasks.json` を更新する。
