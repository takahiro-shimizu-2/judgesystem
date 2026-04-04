# Miyabi 差分吸収計画書

作成日: 2026-04-04

## 1. この計画の目的

やりたいことは、Miyabi の元ディレクトリにだけ存在する機能を `judgesystem` にそのまま複製することではない。
`judgesystem` 側でまだ吸収し切れていない差分を洗い出し、このリポジトリの構成と運用に合わせてローカル実装へ落とし切ることが目的である。

つまり方針は以下。

- Miyabi を丸ごと移植するのではなく、必要な機能差分だけを `judgesystem` に吸収する
- `judgesystem` の既存エントリポイントを壊さず、内部実装を段階的に置き換える
- 最終的に、運用上必要な Agent / state / sync / reporting / routing は `judgesystem` 単独で完結させる

## 2. 置き場所の前提整理

今回いちばん重要なのは、差分吸収先をどこに置くかである。

### 2.1 `.claude/` に置かない理由

`.claude/` は Claude Code 専用の資産を置く場所である。

- `.claude/agents/` は agent prompt 定義
- `.claude/skills/` は skill 定義
- `.claude/hooks/` は Claude 用 hook
- `.claude/settings.json` は Claude の設定

ここに runtime 実装を置くと、GitHub Actions や `tsx scripts/*.ts` が使う通常の Node 実行コードまで Claude 固有ディレクトリに依存することになる。
そのため、`.claude/` は runtime 実装の置き場にはしない。

### 2.2 `packages/` に置かない理由

この repo における `packages/` は、現状では次の意味合いが強い。

- `packages/backend`: Express API
- `packages/frontend`: React UI
- `packages/shared`: app 間共有の型・定数
- `packages/engine`: 判定エンジン

ここに運用自動化の実装本体を置くと、
「アプリ本体の runtime 機能なのか」「workflow 専用の自動化実装なのか」が分かりづらい。
とくに `packages/agents` は `.claude/agents` と名称も衝突し、誤解を招きやすい。

### 2.3 最終的な吸収先

今回の差分吸収先は `scripts/automation/` を中核にする。

理由:

- 既存 workflow の入口はすでに `scripts/*.ts`
- `scripts/lib/*` に共通実装を置く前例がすでにある
- GitHub Actions から `npx tsx scripts/...` で直接呼べる
- app runtime と Claude 専用資産のどちらにも寄りすぎない

## 3. 完了イメージ

この計画の完了条件は以下。

1. `judgesystem` が Miyabi の元ディレクトリを runtime 前提にしない
2. `scripts/` と `.github/workflows/` が呼ぶロジックの実体が `judgesystem` 内に揃う
3. `scripts/automation/` が repo 自動化のローカル中核実装として機能する
4. labels / Projects V2 / dashboard / webhook / task orchestration の実装が repo 内で一貫する
5. app runtime (`packages/*`) と Claude 専用資産 (`.claude/*`) の責務が混ざらない

## 4. いまの現実

### 4.1 judgesystem 側にはすでに受け皿がある

`judgesystem` は単なる空箱ではなく、すでに以下のような形を持っている。

- アプリ本体: `packages/backend`, `packages/frontend`, `packages/shared`, `packages/engine`
- GitHub 自動化: `.github/workflows/`
- 運用スクリプト: `scripts/`
- Claude 専用資産: `.claude/`

今後の作業は「新規に Agent システムを作る」よりも、
「既存の judgesystem 運用資産へ Miyabi 由来の差分を正しく収める」ことが本質である。

### 4.2 すでに部分的に取り込まれているもの

Miyabi 由来の機能は、すでに断片的には `judgesystem` へ入っている。

| 領域 | judgesystem 側の現状 |
|------|----------------------|
| state 管理 | `scripts/label-state-machine.ts` |
| Projects V2 | `scripts/lib/projects-v2.ts` |
| Discussions | `scripts/lib/discussions.ts` |
| dashboard 生成 | `scripts/generate-dashboard-data.ts` |
| KPI 投稿 | `scripts/post-kpi-report.ts` |
| weekly report | `scripts/generate-weekly-report.ts` |
| webhook routing | `scripts/webhook-router.ts` |
| project status 同期 | `scripts/update-project-status.ts` |
| GitHub workflow 接続 | `.github/workflows/*.yml` |
| Claude 側 agent 定義 | `.claude/agents/*.md` |

つまり問題は「何も無い」ことではなく、以下の状態にあること。

- Miyabi 由来の実装が `scripts/` に分散している
- 共通実装の source of truth が `scripts/lib` と workflow inline script に分かれている
- workflow ごとに参照パスや責務分担が揺れている
- `.claude/agents` の prompt 定義と runtime 実装の境界が曖昧

### 4.3 いまのブランチで片付けるべき試作

現時点のブランチには、`packages/agents` を前提にした試作がすでに混ざっている。

- root `package.json` の workspace に `packages/agents` が追加されている
- 一部 `scripts/*.ts` が `@judgesystem/agents/*` import を参照している
- `packages/agents/` に build 済みの足場コードがある

これは最終方針としては採用しない。
したがって Phase 0 では、`scripts/automation` の土台づくりと同時に、この試作を解消する。

## 5. 最終アーキテクチャ

### 5.1 基本方針

責務分担は以下に固定する。

- `.claude/`
  - Claude Code 専用資産
  - prompt / hook / skill / settings のみ
- `scripts/`
  - CLI 互換を維持する入口
  - GitHub Actions から直接呼ばれるファイル
- `scripts/automation/`
  - repo 運用自動化の実装本体
  - GitHub / state / routing / reporting / decomposition / orchestration / agent 実装を保持
- `packages/shared`
  - app 側と共有すべき型・定数のみ
- `packages/backend`, `packages/frontend`, `packages/engine`
  - 業務アプリ本体

### 5.2 目標ディレクトリ像

```text
.claude/
  agents/
  hooks/
  skills/
  settings.json

scripts/
  tsconfig.json
  label-state-machine.ts
  update-project-status.ts
  generate-dashboard-data.ts
  generate-weekly-report.ts
  post-kpi-report.ts
  webhook-router.ts
  automation/
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
    reporting/
      automation-reporting.ts
      dashboard-reporting.ts
      repository-metrics.ts
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
      project-status.ts

packages/
  backend/
  frontend/
  shared/
  engine/
```

### 5.3 組み込み方

組み込み方は次の一本に揃える。

1. `.github/workflows/*` は `scripts/*.ts` を起動する
2. `scripts/*.ts` は薄い入口として引数処理と exit code だけを持つ
3. 実体ロジックは `scripts/automation/*` から import する
4. `.claude/agents/*.md` は Claude の意思決定手順を記述するが、runtime 依存にはしない

### 5.4 技術的な組み込みルール

実装時の技術ルールも先に固定しておく。

- root `package.json` の workspace は `packages/backend`, `packages/frontend`, `packages/shared` を基本とし、automation 用 workspace は増やさない
- runtime 実装は package alias ではなく `scripts/*.ts` から `./automation/...` の相対 import で参照する
- GitHub Actions は引き続き `npx tsx scripts/<entry>.ts` を実行し、workflow 側の入口は変えない
- `scripts/tsconfig.json` は script/automation 専用の型チェック単位として追加する
- `scripts/lib/*` は段階的に `scripts/automation/*` へ移し、移行完了後に整理する
- 既存の `packages/agents` 試作は採用しないため、Phase 0 で import と workspace 定義を解消する

## 6. 機能差分マトリクス

| 機能 | Miyabi 側 | judgesystem 側 | 吸収方針 |
|------|-----------|----------------|----------|
| state / labels | task-manager + cli scripts | `scripts/label-state-machine.ts` のみ | `scripts/automation/state` に集約し、script は薄い CLI にする |
| Projects V2 | task-manager / github utilities | `scripts/lib/projects-v2.ts` | `scripts/automation/github/projects-v2.ts` に昇格 |
| Discussions | cli / github utility | `scripts/lib/discussions.ts` | `scripts/automation/github/discussions.ts` に昇格 |
| KPI / dashboard | reporting scripts | `scripts/post-kpi-report.ts`, `scripts/generate-dashboard-data.ts`, `scripts/generate-weekly-report.ts` | reporting ロジックを `scripts/automation/reporting` に集約 |
| webhook routing | cli scripts | `scripts/webhook-router.ts` | routing ルールを `scripts/automation/adapters` に集約 |
| task decomposition | task-manager | なし | `scripts/automation/decomposition` に独立配置 |
| DAG / execution | coding-agents + task-manager | なし | `scripts/automation/orchestration` に吸収 |
| agent 実装 | miyabi-agent-sdk | `.claude/agents` は prompt のみ | 実装本体は `scripts/automation/agents` に吸収 |
| GitHub label sync | task-manager | 断片的 | `scripts/automation/sync` へ統合 |
| worktree 並行実行 | task-manager / coding-agents | なし | `scripts/automation/orchestration` に吸収 |

## 7. 設計原則

### 7.1 吸収であって複製ではない

Miyabi のパス構造や package 境界をそのまま再現しない。
`judgesystem` に必要な責務単位へ再配置する。

### 7.2 `.claude` は runtime 依存先にしない

`.claude` は Claude 専用の設定・prompt・hook のみを持つ。
GitHub Actions や通常の `tsx` script から `.claude` 配下のコードを runtime import しない。

### 7.3 `packages/*` は app runtime と shared runtime に限定する

`packages/*` は backend / frontend / shared / engine のようなアプリ本体と共有 runtime のために使う。
repo 運用自動化の実装本体はここへ混ぜない。

### 7.4 `scripts/*.ts` は入口、`scripts/automation/*` は本体

`scripts/*.ts` には最終的に再利用ロジックを残さない。
再利用可能なロジックは `scripts/automation/*` に移し、script は引数解釈と exit code 制御だけを担う。

### 7.5 app 共有が必要なものだけ `packages/shared` へ出す

自動化内部だけで使う型やロジックは `scripts/automation/*` に閉じ込める。
frontend/backend も参照する定数や型だけを `packages/shared` に昇格する。

## 8. 実装フェーズ

### Phase 0: 配置方針の切り替え

目的:

- `packages/agents` 前提をやめ、`scripts/automation` を正式な差分吸収先に切り替える

作業:

- 計画書を `scripts/automation` 前提に更新
- `scripts/tsconfig.json` を追加して script automation 用の型チェック単位を作る
- `scripts/automation/` の最小ディレクトリを作る
- root `package.json` から `packages/agents` workspace を外す
- `packages/agents/` 試作を段階的に廃止する
- `@judgesystem/agents/*` import を `scripts/automation/*` 参照へ戻す方針を確定する

成果物:

- `npx tsc -p scripts/tsconfig.json --noEmit` の土台ができる
- runtime の参照先が `packages/agents` ではなく `scripts/automation` に揃う準備が整う

### Phase 1: GitHub 自動化の共通部を吸収

目的:

- 分散している GitHub utility を `scripts/automation` に集約する

作業:

- `scripts/lib/projects-v2.ts` を `scripts/automation/github/projects-v2.ts` へ移す
- `scripts/lib/discussions.ts` を `scripts/automation/github/discussions.ts` へ移す
- `repository-metrics` / `automation-reporting` も責務に応じて `scripts/automation/reporting` へ寄せる

成果物:

- reporting / project / discussion 系が script 本体から分離される

### Phase 2: state / label / sync を吸収

目的:

- label-state-machine 系を単独スクリプトから shared ロジックへ昇格する

作業:

- `scripts/automation/state/task-state-machine.ts`
- `scripts/automation/state/label-state-bridge.ts`
- `scripts/automation/state/label-state-machine.ts`
- `scripts/automation/sync/github-label-sync.ts`

切替方針:

- `scripts/label-state-machine.ts` は CLI 互換を維持
- 内部の `STATE_TRANSITIONS` とラベル操作は `scripts/automation` 側へ委譲

### Phase 3: webhook / dashboard / project status の吸収

目的:

- workflow から見た自動化入口の内部実装を `scripts/automation` に統一する

作業:

- `scripts/webhook-router.ts` の routing ルールを package 化ではなく automation 化
- `scripts/generate-dashboard-data.ts` の生成ロジックを `scripts/automation/reporting` へ移す
- `scripts/update-project-status.ts` の project status 更新ロジックを `scripts/automation/adapters` へ移す
- `scripts/post-kpi-report.ts` と `scripts/generate-weekly-report.ts` の posting ロジックを `scripts/automation/reporting` へ移す

成果物:

- workflow は従来の script を呼び続けても、実体ロジックは `scripts/automation` に一本化される

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
- 関連する型定義を `scripts/automation/*` 配下に整理

注意点:

- decomposition は `scripts/automation/decomposition` を独立責務として置く
- DAG / executor / task-manager は `scripts/automation/orchestration` に置く
- Claude の prompt 定義と混同しないよう、`.claude/agents` と `scripts/automation/agents` は役割を明記する

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

- `.claude/agents` は prompt 定義として残す
- runtime 実装は `scripts/automation/agents` に置く

### Phase 6: 切替と整理

目的:

- 分散した source of truth を一つに寄せる

作業:

- `scripts/*` が `scripts/automation/*` のみを参照する形へ統一
- workflow 内の古い参照パスや inline script を整理
- `scripts/lib/*` の重複ロジックを削減または移設
- docs を最終構成に合わせて更新

## 9. まず最初にやるべき最小スライス

差分吸収を最短で前進させるなら、最初の 1 週間分は以下がよい。

1. `scripts/tsconfig.json` を作る
2. `scripts/automation/github/projects-v2.ts` と `scripts/automation/github/discussions.ts` を作る
3. `scripts/post-kpi-report.ts` と `scripts/generate-dashboard-data.ts` を `scripts/automation` 経由へ切り替える
4. `scripts/label-state-machine.ts` を `scripts/automation/state` 委譲にする

この順なら、すでに `judgesystem` に存在する断片を束ねる作業から始められる。
いきなり task decomposition や worktree 実行から始めるより、運用影響が見えやすく安全。

## 10. Definition of Done

以下を満たしたら「Miyabi 差分を judgesystem に吸収し切った」と言える。

- `scripts/automation/` が repo 自動化の source of truth になっている
- `scripts/*.ts` の主要自動化ロジックが `scripts/automation/*` に委譲されている
- `.github/workflows/` が存在しない Miyabi パスや仮想パスを参照しない
- runtime で Miyabi 元ディレクトリを参照しない
- `.claude/*` と runtime 実装の責務分担が明確
- app runtime (`packages/*`) と運用自動化 (`scripts/automation/*`) の境界が文書化されている

## 11. 検証項目

各フェーズで最低限確認すること。

- `npx tsc -p scripts/tsconfig.json --noEmit`
- `npm run state:check -- --issue=<number>`
- `npx tsx scripts/post-kpi-report.ts --dry-run`
- `npx tsx scripts/generate-weekly-report.ts`
- `npx tsx scripts/generate-dashboard-data.ts`
- `npx tsx scripts/webhook-router.ts issue opened <number>`

補足:

- これらは `scripts/tsconfig.json` と `scripts/automation/` の最小構成ができてから有効になる
- docs-only 変更の段階では、まだ失敗しても不自然ではない

## 12. メモ

今回の計画では、Miyabi は「参照元」であり「実行基盤」ではない。
最終的に必要なのは、`judgesystem` 自身の repo 構造と運用に沿った形で、必要差分をローカル実装として持ち切ることである。
