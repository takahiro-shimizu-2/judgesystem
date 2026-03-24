# Knowledge Watcher

## Description
Monitors external knowledge sources for changes, assesses impact on your agent skills, and generates improvement requests. The "eyes and ears" of the self-improving loop.

## Architecture

```
Knowledge Sources    Knowledge Watcher    Prompt Request    Executor
  (external)            (diff detect)       (routing)        (fix)

 API changelogs ──┐
 Dependency versions┤
 Community patterns ┤  ┌──────────┐   ┌─────────────┐   ┌─────────┐
 Platform updates  ─┼─→│ Diff      │──→│ Impact      │──→│ Auto-fix│
 Tech blogs/RSS ───┤  │ Detection │   │ Assessment  │   │ or      │
 Competitor releases┘  └──────────┘   └─────────────┘   │ Notify  │
                                                         └─────────┘
```

## Knowledge Sources

### Tier 1: Direct Impact (every check)

| Source | How to Monitor | Example |
|--------|---------------|---------|
| Dependency versions | `npm view`, `pip show`, version commands | Framework updates |
| API changelogs | Fetch changelog URLs | Breaking API changes |
| Config drift | Compare current vs expected state | Settings changed unexpectedly |
| Internal issues | Issue tracker queries | New bugs filed |

### Tier 2: Indirect Impact (daily)

| Source | How to Monitor | Example |
|--------|---------------|---------|
| Community channels | Read recent messages | Recurring user complaints |
| Support patterns | Analyze FAQ frequency | New common failure modes |
| Platform changes | Check platform status pages | Provider policy updates |

### Tier 3: Trends (weekly)

| Source | How to Monitor | Example |
|--------|---------------|---------|
| Tech blogs | Web search for key topics | New best practices |
| Competitor releases | Web search for alternatives | Feature parity gaps |
| Industry trends | Curated RSS / search | Paradigm shifts |

## Data Files

### `knowledge-state.json` (Last Known State)

```json
{
  "lastCheck": "2026-03-18T05:30:00Z",
  "sources": {
    "my-framework": { "version": "2.1.0", "checkedAt": "2026-03-18T05:30:00Z" },
    "api-service": { "version": "v3", "checkedAt": "2026-03-18T05:30:00Z" },
    "community-patterns": { "topIssues": [], "checkedAt": null },
    "tech-trends": { "topics": [], "checkedAt": null }
  }
}
```

### `knowledge-diffs.jsonl` (Detected Changes)

```jsonl
{"ts":"2026-03-18T05:30:00Z","source":"my-framework","type":"version_change","detail":"2.1.0 → 2.2.0","affectedSkills":["*"],"severity":"medium","processed":false}
{"ts":"2026-03-18T05:30:00Z","source":"api-service","type":"breaking_change","detail":"auth endpoint moved to /v3/auth","affectedSkills":["api-caller"],"severity":"high","processed":false}
```

## Procedure

### Phase 1: SCAN (Diff Detection)

```
1. Read knowledge-state.json (previous state)
2. For each Tier 1 source:
   a. Fetch current state
   b. Compare with previous
   c. If changed → append to knowledge-diffs.jsonl
3. If daily check time → also run Tier 2
4. If weekly check time → also run Tier 3
5. Update knowledge-state.json
```

### Phase 2: ASSESS (Impact Evaluation)

```
For each detected diff:
1. Identify affected skills (from affectedSkills field or LLM analysis)
2. Read affected SKILL.md files
3. Severity rating:
   - critical: Skill will break (API removed, auth changed)
   - high: Quality will degrade (model changed, spec updated)
   - medium: Improvement opportunity (new feature, better practice)
   - low: FYI (trend info, competitor news)
```

### Phase 3: REQUEST (Action Generation)

```
Based on severity:

critical/high:
  → Immediate notification to human
  → Generate Prompt Request with high priority
  → Feed to Self-Improving Skills for diagnosis

medium:
  → Generate Prompt Request with medium priority
  → Queue for next processing cycle
  → Log to knowledge-diffs.jsonl

low:
  → Log to knowledge-diffs.jsonl only
  → Include in periodic summary reports
```

## Scheduling

Recommended cron schedule:
```
Tier 1: Every 6 hours
Tier 2: Twice daily (morning + evening)
Tier 3: Once weekly (Monday morning)
```

## Integration

### → Self-Improving Skills
Detected diffs become inputs to the DIAGNOSE step:
```
Knowledge Watcher: "Framework updated from 2.1.0 to 2.2.0"
Self-Improving: "skill-x failures started after framework update — root cause identified"
```

### → Prompt Request Bus
All actions route through the bus:
```json
{"source":"knowledge-watcher","priority":"high","task":"Update api-caller skill: auth endpoint moved to /v3/auth","affectedSkills":["api-caller"]}
```

## Constraints
- Minimize API calls (respect rate limits)
- Max 3 web searches per check cycle
- Batch notifications (only critical = immediate)
- Store all diffs for audit trail
