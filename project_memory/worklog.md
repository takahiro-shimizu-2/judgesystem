# Project Memory Worklog

Context-and-impact phase E appends audit entries here.

## 2026-04-04

- Started Phase 2 by moving label state machine logic into `scripts/automation/state`.
- Kept `scripts/label-state-machine.ts` as the stable CLI entrypoint for workflows and npm scripts.
- Added `label-state-bridge` and `github-label-sync` helpers to keep label parsing and GitHub label replacement separate.
- Started Phase 3 by moving project status and webhook routing orchestration into `scripts/automation/adapters`.
- Added a reusable retry helper in `scripts/automation/core/retry.ts` for adapter-level backoff behavior.
- Moved KPI report, weekly report, and dashboard data entrypoint orchestration into reporting adapters.
- Started Phase 4 by adding a planning-first `agents:parallel:exec` runtime for issue decomposition, DAG building, and execution report generation.
- Added `scripts/automation/decomposition` and `scripts/automation/orchestration` so the autonomous-agent workflow has a real CLI entrypoint inside this repo.
- Paused further agent implementation to reassess architecture against Claude Code, Codex, GitHub Actions, GitNexus, `context-and-impact`, and `../Miyabi`.
- Confirmed that `.claude/agents/*.md` should be treated as Claude-side prompt and metadata definitions, not as repo runtime implementations.
- Confirmed that current GitNexus usage in this repo mixes vanilla CLI and custom `gitnexus-stable-ops` agent-graph tooling, so docs and plans must distinguish them explicitly.
- Confirmed that `context-and-impact` is a first-class external pipeline dependency for `project_memory/` and `.ai/execution-plan.json`, not a detail to ignore during Miyabi absorption.
- Rewrote `docs/agents-integration-plan.md` to replace the fixed per-agent class plan with a dynamic registry/handler architecture and to inventory the follow-up work for already-implemented substrate code.
- Updated `AGENTS.md`, `CLAUDE.md`, and `.github/workflows/autonomous-agent.yml` so they describe the current planning-first runtime truthfully instead of claiming codegen/review/PR behavior that is not yet wired.
- Added `scripts/automation/agents/markdown-loader.ts`, `scripts/automation/agents/registry.ts`, and `scripts/automation/agents/handler-contract.ts` to load `.claude/agents/*.md` as runtime metadata.
- Connected the registry to `TaskManager` and `TaskExecutor`, so dry-run reports now say which Claude-side agent definition was matched and whether a runtime handler is still missing.
- Fixed PR CI drift by gating `.github/workflows/deploy-pages.yml` behind an explicit `GITHUB_PAGES_ENABLED=true` repository variable so feature-branch pushes do not fail when Pages is not configured yet.
- Clarified Phase 3 in `docs/agents-integration-plan.md` before further implementation: `IssueAgent` uses label/state sync, `ReviewAgent` runs local checks, `PRAgent` starts with local draft artifacts, `DeploymentAgent` stays opt-in, and `CodeGenAgent` remains fallback-only for now.
- Added `scripts/automation/agents/capability-router.ts`, `scripts/automation/agents/fallback/generic-agent.ts`, and `scripts/automation/agents/handlers/*` so non-dry-run execution can route through explicit handlers or truthfully remain planning-only.
- Wired `TaskExecutor` and `TaskManager` to pass runtime context (`rootDir`, `env`, `worktree`) into the registry-based handler flow instead of treating every non-custom run as planning-only.
- Added `scripts/automation/adapters/autonomous-agent-summary.ts` and `scripts/autonomous-agent-summary.ts` so the autonomous-agent workflow can summarize the latest execution report and matching execution plan artifact.
- Updated `.github/workflows/autonomous-agent.yml` to publish a report-based job summary and issue comment instead of relying on fixed planning-only prose, while still leaving the workflow in dry-run mode.
- Removed `miyabi` from the root runtime dependency set in `package.json` and kept the Claude-side Miyabi bridge as an optional external surface instead of a mandatory repo dependency.
- Updated `.claude/mcp-servers/miyabi-integration.js` so it prefers a local `node_modules/.bin/miyabi` binary, then optionally probes `../Miyabi/packages/cli`, and otherwise fails with an explicit optional-bridge message.
