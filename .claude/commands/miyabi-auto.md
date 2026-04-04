---
description: Miyabi Water Spider外部bridge
---

# Miyabi Water Spider全自動モード（外部bridge）

これは `judgesystem` の repo-local runtime ではなく、
Miyabi CLI / MCP bridge が使える場合にだけ起動する optional external bridge です。

## judgesystem での位置づけ

- repo-local の主経路は `npm run agents:parallel:exec`
- `miyabi__auto` は `MIYABI_CLI` / `MIYABI_ROOT` / local install / sibling fallback が解決できる場合のみ使える
- bridge 側で full automation が有効でも、repo-local 側に未接続 capability があれば plan / report で止まることがある

## 使い方

### MCP

```text
miyabi__auto({})
miyabi__auto({ maxIssues: 10, interval: 30 })
```

### CLI

```bash
npx miyabi auto
npx miyabi auto --max-issues 10 --interval 30
```

## 期待値

この bridge を使っても、次を自動保証するわけではない。

- product code 自動生成
- remote PR 自動作成
- deploy 自動完了
- 固定スコアによる自動マージ判定

## repo-local で代替できること

```bash
npm run agents:parallel:exec -- --issue 123 --dry-run
npm run agents:parallel:exec -- --issue 123
npm run state:transition -- --issue=123 --to=analyzing --reason="manual handoff"
```

## 利用条件

- `GITHUB_TOKEN`
- 必要なら `MIYABI_CLI` または `MIYABI_ROOT`
- または local `miyabi` install / optional sibling checkout

## 実行後の確認

- `.ai/logs/`
- `.ai/parallel-reports/`
- Issue labels / state
- 必要なら `gh pr checks <number>`

## トラブル時

- bridge が見つからないなら `MIYABI_CLI` / `MIYABI_ROOT` を確認
- repo-local handler が未接続なら plan-only で止まることがある
- 実際に行われた内容は execution report を見て判断する
