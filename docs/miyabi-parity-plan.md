# Miyabi Parity 拡張計画書

作成日: 2026-04-05
最終更新: 2026-04-05

## 1. この計画の目的

前段の `Miyabi 差分吸収計画書` では、
`judgesystem` に repo-local runtime を成立させるための基盤整備を完了した。

ただし、それは
「`judgesystem` で矛盾なく動く最小 full-autonomy runtime」
の完成であり、
「元 `Miyabi` が持っていた coding autonomy の重要要素をすべて吸収した」
ことは意味しない。

この計画の目的は、
元 `Miyabi` との parity gap を全体で棚卸しし、
各項目を次の 3 分類で根拠付きに再判断することにある。

- `repo-local runtime として吸収する`
- `external bridge のまま残す`
- `今回の parity 計画では吸収しない`

## 2. 判断基準

### 2.1 吸収する

次を満たすものは `judgesystem` に吸収する。

- `Issue -> plan -> code -> test -> review -> PR -> deploy` の主経路に直接関わる
- `judgesystem` 単独で責任を持つべき runtime 契約である
- CI / smoke / artifact で継続検証できる
- sibling repo の内部構造をそのまま持ち込まずに再設計できる

### 2.2 bridge のまま残す

次を満たすものは external bridge のまま残す。

- 価値は高いが、本来の owner が別 repo / 別ツールである
- `judgesystem` 側に必要なのは narrow contract だけでよい
- override / wrapper で十分であり、repo-local vendor の利得が小さい

### 2.3 吸収しない

次を満たすものは、この parity 計画では吸収しない。

- `judgesystem` の coding autonomy 主経路から外れる
- 導入コストや運用複雑性が高すぎる
- infra / ecosystem 全体を持ち込むだけになりやすい

## 3. 全体分類

| 項目 | 現在の judgesystem | 判断 | 根拠 | 着地先 |
| --- | --- | --- | --- | --- |
| `Plans.md` / living planning artifact | `execution-plan.json` と workflow summary はあるが、living document はない | 吸収する | planning memory と handoff 品質に直結し、元 `Miyabi` の `CoordinatorAgent` 中核でもある | `scripts/automation/planning/*`, `.ai/parallel-reports/*` |
| real `git worktree` lifecycle | `.ai/worktrees/...` に staging area を切るだけ | 吸収する | 並列実行の衝突回避、resume、cleanup、Water Spider と密結合 | `scripts/automation/orchestration/*` |
| review loop | configured checks + score/retry はあるが one-shot 寄り | 吸収する | full autonomy の品質ループに必須で、現在の review contract だけでは弱い | `scripts/automation/agents/handlers/review*` |
| `TestAgent` 独立 runtime | `ReviewAgent` に吸収されている | 吸収する | test authority / artifact / handoff を独立させたいという現行判断に従う | `.claude/agents/test-agent.md`, `scripts/automation/agents/handlers/test.ts` |
| `Water Spider` | repo-local runtime には未導入 | 吸収する | long-running autonomy を止めない continuity layer として必要 | `scripts/automation/water-spider/*` |
| `Omega` | first-class layer として未導入 | 吸収する | 上位概念として現 runtime を整理できる。ただし段階導入にする | `scripts/automation/omega/*` |
| `context-and-impact` | wrapper / minimal vendor / bridge 混在 | bridge のまま | 独立 owner を持つ前段パイプラインであり narrow contract で十分 | `scripts/context-impact/*` |
| `agent-skill-bus` | override 付き bridge | bridge のまま | 外部 skill runtime としての性質が強い | wrapper のまま維持 |
| `gitnexus-stable-ops` | CLI/MCP bridge として参照 | bridge のまま | GitNexus の stable wrapper であり、repo-local runtime 本体ではない | CLI/MCP bridge のまま維持 |
| optional `miyabi` CLI / MCP | optional bridge | bridge のまま | compatibility surface としては有用だが source of truth ではない | optional bridge 維持 |
| `tmux` / multi-machine cluster | 未導入 | 今回は吸収しない | Water Spider の実装と切り離して段階導入すべき infra 領域である | 非対象 |
| Miyabi の広い CLI command surface | 一部 docs bridge のみ | 今回は吸収しない | command 面全体を持ち込むと `judgesystem` の責務を超える | 非対象 |
| business agents / voice / release-social / web dashboard 全体 | 未導入 | 今回は吸収しない | coding autonomy 主経路から外れる | 非対象 |

## 4. parity gap の見立て

### 4.1 planning artifact

現在の `judgesystem` には、
task decomposition, DAG, execution plan JSON, execution report JSON, workflow summary がある。

ただし元 `Miyabi` の `Plans.md` のように、

- Overview
- DAG visualization
- Task Breakdown
- Progress
- Decisions Log
- Recommendations

を継続更新する living planning artifact は未吸収である。

これは `Issue` を置き換えるものではなく、
Issue を runtime 実行可能な形へ具体化する派生 artifact として扱う。

### 4.2 worktree

現在の `.ai/worktrees/...` は staging / artifact 用ディレクトリであり、
real `git worktree` ではない。

元 `Miyabi` parity を考えると、必要なのは次である。

- `git worktree add/remove`
- branch 再利用
- cleanup
- stalled task の resume
- Water Spider との連携

したがって、`worktreePath` の概念があるだけでは parity とは言えない。

### 4.3 review + test

現在の `ReviewAgent` は、
configured checks, score, retry, escalation, coverage/security summary, review artifacts を持つ。

それでも parity が未了なのは、

- review が one-shot contract 寄りである
- iterative review loop が未整備である
- `TestAgent` が独立 authority を持たない

ためである。

この parity 計画では、
`ReviewAgent` と `TestAgent` を分けたうえで、
`CodeGen -> Test -> Review -> PR` の流れを明示する。

### 4.4 Water Spider

`Water Spider` は tmux の別名ではない。
役割は「自律実行を止めない continuity controller」である。

ただし `judgesystem` では、
最初から tmux / multi-machine 前提で入れない。
第一段階では repo-local / workflow-aware な Water Spider として吸収する。

### 4.5 Omega

`Omega` は現 runtime を丸ごと置き換える対象ではない。
位置づけは上位概念であり、段階導入にする。

まず吸収する対象は次である。

- `theta1 Understanding`
- Strategic Plan artifact
- `theta5 Integration`
- `theta6 Learning`

現在の `judgesystem` が既に持つ decomposition / DAG / handler 実行は、
`theta2` から `theta4` に近いので、当面は活かす。

## 5. 実装フェーズ

### Phase P0: parity contract 固定

目的:

- 現行 runtime の truth と parity target を分離する

作業:

- この文書を parity の source of truth とする
- `project_memory/*` を parity 計画に切り替える
- 現在の docs が述べる `TestAgent absorbed` は「現状の truth」であり、target ではないことを明示する

### Phase P1: planning layer parity

目的:

- `CoordinatorAgent` が living planning artifact を出せるようにする

作業:

- `Plans.md` 相当の markdown artifact を新設
- `execution-plan.json` と競合しないよう、machine artifact と human/agent artifact を役割分離する
- DAG visualization, task breakdown, decisions, recommendations を含める
- 実行後に progress 更新できるようにする

受け入れ条件:

- planning 時に JSON だけでなく markdown planning artifact も生成される
- execute 後に progress / results が反映される

### Phase P2: real worktree parity

目的:

- task assignment を real `git worktree` lifecycle に昇格する

作業:

- create / reuse / cleanup を持つ worktree manager を入れる
- branch naming と branch 再利用契約を定義する
- artifact staging と code editing area を分離する

受け入れ条件:

- task ごとに repo から独立した worktree を作成できる
- cleanup / resume / collision avoidance が担保される

### Phase P3: quality layer parity

目的:

- `ReviewAgent` と `TestAgent` を分離し、review/test loop を強化する

作業:

- `TestAgent` Claude-side 定義と runtime handler を追加する
- `ReviewAgent` は review / escalation / comment 側へ責務を寄せる
- `TestAgent` は test / coverage / integration / benchmark 側へ責務を寄せる
- iterative review loop を導入する

受け入れ条件:

- `CodeGen -> Test -> Review -> PR` の handoff が明示される
- test failure と review failure が別 artifact / state として追える

### Phase P4: Water Spider parity

目的:

- stalled autonomy を repo-local に継続させる

作業:

- session / run 状態を監視する Water Spider runtime を追加する
- `autonomous-agent.yml` / artifact / worktree state と連携する
- first phase では tmux 前提にしない

受け入れ条件:

- stalled / idle / failed execute run の継続判断ができる
- replay / retry / resume 契約が明文化される

進捗メモ (2026-04-05):

- repo-local `WaterSpiderAgent` runtime を追加済み
- `autonomous-agent.yml` の summarize 後に continuity decision を生成する
- issue comment の hidden marker で retry budget を保持する
- gate が開いていれば `autonomous-agent.yml` を self-dispatch できる
- P4 は完了、次の active phase は P5

### Phase P5: Omega staged absorption

目的:

- 現 runtime の上位に `Omega` を載せる

作業:

- Stage A: `issue-to-intent`
- Stage B: strategic plan generation
- Stage C: deliverable integration
- Stage D: learning artifact

受け入れ条件:

- Issue から task へ直行せず、Intent / Strategic Plan を経由できる
- 実行結果が deliverable として再統合される
- learning artifact が次回 run に引き継げる

進捗メモ (2026-04-05):

- Stage A/B として `issue-to-intent` と strategic plan generation を先行実装した
- `TaskManager` は decomposition の前に Omega understanding を作り、`.ai/parallel-reports/omega-intent-*.json` と `strategic-plan-*.md` を残す
- living planning artifact と workflow summary からも Omega planning layer を参照できる
- Stage C/D として `omega-deliverable-*.json` と `omega-learning-*.json` を追加し、次回 run が prior learning を carry-forward できるようにした
- `plans-*.md` は prior learning / deliverable integration / learning recommendations を含む
- P5 は完了、次の active slice は `bridge-revalidation`

### Phase P6: parity DoD

目的:

- parity 拡張後も継続運用できる状態にする

作業:

- smoke / CI を parity 対象に合わせて拡張する
- planning artifact, worktree, test/review loop, Water Spider, Omega の運用責務を固定する
- false claim を避けるため docs / commands / workflows を同期する

進捗メモ (2026-04-05):

- `bridge-revalidation` として external bridge contract smoke を追加した
- `scripts/context-impact/*` は explicit bridge のまま維持し、override/sibling fallback/error surface を smoke で固定した
- optional Miyabi MCP bridge も `MIYABI_CLI` / `MIYABI_ROOT` / local install / sibling fallback / unavailable の順を smoke で確認した
- `scripts/automation/*` と autonomous workflows に bridge 参照が紛れ込んでいないことを smoke で固定した
- 次の active slice は `parity-dod-v2`

## 6. 今回やらないこと

次は意図的にこの parity 計画から外す。

- tmux orchestration
- multi-machine cluster
- Miyabi CLI 全 command 面
- business agents
- voice / release / social
- web dashboard 全体

これらは将来別計画で再評価してよいが、
現時点では `judgesystem` の coding autonomy 主経路を完成させることを優先する。

## 7. Definition of Done

以下を満たしたら、この parity 計画は完了と言える。

- `Plans.md` 相当の living planning artifact が生成・更新される
- task execution が real `git worktree` lifecycle を使える
- `ReviewAgent` と `TestAgent` が独立 runtime として接続される
- review/test loop が one-shot ではなく改善ループとして機能する
- `Water Spider` が repo-local continuity layer として機能する
- `Omega` の first useful slice (`Understanding`, `Strategic Plan`, `Integration`, `Learning`) が接続される
- bridge 対象と非対象が docs / runtime / workflow で矛盾しない

## 8. 参考元

- `../Miyabi/packages/coding-agents/coordinator/coordinator-agent.ts`
- `../Miyabi/packages/coding-agents/utils/plans-generator.ts`
- `../Miyabi/packages/coding-agents/worktree/worktree-manager.ts`
- `../Miyabi/packages/coding-agents/review/review-loop.ts`
- `../Miyabi/packages/coding-agents/water-spider/water-spider-agent.ts`
- `../Miyabi/packages/coding-agents/omega-system/omega-engine.ts`
- `../Miyabi/docs/OMEGA_SYSTEM.md`
