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

A read takes about fourteen seconds cold and three warm. The endpoint streams a line as each stage finishes, so the
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

## Why the agent cannot move money

[`ai/contract.ts`](../src/lib/ai/contract.ts) defines what a judgement may contain and how far it may reach:

- The reply is parsed with Zod. Anything malformed is discarded entirely.
- `importance` is clamped to 0–1, then mapped to a multiplier between 0.5 and 2.
- Judgements for packages the agent was not asked about are dropped.
- Any failure — no key, a timeout, a rate limit, nonsense — returns nothing, and the measured weighting stands.

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

GitHub and npm reads are cached for an hour: public data that barely changes, and the difference between a
fourteen-second wait and a three-second one. Every PayPal call sets `no-store`.

## Naming

Maintainers appear under a generated film-credit name derived from their login, which never leaves the server. See
[`domain/stage-name.ts`](../src/lib/domain/stage-name.ts) for why, and [TESTING.md](TESTING.md) for the hash problem
this turned up.
