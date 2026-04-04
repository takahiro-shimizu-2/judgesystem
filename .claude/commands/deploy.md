---
description: Deployment command bridge - env-gated deploy 実行の案内
---

# Deploy Command

`judgesystem` での deploy は、現在は `DeploymentAgent` の env gate が開いているときだけ実行される。
このコマンドは「常に Firebase/Cloud へ自動 deploy できる」前提ではなく、
今の contract に沿って deploy 条件を確認するための入口である。

## 現在の contract

- `AUTOMATION_ENABLE_DEPLOY=true`
- `AUTOMATION_DEPLOY_COMMAND` が設定されている

この 2 つが無ければ `DeploymentAgent` は `skipped` を返す。

## 使う前に確認すること

1. review が終わっているか
2. 実行したい deploy command が明示されているか
3. 対象環境と責任者が明確か

## 例

```bash
export AUTOMATION_ENABLE_DEPLOY=true
export AUTOMATION_DEPLOY_COMMAND="npm run deploy:staging"
```

そのうえで autonomous runtime から対象 Issue を処理する:

```bash
npm run agents:parallel:exec -- --issue 123
```

## このコマンドが保証しないこと

- Firebase 固定の deploy
- health check / rollback の自動化
- production 承認フロー
- secret や cloud provider の自動設定

それらが必要なら、deploy command の中身や workflow を別途整備する。

## 失敗時の見方

- execution report の `failed` task
- `.ai/logs/YYYY-MM-DD.md`
- deploy command の標準出力 / 標準エラー要約

## 推奨

deploy を本当に自動化したい場合でも、
まずは `AUTOMATION_DEPLOY_COMMAND` を明示した safe command gate から始め、
成功条件と rollback 方針を command 側で固めてから広げる。
