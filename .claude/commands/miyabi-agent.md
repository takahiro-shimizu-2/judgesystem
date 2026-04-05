---
description: Miyabi Agent外部bridge - Issue処理
---

# Miyabi Agent実行（外部bridge）

GitHub Issue を Miyabi bridge 経由で処理するための surface です。
`judgesystem` の repo-local runtime そのものではありません。

## judgesystem での位置づけ

- `miyabi__agent_run` と `npx miyabi ...` は optional external bridge
- bridge が使えないときの repo-local 入口は `npm run agents:parallel:exec -- --issue <番号> --dry-run`
- codegen / test / review / PR / deploy は capability ごとの optional handler であり、常時保証ではない

## 利用可能なMCPツール

Claude Codeから外部 bridge 経由で Miyabi 機能を呼び出せます：

### `miyabi__agent_run`
Autonomous Agentを実行してIssueを自動処理

**パラメータ**:
- `issueNumber`: 処理するIssue番号
- `issueNumbers`: 複数Issue（並列処理）
- `concurrency`: 並行実行数（デフォルト: 2）
- `dryRun`: ドライラン（デフォルト: false）

**使用例**:
```
単一Issue処理:
miyabi__agent_run({ issueNumber: 123 })

複数Issue並列処理:
miyabi__agent_run({ issueNumbers: [123, 124, 125], concurrency: 3 })

Dry run:
miyabi__agent_run({ issueNumber: 123, dryRun: true })
```

### `miyabi__auto`
Water Spider Agent（全自動モード）起動

**パラメータ**:
- `maxIssues`: 最大処理Issue数（デフォルト: 5）
- `interval`: ポーリング間隔秒（デフォルト: 60）

**使用例**:
```
全自動モード起動:
miyabi__auto({ maxIssues: 10, interval: 30 })
```

## bridge 利用時の想定フロー

```
Issue作成/検出
    ↓
CoordinatorAgent（タスク分解・DAG構築）
    ↓
IssueAgent（分析・Label付与）
    ↓
optional handlers（CodeGen / Test / Review / PR / Deploy）
    ↓
handler 未接続なら planning / report / escalation に留まる
```

## コマンドライン実行

MCPツールの代わりにコマンドラインでも実行可能です。
ただし `miyabi` binary または外部 bridge が解決できる場合に限ります。

```bash
# 単一Issue処理
npx miyabi agent run --issue 123

# 複数Issue並行処理
npx miyabi agent run --issues 123,124,125 --concurrency 3

# 全自動モード
npx miyabi auto --max-issues 10

# Dry run
npx miyabi agent run --issue 123 --dry-run
```

## 環境変数

`.env` ファイルに以下を設定:

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
REPOSITORY=owner/repo
DEVICE_IDENTIFIER=MacBook Pro 16-inch
```

## judgesystem で期待すべき結果

- bridge が利用可能なら Miyabi CLI / MCP の結果を呼び出せる
- bridge がなくても repo-local runtime では plan / report / workflow 連携が使える
- 未接続 handler がある場合、結果は planning-only / report-only になりうる

## エスカレーション

以下の場合、自動エスカレーション:

| 条件 | エスカレーション先 | 重要度 |
|------|------------------|--------|
| アーキテクチャ問題 | TechLead | Sev.2-High |
| セキュリティ脆弱性 | CISO | Sev.1-Critical |
| ビジネス優先度 | PO | Sev.3-Medium |
| 循環依存検出 | TechLead | Sev.2-High |

---

💡 **ヒント**: `judgesystem` の実装本体は `scripts/automation/*` です。`miyabi-*` command は外部 bridge surface として扱います。
