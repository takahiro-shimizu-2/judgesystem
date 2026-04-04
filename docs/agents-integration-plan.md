# Miyabi 差分吸収計画書

作成日: 2026-04-04
最終更新: 2026-04-04

## 1. この計画の目的

やりたいことは、Miyabi の元ディレクトリにだけ存在する仕組みを `judgesystem` に雑に複製することではない。
やるべきことは、`judgesystem` 側でまだ吸収し切れていない差分を洗い出し、
この repo の責務分担に合わせて正しい場所へ取り込むことである。

今回の再設計で重視すること:

- Claude Code 用の定義、Codex 用の定義、GitHub Actions の配線、repo 内 runtime を混ぜない
- すでに `judgesystem` に入っている実装は、捨てる前提ではなく活かせるものを活かす
- ただし、誤った前提で先に進めてしまった部分は、手当て対象として明示する
- `judgesystem` が `../Miyabi` を runtime 前提にしない状態を最終目標にする

## 2. 調査手順と調査結果

### 2.0 調査手順を固定する

以後の判断は、次の順番を崩さない。

1. 公式契約を確認する
   - Claude Code
   - Codex
   - GitHub Actions / GitHub API
2. 外部元システムを読む
   - `../Miyabi`
   - `../gitnexus-stable-ops`
   - `../context-and-impact`
   - 必要なら `../agent-skill-bus`
3. `judgesystem` 現状を読む
   - `.claude/*`
   - `AGENTS.md`
   - `scripts/automation/*`
   - `scripts/context-impact/*`
   - `.github/workflows/*`
   - `project_memory/*`
4. 差分を写像する
   - repo-local runtime に吸収する
   - external bridge として残す
   - 今回の計画では吸収しない
5. その写像に従って計画を更新し、初めて実装へ進む

この順番にする理由は、
「Claude / Codex / GitHub の仕様を無視して runtime を決める」と、
見かけだけ Miyabi 風で内部は衝突した状態になりやすいためである。

この計画は、`judgesystem` 内だけでなく、最低でも以下を確認したうえで組み直す。

- Claude Code の公式仕様
- Codex の公式仕様
- GitHub Actions / reusable workflow / composite action の公式仕様
- `judgesystem` 現在構成
- `../Miyabi`
- `../context-and-impact`
- `../gitnexus-stable-ops`

### 2.1 Claude Code の現実

Claude Code の公式仕様上、`.claude/` は Claude Code の設定面である。

- `.claude/settings.json` は project settings
- `.claude/agents/*.md` は subagent 定義
- `.claude/commands/*.md` は custom command だが、公式には skill の方が推奨
- hooks は `.claude/settings.json` や agent/skill frontmatter から設定される

重要なのは、`.claude/agents/*.md` がそのまま GitHub Actions や Node runtime の実装ではない、という点である。
Claude Code はそれらを「Claude が読む定義」として扱う。

`judgesystem` の現状:

- `.claude/agents/*.md` は 6 agent の frontmatter と実行方針を持っている
- `.claude/settings.json` では `PreToolUse` / `PostToolUse` hook が定義されている
- `.claude/commands/*.md` には `miyabi` CLI を前提にした command が残っている
- `.claude/agents/*.md` の一部には、過去の自動 codegen / scoring / remote PR / deploy 前提が残っている
- `.claude/commands/*.md` の一部にも、full autonomy や即時 workflow 実行を前提にした説明が残っている

このため、`.claude/agents` を runtime 実装そのものと見なす設計は不適切である。
さらに、runtime は `.claude/agents` の要約を registry / brief に使うため、
agent 定義そのものの truthfulness も重要である。
同様に、Claude 用 command surface も現在の runtime contract に合わせて説明を揃える必要がある。

### 2.2 Codex の現実

Codex の公式説明では、repo 内の `AGENTS.md` が Codex を案内するための主要な repo ルールである。
また、Codex は task ごとに独立した実行環境で動き、リポジトリ内の指示やテストコマンドに従う前提である。

今回の判断に効く点:

- Codex へ repo の作業ルールを伝える主軸は `AGENTS.md`
- `.claude/agents/*.md` を Codex が runtime 定義として自動利用する前提は置けない
- `.codex/` は Codex 固有の project-scoped 設定を置く場所になりうるが、共通 runtime の source of truth ではない

`../Miyabi/.codex/config.toml` でも、
「root の `AGENTS.md` を主たる repo ルールとして使い、`.codex/config.toml` では Codex 固有挙動だけを補う」
という整理が取られている。

### 2.3 GitHub Actions / `.github` の現実

GitHub Actions の公式仕様上、役割は次のように分かれる。

- `.github/workflows/*.yml`
  - workflow のトリガーと job 配線
- `.github/actions/*`
  - composite action の置き場として推奨される
- reusable workflow
  - `.github/workflows/` 配下に置く

つまり `.github` は GitHub に読ませる定義置き場であり、
repo 内の TypeScript 実装本体の置き場ではない。

したがって今回の自動化本体を `.github` に寄せるのではなく、
`.github/workflows` はあくまで入口、
実装本体は `scripts/automation` に置くのが自然である。

### 2.4 GitNexus の現実

`judgesystem` では GitNexus を二重に見なければいけない。

1. vanilla の `gitnexus` CLI / index
2. `../gitnexus-stable-ops` による stable wrapper / agent-graph 拡張

現環境の確認結果:

- `npx gitnexus --version` は `1.5.3`
- `npx gitnexus status` は正常に使える
- `npx gitnexus impact` も使える
- ただし `npx gitnexus detect-changes` は現在の CLI には存在しない
- いま利用できている `gitnexus_agent_context` / `gitnexus_agent_status` / `gitnexus_agent_list` は、`../gitnexus-stable-ops` 側の Agent Graph MCP 由来である

つまり、
AGENTS / CLAUDE / 周辺 skill 群に書かれている「GitNexus の理想 API」と、
この repo でいま実際に使える GitNexus の機能にはズレがある。

設計上の結論:

- GitNexus は重要な前提だが、計画書は「実際に使える CLI / wrapper / MCP」に合わせて書く
- `detect_changes` を前提にする設計は一度外す
- `impact` が不安定なケースは `gitnexus-stable-ops` の safe wrapper を考慮する

### 2.5 `context-and-impact` の現実

`context-and-impact` は補助スクリプトではなく、独立した前段パイプラインである。

所有している責務:

- `.ai/execution-plan.json` 初期化
- `project_memory/tasks.json` / `project_memory/worklog.md` 運用
- GitNexus / search / quality gate / classify / record-run の流れ
- `agent-skill-bus` との接続

`judgesystem` 側の現状:

- `pipeline:l1` / `pipeline:quality` / `pipeline:classify` は repo-local wrapper から `CONTEXT_AND_IMPACT_ROOT` または `../context-and-impact` を参照する
- `plan-init/status/clean` と `estack-enforcer` は repo-local vendor に切り出した
- `record-run.sh` は `context-and-impact` を経由せず、`agent-skill-bus` へ直接 bridge する
- `pipeline:dashboard` は `agent-skill-bus` bridge を要求する

ここは非常に重要で、
Miyabi 差分吸収とは別に、
`judgesystem` の運用自動化が `context-and-impact` をどう位置づけるかを計画に含める必要がある。

### 2.6 Miyabi 元ディレクトリの現実

`../Miyabi` は単一 repo 完結の単純な構造ではない。

- `packages/cli` に `miyabi` CLI がある
- `packages/miyabi-agent-sdk` と `packages/coding-agents` に class-based agent runtime がある
- `.claude/` は Claude plugin / command / agent 資産として使われている
- `.codex/` は Codex project config と subagent 設定を持つ
- `packages/github-projects` や webhook / state machine / dashboard / reporting も同居している
- `README.md` は 7 coding agents、53 labels、16 workflows、`Issue -> Code -> Test -> PR` を中核価値としている
- `CodeGenAgent` / `ReviewAgent` / `PRAgent` / `DeploymentAgent` は、それぞれ class として実コード生成、点数評価、remote PR 作成、deploy を担う
- 一方で `agent-skill-bus`、`gitnexus-stable-ops`、`context-and-impact` など、別 repo の外部基盤も前提にしている

つまり Miyabi は「ふるまい」だけ見れば参考になるが、
repo 構造や package 境界をそのまま `judgesystem` に持ち込む対象ではない。

### 2.7 元ディレクトリの能力をどう分類するか

`../Miyabi` の能力は、そのまま 1 パッケージ分を移植するのではなく、次の 3 つに分けて扱う。

| 分類 | 例 | judgesystem での扱い |
|----|----|----|
| repo-local runtime として吸収する | Issue 分解、DAG、label state、review 実行、PR 作成、deploy 起動、workflow 配線、Projects V2 / reporting | `scripts/automation/*` と `.github/workflows/*` に吸収する |
| external bridge として明示維持する | `context-and-impact`, `agent-skill-bus`, `gitnexus-stable-ops`, optional `miyabi` CLI/MCP | override 付き bridge として残す |
| 今回の計画では吸収しない | Miyabi CLI の 25 command 面、MCP bundle 全体、business agents、voice/release/social、Water Spider cluster、web dashboard 全体 | 参照はするが、`judgesystem` には持ち込まない |

重要な判断:

- Miyabi の **7 coding agents** を、そのまま `judgesystem` に 7 class として再現しない
- とくに `TestAgent` は、現行 `judgesystem` では独立 agent よりも `ReviewAgent` が実行する review/test capability に吸収する
- 逆に、`PRAgent` の remote PR 作成や `CodeGenAgent` の実コード生成のように、full autonomy に直結する能力は capability binding として明示実装する

### 2.8 full autonomy を開けるときの前提

`judgesystem` で欲しいのは「Miyabi の monorepo を再現すること」ではなく、
`judgesystem` 自身が full autonomy を安全に持てること、である。

そのため full autonomy は、次の capability 単位で段階的に開ける。

1. `CodeGenAgent`
   - implementation brief ではなく、実際の code-writing binding を持つ
2. `ReviewAgent`
   - 実行した local checks を集約し、必要なら score / retry / escalation を持つ
3. `PRAgent`
   - local artifact ではなく GitHub 上の draft PR を作成できる
4. `DeploymentAgent`
   - gate 付き command 実行だけでなく、deploy contract と失敗時 handling を持つ
5. workflow
   - `--dry-run` 固定ではなく、planning / execute を明示切替できる

つまり、full autonomy の対象は「agent 名」ではなく「副作用つき capability」である。

## 3. 境界をどう切るか

調査結果を踏まえ、責務分担は次で固定する。

| 層 | 置き場所 | 役割 | 今回の扱い |
|----|----------|------|------------|
| Claude Code 面 | `.claude/` | subagent / command / hook / MCP 設定 | 残す。Claude 用 source of truth |
| Codex 面 | `AGENTS.md` と必要なら `.codex/` | Codex への repo 指示 | 残す。Codex 用 source of truth |
| GitHub 面 | `.github/workflows/`, `.github/actions/` | trigger / workflow / reusable step | 残す。配線のみ |
| Repo runtime | `scripts/automation/` | 実行ロジック本体 | ここを育てる |
| CLI entrypoint | `scripts/*.ts` | workflow / npm script から呼ばれる入口 | 薄い adapter として維持 |
| Context pipeline | `scripts/context-impact/*.sh` + `../context-and-impact` | 実行前の context / quality / audit | 重要な外部 bridge として明示 |
| App runtime | `packages/*` | backend / frontend / shared / engine | 今回の自動化本体は置かない |

### 3.1 今回やらないこと

- `.claude/agents/*.md` を Node runtime 実装そのものと見なさない
- 先に `CoordinatorAgent` / `CodeGenAgent` などの固定 class ファイルを量産しない
- `.github` に TypeScript 実装本体を寄せない
- `packages/*` に repo automation 本体を混ぜない
- `GitNexus detect_changes` のような、現環境で未提供の API を前提に計画を組まない

### 3.2 今回やること

- `.claude/agents/*.md` を Claude 用 prompt / metadata の正本として活かす
- runtime 側は `.claude/agents` を読む dynamic registry / loader として組む
- 副作用を伴う処理は handler として明示実装する
- handler がない agent は generic fallback で扱う

## 4. judgesystem の現状把握

### 4.1 すでに取り込まれているもの

`judgesystem` は空箱ではない。すでに次が存在する。

| 領域 | 現状 | 判断 |
|------|------|------|
| GitHub utility | `scripts/automation/github/*` | 維持してよい |
| reporting | `scripts/automation/reporting/*` | 維持してよい |
| label / state | `scripts/automation/state/*`, `scripts/automation/sync/*` | 維持してよい |
| decomposition | `scripts/automation/decomposition/*` | 維持してよい |
| orchestration | `scripts/automation/orchestration/*` | 維持してよいが contract を修正する |
| adapter entrypoint | `scripts/automation/adapters/*` | 維持してよい |
| CLI entrypoint | `scripts/*.ts` | 薄い入口として維持 |
| workflow | `.github/workflows/*.yml` | 事実に合わせて見直す |
| Claude agent 定義 | `.claude/agents/*.md` | source of truth 候補として活かす |

### 4.2 すでに進めてしまっている実装と、その手当て

今回とくに手当てが必要なのは次である。

#### A. `agents:parallel:exec` は「planning substrate」まで進んでいる

現在の実装:

- `scripts/agents-parallel-exec.ts`
- `scripts/automation/adapters/agents-parallel-exec.ts`
- `scripts/automation/decomposition/*`
- `scripts/automation/orchestration/*`

これは無駄ではない。
ただし意味づけを変える必要がある。

変更前の誤解:

- 6 agent の実体 class をこれからローカル実装する前提

修正後の位置づけ:

- Issue 分解
- DAG 構築
- 実行計画作成
- 実行レポート作成

を担う orchestration substrate として残す。

#### B. workflow と docs が実装以上のことを言っている

`autonomous-agent.yml` には、現状ではまだ成立していない表現がある。

- CodeGenAgent が実際に product code を書いたことを前提とした PR テンプレート
- ReviewAgent が 80 点以上を判定した体裁
- tests generated / security scan passed などの断定

現時点の `agents:parallel:exec` は planning-first を土台にしつつ、
issue / review / pr / deployment と safe codegen brief handler までは接続済みである。
ただし、そこで言う接続済み capability はあくまで repo-local / gate 付きの範囲である。
現在は delegated code-writing command と remote draft PR は opt-in gate 付き、
外部 model を使った本当の product code 生成や強い deploy 実行は依然として未保証である。
ここは計画上も実装上も truthfulness を回復する必要がある。

#### C. `.claude` 側に `miyabi` 依存が残っている

残っているもの:

- `.claude/mcp-servers/miyabi-integration.js`
- `.claude/mcp.json`
- `.claude/commands/miyabi-*.md`
- `.claude/settings.json` の Miyabi 関連 permission / hook 前提

これは Claude 用 surface として残すか、repo 内 runtime へ寄せるかを明確に決める必要がある。
少なくとも現段階では「Claude 面の外部 bridge」であり、
`judgesystem` の local runtime 完結とは別問題である。

現時点では、`miyabi-*.md` は external bridge surface であることと、
repo-local 等価入口が別にあることを明記する方向で truthfulness を回復する。

#### D. root dependency に sibling repo 前提が残っている

`package.json` の root runtime dependency からは `miyabi` を外したが、
sibling repo 前提が完全に消えたわけではない。

- `agent-skill-bus` は `pipeline:dashboard` / `pipeline:record` の optional bridge として残っている

また、`.claude/mcp-servers/miyabi-integration.js` は
optional bridge として `MIYABI_CLI` / `MIYABI_ROOT` override を優先し、
次に `node_modules/.bin/miyabi`、最後に `../Miyabi/packages/cli` を probe する形へ整理した。
つまり `../Miyabi` は repo runtime の必須依存ではなくなったが、
Claude 面の外部 bridge 候補としては残っている。

同様に `scripts/context-impact/common.sh` の `agent-skill-bus` bridge も、
`AGENT_SKILL_BUS_BIN` / `AGENT_SKILL_BUS_ROOT` override を優先し、
次に local install、最後に `../agent-skill-bus` を probe する形へ整理できる。

さらに `pipeline:*` script や `scripts/context-impact/*.sh` も
`CONTEXT_AND_IMPACT_ROOT` を優先し、最後に `../context-and-impact` を fallback として参照する。

したがって現時点では、sibling 参照は残っているが、
repo runtime の必須依存ではなく「override / local install 後の optional fallback」へ縮減できている。

#### E. AGENTS / CLAUDE / 周辺 skill の GitNexus 記述にズレがある

現状のズレ:

- `gitnexus_detect_changes()` 前提になっている
- `gitnexus_query` / `gitnexus_context` / `gitnexus_impact` を MCP 直呼びする前提が強い
- 実際のこの環境では `gitnexus-stable-ops` 由来の agent graph MCP と、vanilla CLI が混在している

ここは docs と運用ルールを現実に寄せる必要がある。

### 4.3 既存 substrate の blast radius

すでに進めてしまった実装の主要 symbol は、現時点では LOW である。

| Symbol | GitNexus 結果 | 含意 |
|--------|---------------|------|
| `runAgentsParallelExecCli` | LOW | `scripts/agents-parallel-exec.ts` からのみ直結 |
| `TaskManager` | LOW | adapter からの利用に留まる |
| `TaskExecutor` | LOW | `TaskManager` 経由の局所変更で済む |
| `WebhookEventRouter` | LOW | webhook adapter と CLI 入口の範囲に収まる |

したがって、
いま必要なのは substrate の破棄ではなく、
その上に載せる「agent 実装モデル」を fixed class 前提から registry / handler 前提へ直すことである。

## 5. 改訂後の目標アーキテクチャ

### 5.1 基本方針

`judgesystem` 側で持つべきものは次の 3 層である。

1. **Prompt / metadata の正本**
   - `.claude/agents/*.md`
2. **Repo 内 runtime**
   - `scripts/automation/*`
3. **必要なら外部 bridge**
   - `scripts/context-impact/*.sh`
   - 一部 `.claude/mcp-servers/*`

### 5.1.1 元ディレクトリからの capability 写像

`../Miyabi` から `judgesystem` へ吸収する際は、「ファイルを持ってくる」ではなく
「能力をどこへ写像するか」で判断する。

| Miyabi 側 capability | Miyabi 側の主な実体 | judgesystem current | judgesystem target |
|----|----|----|----|
| Coordinator / orchestration | `packages/coding-agents/coordinator/*`, `packages/cli/scripts/parallel-executor.ts` | `scripts/automation/decomposition/*`, `scripts/automation/orchestration/*`, `scripts/automation/adapters/agents-parallel-exec.ts` | 維持。planning substrate と execution substrate の中核にする |
| Issue analysis / state sync | `IssueAgent` + label state machine + webhook routing | `scripts/automation/agents/handlers/issue.ts`, `scripts/automation/state/*`, `scripts/automation/adapters/webhook-router.ts` | 維持。state machine と event routing を repo-local runtime として育てる |
| Code generation | `CodeGenAgent` が実コード生成・テスト生成・ドキュメント生成を行う | `scripts/automation/agents/handlers/codegen.ts` は implementation brief を必ず生成し、`AUTOMATION_ENABLE_CODEGEN_WRITE=true` と `AUTOMATION_CODEGEN_COMMAND` がある場合だけ delegated writer command を repo root で実行する | delegated writer binding を基盤にしつつ、必要なら external-model / stronger write contract へ拡張する |
| Test execution | Miyabi では `TestAgent` と codegen/review 周辺で別能力として存在する | 独立 agent なし。`ReviewAgent` が `typecheck` / `test` を実行 | 当面は review/test capability に吸収する。必要になれば独立 capability として切り出す |
| Review / quality gate | `ReviewAgent` が scoring / comment / escalation を行う | `scripts/automation/agents/handlers/review.ts` は repo root で configured checks を実行し、score / retry / escalation を review artifact と execution report へ残す | security / coverage / richer comment 契約を必要に応じて追加する |
| PR creation | `PRAgent` が GitHub に draft PR を作成し、labels / reviewers も扱う | `scripts/automation/agents/handlers/pr.ts` は local draft artifact を常に生成し、`AUTOMATION_ENABLE_PR_WRITE=true` の場合だけ remote draft PR を作成または更新する | reviewer / label / mergeability など周辺 contract を段階追加する |
| Deployment | `DeploymentAgent` が build / test / deploy / health check / rollback を扱う | `scripts/automation/agents/handlers/deployment.ts` は env-gated deploy contract を実行し、provider / target metadata、approval gate、optional build / preflight / health check / rollback と deployment artifact を残す。`AUTOMATION_DEPLOY_USE_PROVIDER_PRESET=true` のときは repo-local `cloud-run/backend|frontend` preset を解決できる | Cloud Run 以外の provider 固有 orchestration や高度な deploy policy を必要に応じて追加する |
| Workflow execution | `.github/workflows/autonomous-agent.yml` が execute mode で動く | `autonomous-agent.yml` は `workflow_dispatch` で planning / execute を明示切替し、issue/comment trigger は planning を既定に保つ。`AUTONOMOUS_AGENT_LABEL_EXECUTE_ENABLED` / `AUTONOMOUS_AGENT_COMMENT_EXECUTE_ENABLED` repo variable が開いている場合だけ event-triggered execute を許可し、実行した capability だけを summary/comment へ出す。protected deploy 用には `autonomous-deploy-execute.yml` を分離し、GitHub Environment approval と `DeploymentAgent` approval metadata をそろえて扱い、Cloud Run preset 用 env も runtime に通す | provider-specific orchestration の高度化を必要に応じて追加する |
| Projects V2 / reporting | `packages/github-projects`, KPI / dashboard scripts | `scripts/automation/github/*`, `scripts/automation/reporting/*` | すでに repo-local runtime 化済み。維持して活かす |
| Context pipeline | `context-and-impact` とその wrapper | `scripts/context-impact/*` bridge + local vendor 部分 | repo-local vendor と external bridge の hybrid を維持する |
| GitNexus stable ops | `gitnexus-stable-ops` wrapper / Agent Graph | current CLI + `gitnexus_agent_*` MCP + optional sibling wrapper | symbol analysis は local CLI、agent graph は wrapper/MCP として分離記載する |
| Skill health / dashboard | `agent-skill-bus` | `pipeline:record`, `pipeline:dashboard` の bridge | external bridge のまま維持する |
| Miyabi CLI / MCP bundle 全体 | `packages/cli`, `packages/mcp-bundle`, `miyabi auto` など | optional Miyabi MCP bridge のみ | `judgesystem` には持ち込まない。必要なら optional external bridge として使う |

ここで重要なのは、
`judgesystem` が吸収すべき対象は **Miyabi の monorepo 構造** ではなく
**Miyabi が提供している能力のうち、この repo 自身が持つべき runtime contract** だけ、という点である。

### 5.2 agent 実装は fixed class ではなく registry / handler で組む

新しい考え方は次である。

- `.claude/agents/*.md` を走査する
- frontmatter から `name`, `description`, `authority`, `escalation` を読む
- markdown body から runtime brief に使う要約を抽出する
- runtime はそれを registry に変換する
- registry から handler を引ける agent だけ副作用つき実行を行う
- handler が無いものは generic fallback に流す

これにより、
`.claude/agents` 側に定義が増えても、
metadata の吸収は自動化できる。
一方で、危険な副作用は handler が明示されない限り勝手には走らない。

### 5.3 目標ディレクトリ像

```text
.claude/
  agents/
  commands/
  hooks/
  mcp-servers/
  settings.json

scripts/
  agents-parallel-exec.ts
  label-state-machine.ts
  update-project-status.ts
  generate-dashboard-data.ts
  generate-weekly-report.ts
  post-kpi-report.ts
  webhook-router.ts
  context-impact/
    plan-init.sh
    plan-status.sh
    plan-clean.sh
    record-run.sh
  automation/
    core/
    github/
    state/
    sync/
    reporting/
    decomposition/
    orchestration/
    agents/
      registry.ts
      markdown-loader.ts
      handler-contract.ts
      capability-router.ts
      handlers/
        issue.ts
        review.ts
        pr.ts
        deployment.ts
      fallback/
        generic-agent.ts
    adapters/

.github/
  workflows/
  actions/
```

### 5.4 重要な contract

#### `.claude/agents/*.md`

- Claude Code が読む prompt / rule / escalation 定義
- runtime 側の metadata source
- ただし Node runtime が直接 import するコードではない

#### `scripts/automation/agents/registry.ts`

- `.claude/agents` を走査して registry を組み立てる
- handler がある agent / ない agent を仕分ける

#### `scripts/automation/agents/handlers/*`

- GitHub label 更新
- issue comment
- PR 作成
- deploy 起動
- review 結果反映

など、実際に repo / GitHub に副作用を起こす責務を持つ。

ただし `judgesystem` では、いきなり full automation を有効にしない。
Phase 3 の最初の実装スライスは、次の安全境界で入れる。

- `issue.ts`
  - 既存の `scripts/automation/state/label-state-machine.ts` を使い、
    `agent:issue` 付与と `state:analyzing` 遷移だけを行う
  - `GITHUB_TOKEN` が無い場合は skip する
- `review.ts`
  - まずは repo root で repo-local の `npm run typecheck` と `npm test` を実行し、
    結果を review summary として返す
  - 後続では score / retry / escalation / artifact を追加する
  - token がある場合のみ `agent:review` と `state:reviewing` を同期する
- `pr.ts`
  - 最初は GitHub 上の PR を直接作らず、
    `.ai/parallel-reports/` に draft PR 用 markdown artifact を生成する
  - remote PR 作成は明示 opt-in gate を設けてから有効化する
- `deployment.ts`
  - デフォルトでは deploy しない
  - 明示 env flag と command が与えられた場合のみ実行する
  - 後続では preflight / health / rollback / artifact を追加する
- `CodeGenAgent`
  - `.claude/agents/codegen-agent.md` の metadata をもとに
    `.ai/worktrees/...` 配下へ implementation brief を生成する
  - `AUTOMATION_ENABLE_CODEGEN_WRITE=true` と `AUTOMATION_CODEGEN_COMMAND` が与えられた場合だけ、
    repo root で explicit code-writing command を実行する
  - token がある場合のみ `agent:codegen` と `state:implementing` を best-effort で同期する
  - 外部 model を使った product code 自動生成や remote push は、将来の stronger binding まで前提にしない

つまり、
Phase 3 は「危険な副作用を伴う full autonomy を解禁する段階」ではなく、
既存の state/reporting/runtime substrate と安全に接続できる最小 handler を入れる段階である。

#### `scripts/automation/orchestration/*`

- decomposition
- DAG
- execution plan
- worktree assignment
- execution report

を担う共通 substrate として維持する。

`TaskExecutor` は「固定 agent class を呼ぶ実装」ではなく、
registry + handler router を呼ぶ実装へ寄せる。

## 6. `context-and-impact` と GitNexus の扱い

### 6.1 `context-and-impact` は今回の計画に含める

理由:

- `project_memory/` 運用を持っている
- `.ai/execution-plan.json` を持っている
- GitNexus / quality / classify / record-run の前段パイプラインを持っている
- `judgesystem` からすでに参照されている

したがって、
今回の計画では `context-and-impact` を「無視する外部物」として扱わない。
ただし、Miyabi 吸収と完全に同一の話でもないため、
次の二択を明示する。

### 6.2 `context-and-impact` の選択肢

#### Option A: 外部 bridge として明示維持

- `scripts/context-impact/*.sh` を公式な bridge として残す
- `package.json` の `pipeline:*` script も bridge として残す
- `judgesystem` 単独完結の DoD からは切り分ける
- 前提ツールと Node/Python version を文書化する

#### Option B: judgesystem へ最小限 vendor する

- `plan-init/status/clean`
- `estack-enforcer`
- `record-run`
- 必要最小限の quality / classify wrapper

のみを repo 内へ取り込む。

現時点では hybrid とする。

- `plan-init/status/clean` と `estack-enforcer` は vendor 済み
- `record-run` は `agent-skill-bus` への direct bridge に切り替えた
- `l1/quality/classify` は wrapper 越しの外部 bridge として残す

理由は、E:Stack gating は repo 契約の中核なので local に持つ価値が高い一方、
search / quality / classify は `context-and-impact` 側の OSS Core として独立性を保つ方が筋が良いためである。

### 6.3 GitNexus の使い方も contract 化する

GitNexus は次で分ける。

- **vanilla CLI**
  - `analyze`, `status`, `query`, `context`, `impact`, `cypher`
- **stable wrapper**
  - `../gitnexus-stable-ops/bin/gni`
  - safe impact / agent graph / reindex hook
- **agent graph MCP**
  - `gitnexus_agent_context`
  - `gitnexus_agent_status`
  - `gitnexus_agent_list`

計画書、AGENTS、CLAUDE では、
今後は「どの GitNexus 面を使う話なのか」を混ぜずに書く。

## 7. 改訂後の実装フェーズ

### Research Gate: 実装前の読解完了条件

目的:

- 吸収対象と非対象を、公式契約とローカル実装の両方から確定する

完了条件:

- Claude / Codex / GitHub の公式契約を確認済み
- `../Miyabi` の core runtime と外部依存を切り分け済み
- `../gitnexus-stable-ops` と `../context-and-impact` の役割を把握済み
- `judgesystem` 現状の safe runtime / workflow / bridge 状態を棚卸し済み
- 本計画書に「何を吸収するか / しないか」が明記されている

### Phase 0: 調査結果の反映と truthfulness 回復

目的:

- 計画書、AGENTS、CLAUDE、workflow の記述を現実へ合わせる

作業:

- 本計画書を再設計版へ更新
- 「`.claude/agents = runtime 実装`」という誤解を解く
- `agents:parallel:exec` を planning/orchestration substrate と位置づけ直す
- `autonomous-agent.yml` の過剰な claim を棚卸しする
- GitNexus / `context-and-impact` / sibling repo 依存を一覧化する
- `.claude/agents/*.md` に残る古い自動化前提を、実際の handler contract に合わせて修正する
- `.claude/commands/*.md` の主要入口 (`agent-run`, `create-issue`, `miyabi-auto`, `deploy`) も実際の runtime / bridge 契約に合わせて修正する

### Phase 1: 既存 substrate を活かす前提で contract を修正

目的:

- すでにある `scripts/automation` を活かしつつ、上位設計だけを直す

作業:

- `scripts/automation/decomposition/*` は維持
- `scripts/automation/orchestration/*` は維持
- `TaskExecutor` の将来 contract を fixed agent class 前提から registry/handler 前提へ修正
- `scripts/lib/*` の shim 維持方針を整理

### Phase 2: `.claude/agents` loader と registry を実装

目的:

- Claude 用 agent 定義を runtime から参照可能にする

作業:

- `scripts/automation/agents/markdown-loader.ts`
- `scripts/automation/agents/registry.ts`
- `scripts/automation/agents/handler-contract.ts`
- frontmatter parser と body summarizer
- `.claude/agents` 変更時の failure mode を定義

成果物:

- runtime が `.claude/agents/*.md` を source of truth として読める
- agent を増やしても metadata 反映のための手作業を最小化できる

### Phase 3: capability handler と generic fallback を実装

目的:

- 副作用付きの runtime 実行を、明示 handler 経由でのみ許可する

作業:

- issue / label / state handler
- review result handler
- pr handler
- deployment trigger handler
- handler 未実装時の generic fallback

この Phase 3 の最初の受け入れ条件は、次で固定する。

- `capability-router.ts` が registry を見て handler または fallback へ分岐できる
- `IssueAgent` は label/state machine を介して analyzing へ遷移できる
- `CodeGenAgent` は local implementation brief artifact を生成し、必要なら implementing へ同期できる
- `ReviewAgent` は repo-root check 実行結果を report に残せる
- `PRAgent` は local artifact を生成できる
- `DeploymentAgent` は opt-in gate なしでは skip する
- `DeploymentAgent` は deploy contract の結果を report に残せる

補足:

- `CodeGenAgent` も「即 class を作る」より、まずは implementation brief + capability binding で扱う
- handler がない agent は planning-only / comment-only / escalation-only に落とす

### Phase 4: workflow と runtime の事実を一致させる

目的:

- GitHub Actions 側の表示と、実際の実行能力を一致させる

作業:

- `autonomous-agent.yml` の PR body / issue comment を execution report ベースへ変更
- 実際に codegen / review / test / pr が行われたときだけその結果を書く
- 未実装の handler を前提にした成功文言を消す

### Phase 5: `context-and-impact` / GitNexus の運用契約を固める

目的:

- 実行前パイプラインと code intelligence の前提を安定化する

作業:

- `scripts/context-impact/*.sh` の bridge 契約を文書化
- `pipeline:*` script の依存関係を整理
- `GitNexus` は vanilla CLI / stable wrapper / agent graph MCP を文書上で区別
- `gitnexus_detect_changes` 前提の記述を、現実に使えるフローへ置き換える

### Phase 6: 外部 sibling 依存の縮減

目的:

- `../Miyabi` 前提をなくし、必要なら他 sibling 依存も明確化・縮減する

作業:

- `package.json` の `miyabi` dependency を root runtime から外す
- `.claude/mcp-servers/miyabi-integration.js` の扱いを決める
- `.claude/commands/miyabi-*.md` の扱いを決める
- `agent-skill-bus` と `context-and-impact` を bridge のまま残すか、最小 vendor するかを決める

### Phase 7: full autonomy capability plan を確定する

目的:

- safe handler を超えて、どの能力を repo-local に昇格させるかを明文化する

作業:

- `CodeGenAgent` は delegated writer binding まで接続済みとし、必要なら external-model / stronger write contract への昇格条件を決める
- `ReviewAgent` は score / retry / escalation 契約まで接続済みとし、security/coverage/comment contract の拡張条件を決める
- `PRAgent` は remote draft PR 作成契約まで接続済みとし、reviewer / label / mergeability 契約の拡張条件を決める
- `DeploymentAgent` は deploy approval/provider-target metadata/build/preflight/healthcheck/rollback 契約まで接続済みとし、repo-local `cloud-run` preset まで接続済みとして、それ以外の provider 固有 orchestration や GitHub Environment approval 連携の拡張条件を決める
- `workflow_dispatch` の planning / execute 切替と、label / comment trigger 時の explicit execute gate、protected deploy 用の dedicated execute workflow 分離は接続済みとし、必要なら provider-specific orchestration の高度化を決める
- Miyabi 由来の `TestAgent` を独立 runtime にするか、review/test capability に吸収するかを明記する

### Phase 8: full autonomy の最小 slice を実装する

目的:

- full autonomy を 1 機能ずつ現実の runtime に接続する

初手の候補:

- `PRAgent`: remote draft PR 作成
- workflow: planning / execute 切替と event execute gate
- `CodeGenAgent`: external-model or delegated writer binding

受け入れ条件:

- `--dry-run` なしの実行で、実際に走った能力だけが report / issue comment / workflow summary に出る
- 実行に必要な GitHub permissions と env gate が明記されている
- fail / skip / escalate が曖昧な成功文言に埋もれない

### Phase 9: full autonomy の運用 DoD を固める

目的:

- 「動く」だけでなく、repo として保守できる full autonomy にする

作業:

- push / PR 時の Actions を確認し、足りない permissions / branch filter / failure path を修正する
- remote PR / deploy / review loop に必要な smoke test を定義する
- `project_memory/*` と execution artifact の更新責務を整理する
- 必要なら `autonomous-agent.yml` とは別に execute 用 workflow を切る

## 8. まず着手すべき最小スライス

ここから先の最小スライスは、safe runtime を増やすことではなく、
full autonomy をどの capability から開けるかを計画書どおりに進めることである。

順番は次で固定する。

1. Research Gate を満たす
2. 計画書に吸収対象 / 非対象 / bridge 対象を明記する
3. full autonomy phase の初手を 1 つに絞る
4. その capability に必要な workflow / token / permission / failure path を整える
5. 実装、検証、GitHub 反映を行う

初手としては、`PRAgent` の remote draft PR 作成と
`autonomous-agent.yml` の planning/execute 切替、および
issue/comment trigger での explicit execute gate を先に完了させた。
次の capability 候補としていた `CodeGenAgent` の delegated writer binding も接続済みである。
残る重点は、provider 固有の高度な orchestration と remaining capability の運用 DoD 固めである。

## 9. 改訂版 Definition of Done

以下を満たしたら、Miyabi 差分吸収は「筋の良い形で完了」と言える。

- `judgesystem` が `../Miyabi` を runtime 前提にしない
- `.claude/agents/*.md` は Claude 用定義として残り、runtime 側は loader 経由で参照する
- `scripts/automation/*` が repo automation の実装本体になっている
- `agents:parallel:exec` は registry + handler もしくは planning-only のどちらかを明示できる
- `.github/workflows/*` は実際に行ったことだけを報告する
- issue/comment trigger の `execute` は explicit gate が開いている場合だけであり、閉じているときは planning へ truthfully フォールバックする
- `AGENTS.md` / `CLAUDE.md` / 計画書が、実際に使える GitNexus / context-and-impact / runtime 構成と矛盾しない
- sibling repo 参照が残る場合でも、それが override / local install の後ろにある optional fallback であると明文化されている
- `context-and-impact` と `agent-skill-bus` を外部 bridge として残すなら、その前提が明文化されている
- 元ディレクトリの能力が `repo-local runtime / external bridge / 非対象` に分類されている
- Miyabi 由来の full autonomy 能力について、少なくとも 1 つは `judgesystem` 側の実 runtime として接続済みである
- full autonomy を開ける remaining capability について、何が未接続かが計画書に明記されている

## 10. 調査ソース

### 10.1 公式ドキュメント

- Claude Code settings: https://code.claude.com/docs/en/settings
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code slash commands / skills: https://code.claude.com/docs/en/slash-commands
- Codex introduction: https://openai.com/index/introducing-codex/
- GitHub Actions overview: https://docs.github.com/en/actions/get-started/understand-github-actions
- GitHub reusable workflows: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
- GitHub composite actions: https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action

### 10.2 ローカル確認対象

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/mcp.json`
- `.claude/agents/*.md`
- `.claude/mcp-servers/miyabi-integration.js`
- `.github/workflows/autonomous-agent.yml`
- `package.json`
- `scripts/automation/*`
- `scripts/context-impact/*`
- `../Miyabi/*`
- `../context-and-impact/*`
- `../gitnexus-stable-ops/*`

## 11. まとめ

今回の結論は明確である。

- `scripts/automation` は引き続き正しい吸収先
- ただし agent 実装モデルは fixed class 前提ではなく registry / handler 前提へ修正する
- `.claude/agents` は runtime 実装ではなく、Claude 用 prompt / metadata の正本として扱う
- `context-and-impact` と GitNexus は「重要だが別面の契約」を持つため、明示的に計画へ組み込む
- すでに進めた Phase 0-4 相当の実装は、破棄ではなく contract 修正と truthfulness 回復で活かす
