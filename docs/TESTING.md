# Testing

157 tests. The domain layer — everything that decides money — has **100% statement, branch and function coverage**,
enforced as a build threshold rather than reported as a figure. Nothing above that layer is covered by unit tests;
the PayPal path was proven against the live sandbox instead, which is noted honestly below.

```bash
npm run check          # formatting, linting, types, tests
npm run test:coverage   # coverage, which fails under 100% on the domain
```

| Area                                                             | Tests | What it pins down                                   |
| ---------------------------------------------------------------- | ----- | --------------------------------------------------- |
| [`split.test.ts`](../src/lib/domain/split.test.ts)               | 21    | The money rules. Includes 2,000 randomised splits   |
| [`imports.test.ts`](../src/lib/domain/imports.test.ts)           | 33    | Which import forms count, and what is test code     |
| [`people.test.ts`](../src/lib/domain/people.test.ts)             | 22    | Bot detection, shares, and that logins never leak   |
| [`weight.test.ts`](../src/lib/domain/weight.test.ts)             | 20    | Scoring, and the lift for a lone maintainer         |
| [`dependencies.test.ts`](../src/lib/domain/dependencies.test.ts) | 10    | Reading a `package.json` that may be malformed      |
| [`repo-ref.test.ts`](../src/lib/domain/repo-ref.test.ts)         | 19    | The repository forms people actually paste          |
| [`stage-name.test.ts`](../src/lib/domain/stage-name.test.ts)     | 8     | Stable names that do not reveal the login           |
| [`contract.test.ts`](../src/lib/ai/contract.test.ts)             | 11    | That a hostile model reply cannot move a weight far |
| [`budget.test.ts`](../src/lib/domain/budget.test.ts)             | 13    | Amount formatting and range checks                  |

## Randomised testing of the split

Hand-written cases cover the shapes we thought of. Money code also has to survive the ones we did not, so
`split.test.ts` runs a deterministic pseudo-random sweep of awkward weights, shared maintainers and odd budgets,
asserting each time that the payouts sum to exactly the budget, every amount is a whole number of cents, nobody is
paid twice, and nobody is paid a trivial sum. It ran 20,000 times during development and 2,000 on every `npm test`.

## What the tests caught

These are the reasons the suite exists, not hypotheticals:

- **A real person classified as a bot.** Treating any login ending in `bot` as automation also catches someone
  called `abbot`. A wrongly dropped maintainer is paid nothing, so only separated forms like `-bot` and `[bot]`
  count now.
- **Stage names colliding.** A plain FNV-1a hash gave the same name to 20 of 400 similar logins, because taking a
  name with a modulo reads only the hash's low bits. Two maintainers would have appeared as one person on the
  credits roll. Fixed with an avalanche step; now 5 in 400 for adversarial input, 0 for realistic logins.
- **Paying one team twice.** `next` and `eslint-config-next` publish from the same repository, so without merging
  people across packages, that team collected twice while a lone maintainer collected once.

## What is not unit-tested, and why

The PayPal, GitHub and npm layers have no unit tests. Mocking them would mostly assert that the mocks match what I
believed the APIs do — and the one serious bug in that layer was exactly a case where my belief was wrong:

> Payouts spells the currency field `currency`. Orders v2 spells the same thing `currency_code`. The code sent
> `currency_code` to Payouts, which fails with "may not be null". A mock written from the same misunderstanding
> would have passed.

It was caught by sending a real payout to the sandbox. So that layer is verified against the live PayPal sandbox
instead: order creation and capture, a payouts batch reaching `SUCCESS` and `UNCLAIMED`, signature-verified webhooks
arriving at the deployed URL, and reconciliation against PayPal's own transaction records.

## Quality gates

Every one of these fails the build, not just warns:

- TypeScript in strict mode, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- ESLint's `strictTypeChecked` and `stylisticTypeChecked`, plus limits on file length, function length, complexity
  and nesting depth.
- Prettier, checked rather than applied.
- 100% coverage of the domain layer.

Three guards exist only to satisfy the index-safety check and can never run. They are marked as such rather than
given tests for cases that cannot occur.
