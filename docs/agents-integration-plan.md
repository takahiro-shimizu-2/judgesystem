# Miyabi 差分吸収計画書

作成日: 2026-04-04

## 1. この計画の目的

やりたいことは、Miyabi の元ディレクトリにだけ存在する機能を `judgesystem` にそのまま複製することではない。
`judgesystem` 側でまだ吸収し切れていない差分を洗い出し、このリポジトリの構成と運用に合わせてローカル実装へ落とし切ることが目的である。

つまり方針は以下。

- Miyabi を丸ごと移植するのではなく、必要な機能差分だけを `judgesystem` に吸収する
- `judgesystem` の既存エントリポイントを壊さず、内部実装を段階的に置き換える
- 最終的に、運用上必要な Agent / state / sync / reporting / routing は `judgesystem` 単独で完結させる

## 2. 完了イメージ

この計画の完了条件は以下。

1. `judgesystem` が Miyabi の元ディレクトリを runtime 前提にしない
2. `scripts/` と `.github/workflows/` が呼ぶロジックの実体が `judgesystem` 内に揃う
3. `packages/agents` が Agent 系機能のローカルな中核ライブラリとして機能する
4. labels / Projects V2 / dashboard / webhook / task orchestration の実装が repo 内で一貫する
5. CommonJS / ES2019 / 既存 workspace 形態に沿ってビルドできる

## 3. いまの現実

### 3.1 judgesystem 側にはすでに受け皿がある

`judgesystem` は単なる空箱ではなく、すでに以下のような形を持っている。

- アプリ本体: `packages/backend`, `packages/frontend`, `packages/shared`, `packages/engine`
- GitHub 自動化: `.github/workflows/`
- 運用スクリプト: `scripts/`
- Agent 吸収先の足場: `packages/agents`

したがって、今後の作業は「新規に Agent システムを作る」よりも、
「すでにある judgesystem の運用資産へ Miyabi 由来の差分を正しく収める」ほうが正確である。

### 3.2 すでに部分的に取り込まれているもの

Miyabi 由来の機能は、すでに断片的には `judgesystem` へ入っている。

| 領域 | judgesystem 側の現状 |
|------|----------------------|
| state 管理 | `scripts/label-state-machine.ts` |
| Projects V2 | `scripts/lib/projects-v2.ts` |
| Discussions | `scripts/lib/discussions.ts` |
| dashboard 生成 | `scripts/generate-dashboard-data.ts` |
| KPI 投稿 | `scripts/post-kpi-report.ts` |
| webhook routing | `scripts/webhook-router.ts` |
| project status 同期 | `scripts/update-project-status.ts` |
| GitHub workflow 接続 | `.github/workflows/*.yml` |

つまり問題は「何も無い」ことではなく、以下の状態にあること。

- Miyabi 由来の実装が `scripts/` に分散している
- `packages/agents` は足場だけ存在し、中核ライブラリとして未完成
- workflow ごとに参照パスや責務分担が揺れている
- Miyabi 本体との間で機能差分と source of truth が曖昧

### 3.3 差分が残っている具体例

例えば weekly KPI workflow は一時ファイル内で以下を import している。

- `./agents/github/projects-v2.js`
- `./agents/github/discussions.js`

しかし実際のローカル実装は現時点で `scripts/lib/projects-v2.ts` と `scripts/lib/discussions.ts` にある。
このような「一部だけ Miyabi 的なパスを想定しているが、実体は別の場所にある」というズレをなくす必要がある。

## 4. judgesystem に合わせた最終アーキテクチャ

### 4.1 基本方針

`packages/agents` を Agent 系機能のローカル中核ライブラリにする。
ただし CLI や workflow の入口は既存の `scripts/` と `.github/workflows/` を維持する。

責務分担は以下。

- `packages/agents`
  - 再利用可能な state / sync / GitHub client / decomposition / orchestration / agent 実装を持つ
- `scripts`
  - CLI 互換を維持する薄いラッパー
- `.github/workflows`
  - 既存の GitHub Actions から `scripts` を起動する層
- `packages/shared`
  - workflow や UI が共有する定数・型の最小共有層

### 4.2 目標ディレクトリ像

```text
packages/agents/
  package.json
  tsconfig.json
  src/
    index.ts
    types/
      index.ts
      agent.ts
      task.ts
      decomposition.ts
      sync.ts
      config.ts
    core/
      retry.ts
      logger.ts
      utils.ts
    github/
      projects-v2.ts
      discussions.ts
      github-client.ts
    state/
      task-state-machine.ts
      label-state-bridge.ts
      label-state-machine.ts
    sync/
      github-label-sync.ts
      projects-v2-sync.ts
      bidirectional-sync.ts
    decomposition/
      llm-decomposer.ts
      decomposition-validator.ts
      prompt-templates.ts
    orchestration/
      dag-manager.ts
      task-executor.ts
      worktree-coordinator.ts
      task-manager.ts
    agents/
      coordinator-agent.ts
      issue-agent.ts
      codegen-agent.ts
      review-agent.ts
      pr-agent.ts
      deployment-agent.ts
    adapters/
      webhook-router.ts
      dashboard-reporting.ts
      project-status.ts

scripts/
  label-state-machine.ts      -> packages/agents/state or adapters へ委譲
  update-project-status.ts    -> packages/agents/adapters へ委譲
  generate-dashboard-data.ts  -> packages/agents/adapters へ委譲
  post-kpi-report.ts          -> packages/agents/github + adapters へ委譲
  webhook-router.ts           -> packages/agents/adapters へ委譲
```

## 5. 吸収対象と非対象

### 5.1 吸収対象

`judgesystem` 側で使い切りたい対象は以下。

- label ベースの state machine
- Projects V2 連携
- Discussions / KPI / dashboard 系の GitHub 自動化
- webhook event routing
- task decomposition / DAG / execution
- Agent 実装本体
- worktree を使った並列実行基盤
- retry / config / logging などの共通基盤

### 5.2 今回は吸収しないもの

以下は `judgesystem` に必要な形へ絞るため、今回の差分吸収から外す。

- Omega System
- Web UI (`packages/miyabi-web`)
- MCP Bundle
- Context Engineering
- Doc Generator
- Water Spider Agent
- terminal UI 系の装飾
- monitoring / feedback-loop のうち judgesystem 運用に不要な部分

## 6. 機能差分マトリクス

| 機能 | Miyabi 側 | judgesystem 側 | 吸収方針 |
|------|-----------|----------------|----------|
| state / labels | task-manager + cli scripts | `scripts/label-state-machine.ts` のみ | `packages/agents/state` に集約し、script は薄い CLI にする |
| Projects V2 | task-manager / github utilities | `scripts/lib/projects-v2.ts` | `packages/agents/github/projects-v2.ts` に昇格 |
| Discussions | cli / github utility | `scripts/lib/discussions.ts` | `packages/agents/github/discussions.ts` に昇格 |
| KPI / dashboard | reporting scripts | `scripts/post-kpi-report.ts`, `scripts/generate-dashboard-data.ts` | GitHub client と reporting ロジックを package 化 |
| webhook routing | cli scripts | `scripts/webhook-router.ts` | routing ルールを package 化し、script は入口だけ残す |
| task decomposition | task-manager | なし | `packages/agents/decomposition` に独立配置 |
| DAG / execution | coding-agents + task-manager | なし | `packages/agents/orchestration` に吸収 |
| agent 実装 | miyabi-agent-sdk | 定義書中心、実装未吸収 | `packages/agents/agents` に吸収 |
| GitHub label sync | task-manager | 断片的 | `packages/agents/sync` へ統合 |
| worktree 並行実行 | task-manager / coding-agents | なし | judgesystem 用設定に合わせて吸収 |

## 7. 設計原則

### 7.1 吸収であって複製ではない

Miyabi のパス構造や package 境界をそのまま再現しない。
`judgesystem` に必要な責務単位へ再配置する。

### 7.2 入口は維持し、中身を差し替える

既存の CLI や workflow はできるだけ残す。
たとえば以下は残してよい。

- `npm run state:check`
- `npm run state:transition`
- `npm run state:assign-agent`
- 既存 `.github/workflows/*`

ただし内部実装は `packages/agents` に寄せる。

### 7.3 scripts を source of truth にしない

`scripts/` には最終的に再利用ロジックを残さない。
再利用可能なロジックは `packages/agents` に移し、script は引数解釈と exit code 制御だけを担う。

### 7.4 judgesystem の module 条件を優先する

Miyabi は ESM 前提だが、`judgesystem` の backend / shared / agents は CommonJS / ES2019 に合わせる。

最低限守ること:

- `module: CommonJS`
- `target: ES2019`
- import は拡張子無しの repo 標準に寄せる
- ESM 専用依存は必要に応じて置き換える

### 7.5 runtime で Miyabi の元ディレクトリを参照しない

`/home/shimizu/project/package/Miyabi/...` はあくまで移植元参照であり、実行時依存にはしない。

## 8. 実装フェーズ

### Phase 0: 足場を現実に合わせる

目的:

- `packages/agents` を実際にビルド可能な workspace として成立させる

作業:

- ルート `package.json` の workspace に `packages/agents` を追加
- `packages/agents/src/index.ts` など最小エントリを作成
- `build` / `typecheck` が空 package でも通る最低限の状態を作る

成果物:

- `npm run build -w packages/agents` が成立する前提を整える

### Phase 1: GitHub 自動化の共通部を package 化

目的:

- 分散している GitHub utility を `packages/agents` に吸収する

作業:

- `scripts/lib/projects-v2.ts` を `packages/agents/src/github/projects-v2.ts` へ移設
- `scripts/lib/discussions.ts` を `packages/agents/src/github/discussions.ts` へ移設
- 必要なら `repository-metrics` / `automation-reporting` も package 側へ寄せる

成果物:

- reporting / project / discussion 系が `scripts/lib` ではなく package から利用される

### Phase 2: state / label / sync を package 化

目的:

- `label-state-machine.ts` を単独スクリプトから shared ロジックへ昇格する

作業:

- `packages/agents/src/state/task-state-machine.ts`
- `packages/agents/src/state/label-state-bridge.ts`
- `packages/agents/src/state/label-state-machine.ts`
- `packages/agents/src/sync/github-label-sync.ts`

切替方針:

- `scripts/label-state-machine.ts` は CLI 互換を維持
- 内部の `STATE_TRANSITIONS` とラベル操作は package 側へ委譲

### Phase 3: webhook / dashboard / project status の吸収

目的:

- workflow から見た自動化入口の内部実装を package に統一する

作業:

- `scripts/webhook-router.ts` の routing ルールを package 化
- `scripts/generate-dashboard-data.ts` の生成ロジックを package 化
- `scripts/update-project-status.ts` の project status 更新ロジックを package 化
- `scripts/post-kpi-report.ts` の GitHub posting ロジックを package 化

成果物:

- workflow は従来の script を呼び続けても、実体ロジックは package に一本化される

### Phase 4: task decomposition / DAG / execution の吸収

目的:

- Miyabi 側にしか無い decomposition と orchestration を `judgesystem` へ持ち込む

作業:

- `llm-decomposer.ts`
- `decomposition-validator.ts`
- `prompt-templates.ts`
- `dag-manager.ts`
- `task-executor.ts`
- `worktree-coordinator.ts`
- `task-manager.ts`
- `types/task.ts`, `types/decomposition.ts`, `types/config.ts`, `types/sync.ts`

注意点:

- decomposition は `packages/agents/decomposition` を独立責務として置き、DAG / executor / task-manager だけを `orchestration` に置く
- task-manager の型を基準にしつつ、judgesystem の label / workflow / GitHub 運用へ合わせて再定義する

### Phase 5: Agent 実装の吸収

目的:

- `.claude/agents/*.md` だけでなく、実装クラスとしてもローカルに持つ

対象:

- `CoordinatorAgent`
- `IssueAgent`
- `CodeGenAgent`
- `ReviewAgent`
- `PRAgent`
- `DeploymentAgent`

補足:

- `TaskManagerAgent` は必要なら orchestration 側の論理役割として扱う
- まずは 6 実装を優先する

### Phase 6: 切替と整理

目的:

- 分散した source of truth を一つに寄せる

作業:

- `scripts/*` が package のみを参照する形へ統一
- workflow 内の古い参照パスや inline script を整理
- `scripts/lib/*` の重複ロジックを削減
- docs を最終構成に合わせて更新

## 9. まず最初にやるべき最小スライス

差分吸収を最短で前進させるなら、最初の 1 週間分は以下がよい。

1. `packages/agents` を workspace として成立させる
2. `ProjectsV2Client` と `DiscussionsClient` を `packages/agents` へ移す
3. `scripts/post-kpi-report.ts` と `scripts/generate-dashboard-data.ts` を package 経由へ切り替える
4. `scripts/label-state-machine.ts` を package 委譲にする

この順なら、すでに `judgesystem` に存在する断片を束ねる作業から始められる。
いきなり task decomposition や worktree 実行から始めるより、運用影響が見えやすく安全。

## 10. Definition of Done

以下を満たしたら「Miyabi 差分を judgesystem に吸収し切った」と言える。

- `packages/agents` が build / typecheck 可能
- `scripts/` の主要自動化ロジックが `packages/agents` に委譲されている
- `.github/workflows/` が存在しない Miyabi パスや仮想パスを参照しない
- runtime で Miyabi 元ディレクトリを参照しない
- state / project / reporting / routing / decomposition / orchestration の責務分担が文書化されている

## 11. 検証項目

各フェーズで最低限確認すること。

- `npm run build -w packages/agents`
- `npm run typecheck --workspace packages/agents`
- `npm run state:check -- --issue=<number>`
- `npx tsx scripts/post-kpi-report.ts --dry-run`
- `npx tsx scripts/generate-dashboard-data.ts`
- `npx tsx scripts/webhook-router.ts issue opened <number>`

補足:

- これらは Phase 0 で workspace 登録と最小実装が終わってから有効になる
- docs-only 変更の段階では、まだ失敗しても不自然ではない

## 12. メモ

今回の計画では、Miyabi は「参照元」であり「実行基盤」ではない。
最終的に必要なのは、`judgesystem` 自身の repo 構造と運用に沿った形で、必要差分をローカル実装として持ち切ることである。
