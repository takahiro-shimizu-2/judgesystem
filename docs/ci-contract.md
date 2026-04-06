# CI Contract

## Purpose

この repo の CI は、固定メニューを漫然と回すのではなく、次の 2 層で repo を守る。

1. 共通 gate
   すべての push / pull_request で必ず見るべき基礎品質
2. 動的 gate
   変更箇所に応じて追加で見るべき package / migration / workflow の検証

## Common Gates

以下は常に実行する。

- `automation:smoke`
  - repo-local Miyabi runtime と GitNexus mandatory contract を継続検証する
- workflow lint
  - `actionlint` で `.github/workflows/*.yml` の構文と危険な inline expression を見る
- Python syntax
  - `packages/engine` と `db/scripts` の `.py` を `compileall` で検証する
- shell syntax
  - `scripts/**/*.sh` と `db/**/*.sh` を `bash -n` で検証する
- security audit
  - backend / frontend で `npm audit --audit-level=high` を fail-fast で実行する

## Dynamic Gates

`scripts/ci/detect-changed-scope.mjs` が diff range から実行対象を判定する。

### Workspace Gates

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

### Migration Validation

`db/migrations/**` が変わったときは、fresh PostgreSQL container に `migrate:up` セクションを順番適用して検証する。

## Notes

- `.vite` のようなローカル生成物で lint が汚染されないよう、frontend lint は build artifact を無視する
- CI summary job は common gate と dynamic gate の両方を監視し、必要な job が skip/failure/cancel になったら workflow 全体を失敗扱いにする
