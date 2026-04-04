---
name: gitnexus-debugging
description: "Use when the user is debugging a bug, tracing an error, or asking why something fails. Examples: \"Why is X failing?\", \"Where does this error come from?\", \"Trace this bug\""
---

# Debugging with GitNexus

## When to Use

- "Why is this function failing?"
- "Trace where this error comes from"
- "Who calls this method?"
- "This endpoint returns 500"
- Investigating bugs, errors, or unexpected behavior

## Workflow

```
1. `npx gitnexus query "<error or symptom>" --repo judgesystem`   → Find related execution flows
2. `npx gitnexus context "<suspect>" --repo judgesystem`          → See callers/callees/processes
3. `READ gitnexus://repo/{name}/process/{name}`                   → Trace execution flow if helpful
4. `npx gitnexus cypher "MATCH path..." --repo judgesystem`       → Custom traces if needed
5. Read source files and compare current diffs                    → Confirm root cause
```

> If "Index is stale" → run `npx gitnexus analyze` in terminal.

## Checklist

```
- [ ] Understand the symptom (error message, unexpected behavior)
- [ ] `npx gitnexus query` for error text or related code
- [ ] Identify the suspect function from returned processes
- [ ] `npx gitnexus context` to see callers and callees
- [ ] Trace execution flow via process resource if applicable
- [ ] `npx gitnexus cypher` for custom call chain traces if needed
- [ ] `git diff --stat` if you are debugging a recent regression
- [ ] Read source files to confirm root cause
```

## Debugging Patterns

| Symptom              | GitNexus Approach                                          |
| -------------------- | ---------------------------------------------------------- |
| Error message        | `npx gitnexus query` for error text → `context` on throw sites |
| Wrong return value   | `context` on the function → trace callees for data flow    |
| Intermittent failure | `context` → look for external calls, async deps            |
| Performance issue    | `context` → find symbols with many callers (hot paths)     |
| Recent regression    | `git diff --stat` + focused `impact/context`               |

## Tools

**gitnexus query** — find code related to error:

```
npx gitnexus query "payment validation error" --repo judgesystem
→ Processes: CheckoutFlow, ErrorHandling
→ Symbols: validatePayment, handlePaymentError, PaymentException
```

**gitnexus context** — full context for a suspect:

```
npx gitnexus context "validatePayment" --repo judgesystem
→ Incoming calls: processCheckout, webhookHandler
→ Outgoing calls: verifyCard, fetchRates (external API!)
→ Processes: CheckoutFlow (step 3/7)
```

**gitnexus cypher** — custom call chain traces:

```cypher
MATCH path = (a)-[:CodeRelation {type: 'CALLS'}*1..2]->(b:Function {name: "validatePayment"})
RETURN [n IN nodes(path) | n.name] AS chain
```

## Example: "Payment endpoint returns 500 intermittently"

```
1. npx gitnexus query "payment error handling" --repo judgesystem
   → Processes: CheckoutFlow, ErrorHandling
   → Symbols: validatePayment, handlePaymentError

2. npx gitnexus context "validatePayment" --repo judgesystem
   → Outgoing calls: verifyCard, fetchRates (external API!)

3. READ gitnexus://repo/judgesystem/process/CheckoutFlow
   → Step 3: validatePayment → calls fetchRates (external)

4. Root cause: fetchRates calls external API without proper timeout
```
