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
  または `AUTOMATION_DEPLOY_USE_PROVIDER_PRESET=true` で対応済み provider preset が使える
- 必要なら `AUTOMATION_DEPLOY_BUILD_COMMAND`
- 必要なら `AUTOMATION_DEPLOY_PROVIDER`, `AUTOMATION_DEPLOY_TARGET`
- protected environment (`prod`, `production`, `live`) では default で approval required
- approval を明示したい場合は `AUTOMATION_DEPLOY_REQUIRE_APPROVAL`, `AUTOMATION_DEPLOY_ALLOWED_APPROVERS`, `AUTOMATION_DEPLOY_APPROVED_BY`, `AUTOMATION_DEPLOY_APPROVAL_REASON`
- 必要なら `AUTOMATION_DEPLOY_PREFLIGHT_COMMAND`
- 必要なら `AUTOMATION_DEPLOY_HEALTHCHECK_COMMAND`
- 必要なら `AUTOMATION_DEPLOY_ROLLBACK_COMMAND`

この解決条件が満たされなければ `DeploymentAgent` は `skipped` を返す。

## 使う前に確認すること

1. review が終わっているか
2. 実行したい deploy command が明示されているか
3. 対象環境と責任者が明確か

## 例

```bash
export AUTOMATION_ENABLE_DEPLOY=true
export AUTOMATION_DEPLOY_PROVIDER="cloud-run"
export AUTOMATION_DEPLOY_TARGET="backend"
export AUTOMATION_DEPLOY_USE_PROVIDER_PRESET=true
export AUTOMATION_DEPLOY_REQUIRE_APPROVAL=required
export AUTOMATION_DEPLOY_ALLOWED_APPROVERS="takahiro-shimizu-2"
export AUTOMATION_DEPLOY_APPROVED_BY="takahiro-shimizu-2"
export AUTOMATION_DEPLOY_APPROVAL_REASON="manual staging rollout"
export AUTOMATION_DEPLOY_PREFLIGHT_COMMAND="npm run typecheck"
export AUTOMATION_DEPLOY_HEALTHCHECK_COMMAND="curl -fsS https://example.com/health"
export AUTOMATION_CLOUD_RUN_PROJECT_ID="your-gcp-project"
export AUTOMATION_CLOUD_RUN_BACKEND_SERVICE_NAME="bidapp-backend-postgres-dev"
export AUTOMATION_CLOUD_RUN_FRONTEND_URL="https://frontend.example.com"
export AUTOMATION_CLOUD_RUN_DATASET_NAME="judge_system"
export AUTOMATION_CLOUD_RUN_CONNECTION_TYPE="proxy"
export AUTOMATION_CLOUD_RUN_CLOUD_SQL_INSTANCE="project:asia-northeast1:db"
export AUTOMATION_CLOUD_RUN_PG_USER="postgres"
export AUTOMATION_CLOUD_RUN_PG_PASSWORD="***"
export AUTOMATION_CLOUD_RUN_PG_DATABASE="judge_system"
export AUTOMATION_CLOUD_RUN_PG_PORT="5432"
export AUTOMATION_CLOUD_RUN_PG_SSLMODE="disable"
export AUTOMATION_CLOUD_RUN_PG_SCHEMA="public"
export AUTOMATION_CLOUD_RUN_ENABLE_CONTACT_DELETE="false"
export AUTOMATION_CLOUD_RUN_DRY_RUN=true
```

そのうえで autonomous runtime から対象 Issue を処理する:

```bash
npm run agents:parallel:exec -- --issue 123
```

Cloud Run preset の wrapper 単体確認:

```bash
npm run deploy:cloud-run:backend
```

GitHub Environment approval を使う protected deploy なら、
Actions の dedicated workflow も使える:

```bash
gh workflow run autonomous-deploy-execute.yml \
  -f issue_number=123 \
  -f github_environment=production \
  -f deploy_environment=production \
  -f deploy_target=backend \
  -f deploy_approval_reason='release approval'
```

## このコマンドが保証しないこと

- Firebase 固定の deploy
- secret や cloud provider の自動設定

approval / provider / target metadata は contract に残せるが、
`cloud-run` だけは repo-local preset があるものの、それ以外の provider 固有 orchestration 自体は引き続き command-driven である。
GitHub Environment approval を使いたい場合は、
generic `autonomous-agent.yml` ではなく `autonomous-deploy-execute.yml` を使う。

## 失敗時の見方

- execution report の `failed` task
- `.ai/parallel-reports/deployment-summary-*.md`
- `.ai/logs/YYYY-MM-DD.md`
- deploy command の標準出力 / 標準エラー要約

## 推奨

deploy を本当に自動化したい場合でも、
まずは explicit command か repo-local preset を使った safe contract から始め、
approval / build / health / rollback の command を段階的に追加していく。
