---
name: gitnexus-impact-analysis
description: "Use when the user wants to know what will break if they change something, or needs safety analysis before editing code. Examples: \"Is it safe to change X?\", \"What depends on this?\", \"What will break?\""
---

# Impact Analysis with GitNexus

## When to Use

- "Is it safe to change this function?"
- "What will break if I modify X?"
- "Show me the blast radius"
- "Who uses this code?"
- Before making non-trivial code changes
- Before committing — to understand what your changes affect

## Workflow

```
1. `npx gitnexus impact "X" --repo judgesystem --direction upstream` → What depends on this
2. `npx gitnexus query "X" --repo judgesystem`                       → Check affected execution flows
3. `READ gitnexus://repo/{name}/processes`                           → Trace affected flows when needed
4. `git diff --stat` + `git status --short`                          → Map current git changes to affected scope
5. Assess risk and report to user
```

> If "Index is stale" → run `npx gitnexus analyze` in terminal.

## Checklist

```
- [ ] `npx gitnexus impact "<target>" --repo judgesystem --direction upstream` to find dependents
- [ ] Review d=1 items first (these WILL BREAK)
- [ ] Use `npx gitnexus query "<target>" --repo judgesystem` to check affected execution flows
- [ ] READ process resources when you need the full flow trace
- [ ] `git diff --stat` and `git status --short` for pre-commit scope check
- [ ] Assess risk level and report to user
```

## Understanding Output

| Depth | Risk Level       | Meaning                  |
| ----- | ---------------- | ------------------------ |
| d=1   | **WILL BREAK**   | Direct callers/importers |
| d=2   | LIKELY AFFECTED  | Indirect dependencies    |
| d=3   | MAY NEED TESTING | Transitive effects       |

## Risk Assessment

| Affected                       | Risk     |
| ------------------------------ | -------- |
| <5 symbols, few processes      | LOW      |
| 5-15 symbols, 2-5 processes    | MEDIUM   |
| >15 symbols or many processes  | HIGH     |
| Critical path (auth, payments) | CRITICAL |

## Tools

**gitnexus impact** — the primary CLI for symbol blast radius:

```
npx gitnexus impact "validateUser" --repo judgesystem --direction upstream

→ d=1 (WILL BREAK):
  - loginHandler (src/auth/login.ts:42) [CALLS, 100%]
  - apiMiddleware (src/api/middleware.ts:15) [CALLS, 100%]

→ d=2 (LIKELY AFFECTED):
  - authRouter (src/routes/auth.ts:22) [CALLS, 95%]
```

**Local scope check** — use git diff when `detect_changes` is unavailable:

```
git diff --stat
git status --short
```

## Example: "What breaks if I change validateUser?"

```
1. npx gitnexus impact "validateUser" --repo judgesystem --direction upstream
   → d=1: loginHandler, apiMiddleware (WILL BREAK)
   → d=2: authRouter, sessionManager (LIKELY AFFECTED)

2. npx gitnexus query "validateUser" --repo judgesystem
   → LoginFlow and TokenRefresh touch validateUser

3. Risk: 2 direct callers, 2 processes = MEDIUM
```
