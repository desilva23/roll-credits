# Testing

345 tests in 29 files.

- **The domain layer — everything that decides money — has 100% statement, branch and function coverage**, enforced
  as a build threshold rather than reported as a figure.
- **The server layer is 92% covered** (89% of branches), measured rather than enforced. That covers the PayPal,
  GitHub, npm and Groq clients, the orchestrator and the endpoints that hold logic. The untested remainder is three
  endpoints of about fifteen lines each that only validate a body and call a tested function.

```bash
npm run check           # formatting, linting, types, tests
npm run test:coverage   # coverage, which fails under 100% on the domain
```

## The domain: money and judgement

| Area                                                             | Tests | What it pins down                                            |
| ---------------------------------------------------------------- | ----- | ------------------------------------------------------------ |
| [`split.test.ts`](../src/lib/domain/split.test.ts)               | 22    | The money rules. Includes 2,000 randomised splits            |
| [`compare.test.ts`](../src/lib/domain/compare.test.ts)           | 13    | The dependency-list comparison, measured rather than claimed |
| [`apportion.test.ts`](../src/lib/domain/apportion.test.ts)       | 12    | Splitting cents so the parts always sum to the whole         |
| [`imports.test.ts`](../src/lib/domain/imports.test.ts)           | 33    | Which import forms count, and what is test code              |
| [`people.test.ts`](../src/lib/domain/people.test.ts)             | 22    | Bot detection, shares, and that logins never leak            |
| [`weight.test.ts`](../src/lib/domain/weight.test.ts)             | 20    | Scoring, and the lift for a lone maintainer                  |
| [`stage-name.test.ts`](../src/lib/domain/stage-name.test.ts)     | 11    | Keyed names: stable, and unworkable without the secret       |
| [`repo-ref.test.ts`](../src/lib/domain/repo-ref.test.ts)         | 19    | The repository forms people actually paste                   |
| [`budget.test.ts`](../src/lib/domain/budget.test.ts)             | 13    | Amount formatting and range checks                           |
| [`dependencies.test.ts`](../src/lib/domain/dependencies.test.ts) | 10    | Reading a `package.json` that may be malformed               |
| [`text.test.ts`](../src/lib/domain/text.test.ts)                 | 5     | Counts said the way a person says them                       |
| [`contract.test.ts`](../src/lib/ai/contract.test.ts)             | 11    | That a hostile model reply cannot move a weight far          |

## The server: PayPal, GitHub, npm, Groq and the endpoints

These replace the network with a stand-in and check what each layer sends and how it reads the answer.

| Area                                                                      | Tests | What it pins down                                                                |
| ------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------- |
| [`payouts.test.ts`](../src/lib/server/payouts.test.ts)                    | 8     | The payout request, including the field that once broke every payout             |
| [`orders.test.ts`](../src/lib/server/orders.test.ts)                      | 13    | The repository sealed into an order, and read back only from a completed capture |
| [`reconcile.test.ts`](../src/lib/server/reconcile.test.ts)                | 8     | Matching by transaction id, and a lag reported as a lag                          |
| [`attribute.test.ts`](../src/lib/ai/attribute.test.ts)                    | 11    | Falling back to the smaller model when the larger is busy; never throwing        |
| [`pipeline.test.ts`](../src/lib/server/pipeline.test.ts)                  | 12    | The read end to end, and what the page is told about the agent                   |
| [`mcp-tools.test.ts`](../src/lib/server/mcp-tools.test.ts)                | 13    | That an agent cannot open a payment nobody could be paid from                    |
| [`github.test.ts`](../src/lib/server/github.test.ts)                      | 16    | Which files are read first, and errors in words a person can act on              |
| [`npm.test.ts`](../src/lib/server/npm.test.ts)                            | 10    | Every way npm records a repository and its funding                               |
| [`env.test.ts`](../src/lib/server/env.test.ts)                            | 7     | Sandbox only, and how the naming secret is chosen                                |
| [`paypal.test.ts`](../src/lib/server/paypal.test.ts)                      | 5     | Signing in once and reusing the token until it expires                           |
| [`people.test.ts`](../src/lib/server/people.test.ts)                      | 5     | Who maintains a package, and whether one person carries it                       |
| [`scan.test.ts`](../src/lib/server/scan.test.ts)                          | 4     | Shipped uses and test uses, counted apart                                        |
| [MCP endpoint](../src/app/api/mcp/route.test.ts)                          | 13    | The protocol: versions, tools, notifications, batches, errors                    |
| [Payout endpoint](../src/app/api/payouts/route.test.ts)                   | 10    | No money moves before PayPal confirms the capture                                |
| [Capture endpoint](../src/app/api/orders/[orderId]/capture/route.test.ts) | 7     | Order ids, and capturing only once                                               |
| [Reading endpoint](../src/app/api/plan/route.test.ts)                     | 7     | Streaming the steps, then the plan or a plain error                              |
| [Webhook endpoint](../src/app/api/paypal/webhook/route.test.ts)           | 5     | Nothing acted on unless PayPal verifies the signature                            |

## Randomised testing of the split

Hand-written cases cover the shapes we thought of. Money code also has to survive the ones we did not, so
`split.test.ts` runs a deterministic pseudo-random sweep of awkward weights, shared maintainers and odd budgets,
asserting each time that the payouts sum to exactly the budget, every amount is a whole number of cents, nobody is
paid twice, and nobody is paid a trivial sum. It ran 20,000 times during development and 2,000 on every `npm test`.

## What the tests caught

These are the reasons the suite exists, not hypotheticals:

- **A real person classified as a bot.** Treating any login ending in `bot` as automation also catches someone
  called `abbot`. A wrongly dropped maintainer is paid nothing, so only separated forms like `-bot` and `[bot]` count.
- **Stage names colliding.** A plain FNV-1a hash gave the same name to 20 of 400 similar logins, because taking a
  name with a modulo reads only the hash's low bits. An avalanche step fixed that. The hash was later replaced
  outright by HMAC-SHA256, because any unkeyed hash lets someone match a name back to an account by hashing a
  project's public contributor list.
- **Paying one team twice.** `next` and `eslint-config-next` publish from the same repository, so without merging
  people across packages, that team collected twice while a lone maintainer collected once.
- **Packages that look unmaintained.** npm accepts `owner/name` as shorthand for a GitHub repository. The resolver
  only recognised full URLs, so a package published that way would have come back with nobody to pay. Found while
  writing the npm tests.

## The limit of mocking PayPal

Mocks only check the code against what I believed the API does. The most serious bug in the payment layer was
exactly a case where that belief was wrong:

> Payouts spells the currency field `currency`. Orders v2 spells the same thing `currency_code`. The code sent
> `currency_code` to Payouts, which fails with "may not be null", so no payout from the app could have succeeded.

A mock written from the same misunderstanding would have passed. It was caught by sending a real payout to the
sandbox, and `payouts.test.ts` now pins the right field so it cannot come back. So the payment layer is tested both
ways: unit tests for what the code sends, and real sandbox runs for what PayPal accepts — order creation and
capture, a payouts batch reaching `SUCCESS` and `UNCLAIMED`, signature-verified webhooks arriving at the deployed
URL, and reconciliation against PayPal's own transaction records. The order schema was also checked against
PayPal's JSON for a real captured order.

## Quality gates

Every one of these fails the build, not just warns:

- TypeScript in strict mode, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- ESLint's `strictTypeChecked` and `stylisticTypeChecked`, plus limits on file length, function length, complexity
  and nesting depth.
- Prettier, checked rather than applied.
- 100% coverage of the domain layer.

A few guards exist only to satisfy the index-safety check and can never run. They are marked as such rather than
given tests for cases that cannot occur.
