# Architecture

One rule shapes everything here: **the model argues, the code decides.** An LLM is good at reading a call site and
saying what a package is for. It is the wrong thing to let near an amount of money. So the agent returns a number
between 0 and 1 and a sentence, both validated against a schema and clamped, and a pure function with no network
access turns weights into cents.

## Layers

```
src/lib/domain/   pure functions, no network, no clock, no model   (fully tested)
src/lib/ai/       the agent and the contract it must meet
src/lib/server/   talks to GitHub, npm and PayPal
src/app/api/      HTTP, validation, and the order of operations
src/components/   the screens
```

`domain` imports nothing from the layers above it. That is what makes the money rules testable without mocking a
payment processor.

## A read, end to end

A read takes about seven seconds cold and under two warm, measured on the deployed site. The endpoint streams a line as each stage finishes, so the
page can say what is happening rather than sitting silent.

| Stage                     | Does what                                                                                                                                                                                     | Where                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1. Scan                   | Reads `package.json`, then up to 150 of the repository's own source files, recording a file and line for every import of a declared dependency. Product code and test code counted separately | [`server/scan.ts`](../src/lib/server/scan.ts), [`domain/imports.ts`](../src/lib/domain/imports.ts)   |
| 2. Weigh                  | A measured score from use count on a log scale, shipped code worth more than the build                                                                                                        | [`domain/weight.ts`](../src/lib/domain/weight.ts)                                                    |
| 3. People                 | Follows each package to its GitHub repository, reads who commits, drops bots, assigns a stage name                                                                                            | [`server/people.ts`](../src/lib/server/people.ts), [`domain/people.ts`](../src/lib/domain/people.ts) |
| 4. Favour the unsupported | Lifts a package by up to 3× as its maintenance concentrates on one person                                                                                                                     | [`domain/weight.ts`](../src/lib/domain/weight.ts)                                                    |
| 5. Judge                  | The agent reads the real import sites and scales the weight between 0.5× and 2×                                                                                                               | [`ai/attribute.ts`](../src/lib/ai/attribute.ts)                                                      |
| 6. Split                  | Integer cents, largest remainder, summing to exactly the budget                                                                                                                               | [`domain/split.ts`](../src/lib/domain/split.ts)                                                      |

Files are read product-first, so when the 150-file budget runs out it is test files that were skipped.

## A payment, end to end

```
browser                         server                          PayPal
   |  Fund $25.00                  |                               |
   |----------------------------->  create order ----------------> |
   |  buyer approves in PayPal      |                               |
   |----------------------------->  capture ----------------------> |
   |  orderId + repo               |                               |
   |----------------------------->  GET order: what was captured? ->|
   |                               |  re-derive the plan from that  |
   |                               |  amount, then send payouts --->|
   |  poll for states              |                               |
   |<----------------------------  read batch, then reconcile <-----|
```

The browser sends an order id and a repository name. It never sends an amount. The server asks PayPal what was
actually captured and rebuilds the plan from that figure, so a tampered request cannot change what anyone is paid.

## A payment started by a coding agent

```
coding agent ── who_to_credit ──────────────> /api/mcp ── reads the repo, returns the plan
coding agent ── credit_maintainers($10) ────> /api/mcp ── opens a PayPal order with the
                                                          repository sealed in custom_id
                                                          and returns its approval link
person ─────── approves in PayPal ──────────> PayPal ──── returns to /?funded&token=ORDER
browser ─────── capture, then payouts ──────> server ──── reads amount and repository from
                                                          PayPal, then pays
```

The repository travels inside the PayPal order, not through the browser or the agent, so nothing either sends after
approval can redirect the money. The MCP server is stateless JSON over Streamable HTTP: no sessions and no
server-initiated stream, which is all two tools need, and it lets any serverless instance answer any message.

## Why the agent cannot move money

[`ai/contract.ts`](../src/lib/ai/contract.ts) defines what a judgement may contain and how far it may reach:

- The reply is parsed with Zod. Anything malformed is discarded entirely.
- `importance` is clamped to 0–1, then mapped to a multiplier between 0.5 and 2.
- Judgements for packages the agent was not asked about are dropped.
- If the larger model is at its rate limit, the smaller one is asked. Groq budgets tokens per model, so the second
  model has its own allowance rather than sharing the first one's.
- Any other failure — no key, a timeout, both models busy, nonsense — returns nothing, and the measured weighting
  stands. The page says which of these happened, rather than presenting measurement alone as the agent's view.

That last point matters for judging as well as safety: **the whole flow runs with no AI key.**

Source code from public repositories is untrusted input that can contain text shaped like instructions. Evidence
lines are stripped of control characters, truncated, fenced in the prompt, and the model is told to describe code
rather than obey it.

## Reconciliation, and its limit

After a run settles, each payout is looked up in PayPal's transaction reporting by its own transaction id and the
amounts compared with the ledger. Matching on the id matters: a run can contain several payments of the same size,
and PayPal writes more than one kind of record per payout, so matching on amounts or event codes double-counts.

**Reporting lags.** In the sandbox a payout can take hours to appear in transaction search, well beyond a demo. A
payout not yet found there is not a payment that failed — each item carries PayPal's own `SUCCESS` — so the screen
says the reporting has not caught up rather than reporting a disagreement.

## Caching

GitHub and npm reads are cached for an hour: public data that barely changes. With the agent's judgements cached as
well, a repeat read takes under two seconds rather than seven. Every PayPal call sets `no-store`.

The agent's judgements are cached for a week, keyed on the models, the prompt and the exact evidence the agent was
shown. That serves two ends. The same code is judged the same way on a second read, so the figures in a demo are the
figures a visitor sees. And one reading costs three to four thousand tokens of an eight-thousand-a-minute budget,
so a cached reading is one that cannot hit the limit. Only a real judgement is kept: a busy or failed answer is not
remembered, so the next read asks again.

## Naming

Maintainers appear under a generated film-credit name. The login never leaves the server; the name is taken from
an HMAC-SHA256 of it, under a key that never leaves the server either: `STAGE_NAME_SECRET` when it is set, otherwise
a key derived from the PayPal client secret, so every deployment with the same credentials names a person the same
way. The ids that tie a person's payouts together are made the same way under a different purpose label, so a name
and an id cannot be worked from each other.

The key is the point. An unkeyed hash can be reversed in practice by hashing a project's public contributor list
and seeing which login gives the name on screen. What no generated name can hide is a public fact, such as who
wrote nearly all of a well-known package. See [`domain/stage-name.ts`](../src/lib/domain/stage-name.ts) for why
names are generated at all, and [TESTING.md](TESTING.md) for the collision problem the first hash turned up.
