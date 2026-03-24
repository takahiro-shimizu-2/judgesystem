# Prompt Request Bus

## Description
A unified task queue for multi-agent systems. Every action — human commands, cron jobs, webhooks, internal triggers — becomes a **Prompt Request** in a single JSONL queue with DAG dependency resolution and file-level locking.

## Core Concept

**Every action is a Prompt Request.**

Whether it's a human typing "fix this", a cron job triggering a check, or a Knowledge Watcher detecting a drift — they all enter the same queue in the same format and get routed by the same logic.

## Prompt Request Format

```json
{
  "id": "pr-20260318-001",
  "ts": "2026-03-18T08:00:00Z",
  "source": "human|cron|webhook|knowledge-watcher|self-improve|dag",
  "priority": "critical|high|medium|low",
  "agent": "target-agent-id",
  "task": "Concrete task description",
  "context": "Background info / trigger reason",
  "affectedSkills": ["skill-name"],
  "affectedFiles": ["repo:path/to/file.ts"],
  "deadline": "immediate|24h|week-end|next-cycle|none",
  "status": "queued|running|done|failed|deferred|blocked",
  "result": null,
  "dependsOn": [],
  "dagId": null
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique PR identifier |
| `ts` | ISO 8601 | Creation timestamp |
| `source` | string | Origin of the request |
| `priority` | enum | Execution priority |
| `agent` | string | Target agent to execute |
| `task` | string | What to do |
| `context` | string | Why it needs to be done |
| `affectedFiles` | string[] | Files this PR will modify (`repo:path` format). Used for lock management |
| `dependsOn` | string[] | PR IDs that must be `done` before this PR can execute |
| `dagId` | string\|null | DAG group ID. PRs with the same dagId form a task tree |
| `status` | enum | Current state. `blocked` = a dependency failed |

**Standalone tasks** (no DAG): Set `dependsOn: []` and `dagId: null`.

## Data Files

| File | Purpose |
|------|---------|
| `prompt-request-queue.jsonl` | All Prompt Requests (append-only) |
| `prompt-request-history.md` | Human-readable completed request log |
| `dag-state.jsonl` | DAG group progress summaries |
| `active-locks.jsonl` | Currently held file locks |

### DAG State Entry
```json
{"dagId":"dag-feature-v2","created":"2026-03-18T06:00:00Z","total":5,"queued":3,"running":1,"done":1,"failed":0,"blocked":0}
```

### Lock Entry
```json
{"agent":"dev-agent","repo":"myapp","files":["src/auth.ts"],"prId":"pr-001","lockedAt":"2026-03-18T06:00:00Z","ttl":7200}
```

## DAG: Task Dependency Management

### Creating a DAG (breaking large tasks into subtasks)

```
1. Analyze the task
2. Break into subtasks with specific affectedFiles
3. Infer dependencies from file relationships:
   - Task A outputs a file that Task B reads → B depends on A
   - Two tasks modify the same file → serialize them
   - No file overlap → can run in parallel
4. Assign the same dagId to all subtasks
5. Append to prompt-request-queue.jsonl
6. Append DAG summary to dag-state.jsonl
```

### DAG Dispatch Logic

```
1. Group PRs by dagId
2. PRs with empty dependsOn → immediately "queued" (root tasks)
3. All dependencies "done" → promote to "queued"
4. Any dependency "failed" → mark as "blocked" + notify
5. Multiple "queued" PRs → dispatch all simultaneously (auto-parallelization)
6. Circular dependency detected → fail entire DAG + error notification
```

### Example DAG

```
dagId: "dag-feature-v2"

pr-001: DB schema change        dependsOn: []        → run immediately
pr-002: Auth module refactor    dependsOn: []        → run immediately (parallel with 001)
pr-003: API endpoints           dependsOn: [001,002] → after both complete
pr-004: Frontend update         dependsOn: [003]     → after 003
pr-005: E2E tests               dependsOn: [003,004] → after both complete

Timeline:
  pr-001 ████████░░░░░░░░░░░░
  pr-002 ████████████░░░░░░░░
  pr-003 ░░░░░░░░░░░░████████
  pr-004 ░░░░░░░░░░░░░░░░████
  pr-005 ░░░░░░░░░░░░░░░░░░██
```

## Lock Management

### Lock Acquisition Flow

```
Before dispatching a PR:
1. Read affectedFiles from the PR
2. Read active-locks.jsonl
3. Conflict check:
   a. Same file already locked → set PR to "deferred"
   b. No conflict → acquire lock → append to active-locks.jsonl → set "running"
4. On PR completion/failure → release lock → remove from active-locks.jsonl
```

### TTL (Timeout)
- **Default: 7200 seconds (2 hours)**
- Expired locks are auto-released during periodic checks
- Released PRs marked as `failed` with `reason: "lock_timeout"`
- Prevents deadlocks from crashed agents

### Lock Granularity
- **File-level** (default): `affectedFiles: ["myapp:src/auth.ts"]`
- **Repo-level** (for large refactors): `affectedFiles: ["myapp:*"]`

## Routing Logic

```
1. Read prompt-request-queue.jsonl
2. Resolve DAG dependencies
3. Filter: status == "queued"
4. Sort: priority (critical > high > medium > low), then ts (oldest first)
5. For each request:
   a. Check deadline expiry → mark "failed" if expired
   b. Check file locks → "deferred" if conflict
   c. Check agent availability → defer if busy
   d. Risk assessment:
      - Low-risk + clear task → acquire lock → auto-execute
      - High-risk or ambiguous → notify human
      - Cross-agent → route to target agent
6. Execute and update status
7. Release locks
8. Update dag-state.jsonl
9. Promote dependent PRs whose dependencies are now "done"
10. Append to prompt-request-history.md
```

## Risk Assessment

```
Auto-execute (ALL must be true):
  - priority is medium or low
  - task is within agent's known capabilities
  - no destructive operations (delete, external sends, payments)
  - similar task previously succeeded
  - no lock conflicts

Require human approval (ANY triggers):
  - priority is critical or high
  - task involves external communication
  - task modifies security settings
  - first-time task for this agent
  - lock conflict detected
```

## Constraints

- Queue size limit: 100 entries (oldest low-priority purged on overflow)
- Deduplication: source + agent + task hash
- Max 5 auto-executions per cycle
- Critical tasks bypass queue ordering
- Human commands always highest priority
- Max 20 PRs per DAG
- Max 10 concurrent locks
- Lock TTL: 7200 seconds
- PRs without affectedFiles skip lock checks (backward compatible)
