# Project Memory Worklog

Context-and-impact phase E appends audit entries here.

## 2026-04-04

- Started Phase 2 by moving label state machine logic into `scripts/automation/state`.
- Kept `scripts/label-state-machine.ts` as the stable CLI entrypoint for workflows and npm scripts.
- Added `label-state-bridge` and `github-label-sync` helpers to keep label parsing and GitHub label replacement separate.
- Started Phase 3 by moving project status and webhook routing orchestration into `scripts/automation/adapters`.
- Added a reusable retry helper in `scripts/automation/core/retry.ts` for adapter-level backoff behavior.
