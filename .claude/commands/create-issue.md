---
description: Agent実行向けIssueの下書きと作成補助
---

# Create Issue Command

Agent runtime や workflow で処理しやすい Issue を作るための scaffold です。
このコマンド自体は「Issue を作った瞬間に必ず Agent が走る」ことを保証しません。

## 目的

- タイトル、要件、優先度、制約を整理する
- `agents:parallel:exec` に渡しやすい本文構造を作る
- 必要なら workflow 用ラベルを提案する

## 集めるとよい情報

1. Issue タイトル
2. 種別
3. 要件チェックリスト
4. 制約事項
5. 優先度
6. 関連 Issue / 依存
7. 自動実行ラベルを付けるかどうか

## 推奨テンプレート

```markdown
# [type] タイトル

## 要件

- [ ] 要件1
- [ ] 要件2

## 制約

- 制約1

## 依存

- #123

## 完了の目安

- `npm run typecheck`
- 関連テスト
- 必要なら review / PR artifact
```

## ラベルの考え方

- 種別ラベルと優先度ラベルは付けてよい
- `🤖agent-execute` は workflow 側のトリガーとして使う場合だけ付ける
- `🤖agent-execute` を付けても、issue 起点の run はデフォルトで `planning`
- issue ラベルから `execute` まで開けたい場合は、repo variable `AUTONOMOUS_AGENT_LABEL_EXECUTE_ENABLED=true` を別途設定する
- repo-local で手動実行するだけなら、必ずしも `🤖agent-execute` は要らない

## 例

```bash
gh issue create \
  --title "ユーザープロフィール編集機能" \
  --body-file issue-body.md \
  --label "🆕feature,🟡priority-medium"
```

workflow から拾わせたい場合のみ:

```bash
gh issue edit 123 --add-label "🤖agent-execute"
```

write / deploy まで含む `execute` を明示したい場合は、
`workflow_dispatch` の `execution_mode=execute` か、
repo variable gate を開いたうえで `/agent execute` を使う。

## 作成後の進め方

### repo-local でまず plan を見る

```bash
npm run agents:parallel:exec -- --issue 123 --dry-run
```

### connected handler まで動かす

```bash
npm run agents:parallel:exec -- --issue 123
```

### GitHub comment から planning / execute を要求する

```text
/agent analyze
/agent execute
@miyabi execute issue #123
```

ただし comment 起点もデフォルトでは `planning` で、
`AUTONOMOUS_AGENT_COMMENT_EXECUTE_ENABLED=true` が repo variable にある場合だけ `execute` が開く。

## 注意点

- 固定の品質スコアや自動 PR 作成を前提に本文を書かない
- 実際に動く check や artifact に合わせて成功条件を書く
- セキュリティや大きい blast radius がある場合は、最初からエスカレーション先を明記する
