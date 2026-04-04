---
name: gitnexus-exploring
description: "Use when the user asks how code works, wants to understand architecture, trace execution flows, or explore unfamiliar parts of the codebase. Examples: \"How does X work?\", \"What calls this function?\", \"Show me the auth flow\""
---

# Exploring Codebases with GitNexus

## When to Use

- "How does authentication work?"
- "What's the project structure?"
- "Show me the main components"
- "Where is the database logic?"
- Understanding code you haven't seen before

## Workflow

```
1. `npx gitnexus status`                                       → Check index freshness
2. `npx gitnexus query "<what you want to understand>" --repo judgesystem`   → Find related execution flows
3. `npx gitnexus context "<symbol>" --repo judgesystem`        → Deep dive on specific symbol
4. `gitnexus_agent_context({query: "..."})`                    → Agent/task routing context when relevant
5. Read source files for implementation details
```

> If step 2 says "Index is stale" → run `npx gitnexus analyze` in terminal.

## Checklist

```
- [ ] `npx gitnexus status`
- [ ] `npx gitnexus query` for the concept you want to understand
- [ ] Review returned processes (execution flows)
- [ ] `npx gitnexus context` on key symbols for callers/callees
- [ ] Use `gitnexus_agent_context` only for agent/task routing questions
- [ ] Read source files for implementation details
```

## Resources

| Resource                                | What you get                                            |
| --------------------------------------- | ------------------------------------------------------- |
| `gitnexus://repo/{name}/context`        | Stats, staleness warning (~150 tokens)                  |
| `gitnexus://repo/{name}/clusters`       | All functional areas with cohesion scores (~300 tokens) |
| `gitnexus://repo/{name}/cluster/{name}` | Area members with file paths (~500 tokens)              |
| `gitnexus://repo/{name}/process/{name}` | Step-by-step execution trace (~200 tokens)              |

## Tools

**gitnexus query** — find execution flows related to a concept:

```
npx gitnexus query "payment processing" --repo judgesystem
→ Processes: CheckoutFlow, RefundFlow, WebhookHandler
→ Symbols grouped by flow with file locations
```

**gitnexus context** — 360-degree view of a symbol:

```
npx gitnexus context "validateUser" --repo judgesystem
→ Incoming calls: loginHandler, apiMiddleware
→ Outgoing calls: checkToken, getUserById
→ Processes: LoginFlow (step 2/5), TokenRefresh (step 1/3)
```

## Example: "How does payment processing work?"

```
1. npx gitnexus status
2. npx gitnexus query "payment processing" --repo judgesystem
   → CheckoutFlow: processPayment → validateCard → chargeStripe
   → RefundFlow: initiateRefund → calculateRefund → processRefund
3. npx gitnexus context "processPayment" --repo judgesystem
   → Incoming: checkoutHandler, webhookHandler
   → Outgoing: validateCard, chargeStripe, saveTransaction
4. Read src/payments/processor.ts for implementation details
```
