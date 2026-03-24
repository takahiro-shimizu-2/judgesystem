# Self-Improving Skills

## Description
A 7-step quality loop that monitors agent skill execution, detects degradation, diagnoses root causes, and applies fixes — automatically or with human approval.

Inspired by [Cognee's self-improving agents](https://www.cognee.ai), implemented as a framework-agnostic JSONL-based system.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Self-Improving Skills Loop                 │
│                                             │
│  1. OBSERVE  — Read skill-runs.jsonl        │
│  2. ANALYZE  — Calculate failure rates      │
│  3. DIAGNOSE — LLM identifies root cause    │
│  4. PROPOSE  — Generate fix candidates      │
│  5. EVALUATE — Score safety & relevance     │
│  6. APPLY    — Edit skill (auto or manual)  │
│  7. RECORD   — Log improvement history      │
└─────────────────────────────────────────────┘
```

## Data Files

### `skill-runs.jsonl` (Execution Log)

Every agent appends a line after executing a skill:

```jsonl
{"ts":"2026-03-18T12:00:00Z","agent":"my-agent","skill":"web-search","task":"search for AI news","result":"success","score":1.0,"notes":""}
{"ts":"2026-03-18T12:05:00Z","agent":"my-agent","skill":"api-caller","task":"fetch user data","result":"fail","score":0.0,"notes":"401 Unauthorized - token expired"}
{"ts":"2026-03-18T12:10:00Z","agent":"monitor","skill":"healthcheck","task":"system audit","result":"partial","score":0.6,"notes":"SSH OK, firewall check failed"}
```

| Field | Type | Description |
|-------|------|-------------|
| `ts` | ISO 8601 | Execution timestamp |
| `agent` | string | Agent that ran the skill |
| `skill` | string | Skill name |
| `task` | string | What was attempted |
| `result` | enum | `success`, `partial`, `fail` |
| `score` | float | 0.0 (total failure) to 1.0 (perfect) |
| `notes` | string | Error details, context |

### `skill-health.json` (Health Summary)

Periodically aggregated from skill-runs.jsonl:

```json
{
  "lastUpdated": "2026-03-18T12:00:00Z",
  "skills": {
    "web-search": { "runs": 45, "avgScore": 0.95, "trend": "stable", "lastFail": null },
    "api-caller": { "runs": 30, "avgScore": 0.72, "trend": "declining", "lastFail": "2026-03-18T12:05:00Z" },
    "healthcheck": { "runs": 12, "avgScore": 0.83, "trend": "improving", "lastFail": "2026-03-16T08:00:00Z" }
  }
}
```

### `skill-improvements.md` (Improvement History)

Log of all proposed and applied changes.

## Procedure

### Step 1: OBSERVE
```
Read skill-runs.jsonl
Count runs per skill (last 7 days)
```

### Step 2: ANALYZE
```
For each skill:
  - Calculate success rate (7d vs 30d)
  - Detect trend: improving / stable / declining / broken
  - Flag if: avgScore < 0.7 OR trend == declining OR 3+ consecutive fails
```

### Step 3: DIAGNOSE (flagged skills only)
```
Read the SKILL.md of the flagged skill
Read recent failure notes from skill-runs.jsonl
LLM analysis: "Given these failures, what's the root cause?"
```

### Step 4: PROPOSE
```
Generate 1-3 concrete changes:
  - Fix incorrect instructions
  - Add error handling guidance
  - Update outdated API references
  - Add missing prerequisites
```

### Step 5: EVALUATE
```
Score each proposal:
  - Relevance (0-1): Does it address the failure pattern?
  - Safety (0-1): Could it break other functionality?
  - Effort (0-1): How much change is needed?
```

### Step 6: APPLY
```
If relevance > 0.7 AND safety > 0.8 AND not security-sensitive:
  → Auto-apply: edit SKILL.md, log to skill-improvements.md
Otherwise:
  → Write proposal to skill-improvements.md, notify human
```

### Step 7: RECORD
```
Append to skill-improvements.md:
  - Date, skill, diagnosis, proposal, action taken, result
Update skill-health.json with new aggregates
```

## Silent Drift Detection

Triggers when:
- A skill's avgScore drops >15% week-over-week
- A previously 100% skill starts failing
- A model or API upgrade causes behavior changes

## Safety Constraints

- **Never auto-apply** to security-sensitive skills
- **Max 1 auto-edit** per skill per day
- **All edits logged** to skill-improvements.md
- **Human approval required** for: new dependencies, auth changes, destructive operations
- **Rollback**: Previous SKILL.md versions in git history

## Integration

### With Prompt Request Bus
When a skill is flagged, generate a Prompt Request:
```json
{"source":"self-improve","priority":"medium","agent":"skill-owner","task":"Fix declining api-caller skill: 401 errors since March 17"}
```

### With Knowledge Watcher
External changes detected by Knowledge Watcher feed into DIAGNOSE as potential root causes:
```
Knowledge Watcher: "API v2 deprecated on March 15"
Self-Improving: "api-caller failures started March 16 — root cause: deprecated API"
```
