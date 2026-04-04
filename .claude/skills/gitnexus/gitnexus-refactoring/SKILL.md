---
name: gitnexus-refactoring
description: "Use when the user wants to rename, extract, split, move, or restructure code safely. Examples: \"Rename this function\", \"Extract this into a module\", \"Refactor this class\", \"Move this to a separate file\""
---

# Refactoring with GitNexus

## When to Use

- "Rename this function safely"
- "Extract this into a module"
- "Split this service"
- "Move this to a new file"
- Any task involving renaming, extracting, splitting, or restructuring code

## Workflow

```
1. `npx gitnexus impact "X" --repo judgesystem --direction upstream` → Map all dependents
2. `npx gitnexus query "X" --repo judgesystem`                       → Find execution flows involving X
3. `npx gitnexus context "X" --repo judgesystem`                     → See all incoming/outgoing refs
4. Plan update order: interfaces → implementations → callers → tests
```

> If "Index is stale" → run `npx gitnexus analyze` in terminal.

## Checklists

### Rename Symbol

```
- [ ] `npx gitnexus context "oldName" --repo judgesystem` — see direct refs
- [ ] `npx gitnexus impact "oldName" --repo judgesystem --direction upstream` — find callers/importers
- [ ] `npx gitnexus query "oldName" --repo judgesystem` — catch dynamic/string refs
- [ ] Apply the rename manually and review the diff carefully
- [ ] `git diff --stat` + `git status --short` — verify only expected files changed
- [ ] Run tests for affected processes
```

### Extract Module

```
- [ ] `npx gitnexus context "<target>" --repo judgesystem` — see all incoming/outgoing refs
- [ ] `npx gitnexus impact "<target>" --repo judgesystem --direction upstream` — find all external callers
- [ ] Define new module interface
- [ ] Extract code, update imports
- [ ] `git diff --stat` + `git status --short` — verify affected scope
- [ ] Run tests for affected processes
```

### Split Function/Service

```
- [ ] `npx gitnexus context "<target>" --repo judgesystem` — understand all callees
- [ ] Group callees by responsibility
- [ ] `npx gitnexus impact "<target>" --repo judgesystem --direction upstream` — map callers to update
- [ ] Create new functions/services
- [ ] Update callers
- [ ] `git diff --stat` + `git status --short` — verify affected scope
- [ ] Run tests for affected processes
```

## Tools

**gitnexus impact** — map all dependents first:

```
npx gitnexus impact "validateUser" --repo judgesystem --direction upstream
→ d=1: loginHandler, apiMiddleware, testUtils
→ Affected Processes: LoginFlow, TokenRefresh
```

**gitnexus context** — understand refs before editing:

```
npx gitnexus context "validateUser" --repo judgesystem
→ Incoming refs, outgoing refs, processes
```

**gitnexus cypher** — custom reference queries:

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "validateUser"})
RETURN caller.name, caller.filePath ORDER BY caller.filePath
```

## Risk Rules

| Risk Factor         | Mitigation                                |
| ------------------- | ----------------------------------------- |
| Many callers (>5)   | Use `impact` and `context` before editing |
| Cross-area refs     | Use `git diff --stat` after to verify scope |
| String/dynamic refs | `npx gitnexus query` to find them         |
| External/public API | Version and deprecate properly            |

## Example: Rename `validateUser` to `authenticateUser`

```
1. npx gitnexus context "validateUser" --repo judgesystem
   → Direct refs and outgoing deps

2. npx gitnexus impact "validateUser" --repo judgesystem --direction upstream
   → Affected: LoginFlow, TokenRefresh

3. npx gitnexus query "validateUser" --repo judgesystem
   → Dynamic/string references to review manually

4. Apply rename manually, then verify with `git diff --stat`
   → Risk: MEDIUM — run tests for these flows
```
