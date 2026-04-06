# CI Contract

## Purpose

この repo の CI は、単に「アプリか Miyabi か」で二分するだけでは不十分である。
判断を誤らないために、次の 5 つの責務面で repo を切り分ける。

1. アプリ本体
2. Miyabi 仕様
3. Miyabi 実装
4. Miyabi 配線
5. repo / CI 土台

CI の目的は、変更が属する責務面だけを十分に守りつつ、
無関係な長時間 gate を毎回強制しないことにある。

## Responsibility Taxonomy

### 1. アプリ本体

ユーザーに提供するプロダクト機能そのもの。

- 主な path
  - `packages/backend/src/**`
  - `packages/frontend/src/**`
  - `packages/shared/src/**`
  - `packages/engine/**`
  - `db/migrations/**`
- 典型的な変更
  - API 実装
  - UI 修正
  - shared 型変更
  - 業務ロジック変更
  - DB schema 変更
- 壊れると困ること
  - build 不能
  - 型崩れ
  - lint error
  - migration failure
  - dependency vulnerability
- 基本 gate
  - `workspace-gates`
  - `migration-validate`
  - `security-audit`

### 2. Miyabi 仕様

Miyabi が「どう振る舞うべきか」を定義する指示・契約。
実装そのものではないが、運用判断の基準になる。

- 主な path
  - `AGENTS.md`
  - `CLAUDE.md`
  - `.claude/agents/**`
  - `docs/autonomous-runtime-operations.md`
  - `docs/miyabi-parity-plan.md`
- 典型的な変更
  - Agent の役割変更
  - parity / DoD の変更
  - handoff 方針の変更
- 壊れると困ること
  - 実装と仕様の乖離
  - レビュー基準の混乱
  - 自律運用の前提不一致
- 基本 gate
  - 自動検証は限定的
  - まずはレビューで整合性を担保する
  - 仕様変更に対応して runtime contract も変える場合は `automation:smoke` を必須とする

### 3. Miyabi 実装

自律実行そのものを動かす repo-local runtime。

- 主な path
  - `scripts/automation/**`
  - `scripts/context-impact/**`
  - `scripts/agents-parallel-exec.ts`
  - `scripts/water-spider.ts`
- 典型的な変更
  - planning / orchestration ロジック
  - CodeGen / Test / Review / PR handler
  - Water Spider continuity
  - bridge 解決順
- 壊れると困ること
  - `CodeGen -> Test -> Review -> PR` handoff 破綻
  - planning artifact / GitNexus artifact 欠落
  - retry / escalate 判定不良
  - bridge contract 破壊
- 基本 gate
  - `automation:smoke`
  - `shell-syntax`
  - `python-syntax`（Python bridge や engine helper を触る場合）

### 4. Miyabi 配線

Miyabi runtime を GitHub イベントや workflow に接続する面。

- 主な path
  - `.github/workflows/autonomous-agent.yml`
  - `.github/workflows/autonomous-deploy-execute.yml`
  - `.github/workflows/issue-opened.yml`
  - `.github/workflows/pr-opened.yml`
  - `.github/workflows/state-machine.yml`
  - `.github/workflows/webhook-event-router.yml`
  - `.github/workflows/webhook-handler.yml`
  - `.github/workflows/label-sync.yml`
  - `.github/workflows/project-sync.yml`
  - `.github/workflows/update-project-status.yml`
- 典型的な変更
  - trigger 条件
  - workflow_dispatch / workflow_run 配線
  - secret / env / input wiring
  - GitHub label / project 同期導線
- 壊れると困ること
  - event を受けても Miyabi が起動しない
  - 間違った workflow にルーティングされる
  - state machine が前に進まない
- 基本 gate
  - `workflow-lint`
  - 配線が runtime 契約に触れる場合は `automation:smoke`

### 5. repo / CI 土台

アプリ本体と Miyabi の両方を支える共通基盤。

- 主な path
  - `.github/workflows/ci.yml`
  - `scripts/ci/**`
  - `package.json`
  - `package-lock.json`
  - `scripts/tsconfig.json`
- 典型的な変更
  - 実行条件の変更
  - workspace 判定
  - lint / syntax / audit の共通 job
  - root dependency 更新
- 壊れると困ること
  - 必要な gate が走らない
  - 無関係な gate が走り続ける
  - branch protection と CI 契約が再びずれる
- 基本 gate
  - `workflow-lint`
  - `shell-syntax`
  - `workspace-gates`
  - `security-audit`
  - runtime に影響する場合は `automation:smoke`

## Current Job Map

現行の `.github/workflows/ci.yml` は次の job を持つ。

- `changes`
  - diff から変更 scope を計算する
- `automation-smoke`
  - Miyabi 実装の smoke
- `workflow-lint`
  - workflow 構文検証
- `python-syntax`
  - Python 文法検証
- `shell-syntax`
  - shell 文法検証
- `workspace-gates`
  - app workspace ごとの lint / typecheck / test / build
- `migration-validate`
  - DB migration 検証
- `security-audit`
  - backend / frontend dependency audit
- `ci-summary`
  - 必要 job の集約判定

## Current Behavior

### Common Gates

以下は現時点では常時実行である。

- `automation:smoke`
- workflow lint
- Python syntax
- shell syntax
- security audit

### Dynamic Gates

`scripts/ci/detect-changed-scope.mjs` が diff range から実行対象を判定する。

#### Workspace Gates

- root `package-lock.json` の変更時は全 workspace を対象にする
- root `package.json` は `workspaces / dependencies / devDependencies / peerDependencies / optionalDependencies / overrides` が変わったときだけ全 workspace を対象にする
- workspace 変更時は、その workspace 自身に加えて local file dependency の downstream workspace も対象にする
  - 例: `packages/shared` が変わったら `packages/backend` と `packages/frontend` も再検証する

workspace ごとの gate は以下。

- `lint` script があるなら実行
- `typecheck` script があるなら実行
- `typecheck` が無くて `tsconfig.json` があるなら `npx tsc --noEmit`
- `test` script が実体付きで存在するなら実行
- `build` script があるなら実行

#### Migration Validation

`db/migrations/**` が変わったときは migration validate を走らせる。

## Recommended Routing Policy

最終的には、常時 gate と差分 gate を次のように切るのが自然である。

### 常時 gate として残すもの

- `workflow-lint`
- `ci-summary`

### app 変更で走らせるもの

- `workspace-gates`
- `migration-validate`（DB schema 変更時）
- `security-audit`

### Miyabi 実装 / 配線 / repo 土台変更で走らせるもの

- `automation:smoke`
- `shell-syntax`
- `python-syntax`（対象変更時）
- `workflow-lint`

### 仕様変更で必要なもの

- まずはレビューで整合性を確認する
- 仕様変更が runtime contract に波及するなら `automation:smoke` も走らせる

## Decision Rules

変更の分類は path ベースでまず機械判定し、混在時は両方の gate を走らせる。

- `packages/backend/**`, `packages/frontend/**`, `packages/shared/**`, `packages/engine/**`, `db/migrations/**`
  - app 側
- `scripts/automation/**`, `scripts/context-impact/**`, `scripts/agents-parallel-exec.ts`, `scripts/water-spider.ts`
  - Miyabi 実装
- `AGENTS.md`, `CLAUDE.md`, `.claude/agents/**`
  - Miyabi 仕様
- `.github/workflows/autonomous-*.yml`, `.github/workflows/webhook-*.yml`, `.github/workflows/state-machine.yml`
  - Miyabi 配線
- `.github/workflows/ci.yml`, `scripts/ci/**`, `package.json`, `package-lock.json`
  - repo / CI 土台

## Notes

- 現在の CI は安全側に倒しており、`automation:smoke` が app-only 変更でも常時走る
- これは「間違い」ではなく保守的な暫定状態であり、最終形ではない
- branch protection は、内部 job 名ではなく集約 gate の `ci-summary` を required check にする
- `.vite` のようなローカル生成物で lint が汚染されないよう、frontend lint は build artifact を無視する
