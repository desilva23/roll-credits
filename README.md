# Roll Credits

> Every film ends with credits. Your software doesn't.

Roll Credits reads a codebase, works out which people it really depends on, and pays them through PayPal — ending on
a film-credits roll where each name lights up as PayPal confirms the money arrived.

**Live demo: https://roll-credits-desilva23s-projects.vercel.app** — no sign-in, no setup. Paste a public GitHub
repository, or use the example link on the page.

Built for the PayPal AI Hackathon 2026.

---

## The problem

Every project runs on code written by people its authors have never met, and most of those people are paid nothing
for it. The obvious fix — split money across your dependency list — sends it to the wrong places. Running that naive
split on the author's own app, the single largest recipient was the **test runner**: zero lines of it ship to users.

Roll Credits reads what the code actually does instead.

## How it works

1. **Read the code.** Fetches the repository's `package.json`, then reads up to 150 of its own source files and finds
   every place each dependency is actually imported, recording a file and line. A package nobody imports earns
   nothing. Product code and test code are counted separately.
2. **Weigh it.** A measured score from how often and where each package is used, on a log scale so twenty imports
   don't count four times as much as five.
3. **Find the people.** Follows each package to its GitHub repository and reads who really commits there, dropping
   bots, and notes whether one person is carrying it and whether the project already takes funding.
4. **Favour whoever is alone.** A package is lifted by up to 3× as its maintenance concentrates on one person. This
   is the whole argument: reach the people nobody else is paying. On the example repo it moves one-person projects
   from 16% to 46% of the budget.
5. **Ask the agent.** An LLM reads the real import sites and argues how load-bearing each package is _in this
   codebase_, not by reputation. It can scale a weight between a half and double, and can set no amount at all.
6. **Split it.** Integer cents, largest remainder, always summing to exactly the amount captured. One person is paid
   once however many packages they maintain.
7. **Pay them.** A PayPal order is captured, then a Payouts batch goes out and the credits roll, each name brightening
   as PayPal reports `SUCCESS`.

## What is real, and what is not

|              |                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Real**     | Every PayPal call. Orders, capture, Payouts, signature-verified webhooks — all against the PayPal **sandbox**       |
| **Real**     | The code reading. Live GitHub and npm data, no fixtures                                                             |
| **Real**     | The AI judgements. Groq, at request time                                                                            |
| **Not real** | The money. Sandbox only. The app refuses to talk to live PayPal — the base URL is hard-coded                        |
| **Not real** | The names. Every maintainer appears under a generated film-credit name                                              |
| **Not real** | The recipients. One sandbox test address can receive; all others resolve to `example.com` and come back `UNCLAIMED` |

### Why nobody is named

The hackathon rules make an entrant warrant that nothing published breaches anyone's privacy or publicity rights.
Publishing real, identifiable maintainers alongside an AI's opinion of how they are funded sits squarely inside that.
So every contributor is shown under a name derived from their account, which never leaves the server. No real
maintainer was contacted, named or paid.

## Built with

|            |                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **PayPal** | JS SDK v6 (`createPayPalOneTimePaymentSession`), Orders v2, Payouts, webhooks with signature verification, Transaction Search |
| **AI**     | Groq — `openai/gpt-oss-120b`, with strict JSON-schema output                                                                  |
| **Stack**  | Next.js App Router, TypeScript in strict mode, Zod, Vitest, deployed on Vercel                                                |

## Where the money decisions live

The model argues about importance. It never sees or sets an amount.

| Decision                                         | Made by                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| What a package does here, how load-bearing it is | The agent — [`src/lib/ai/attribute.ts`](src/lib/ai/attribute.ts)                                               |
| How far the agent may move a weight              | Clamped, 0.5×–2× — [`src/lib/ai/contract.ts`](src/lib/ai/contract.ts)                                          |
| Every amount, in integer cents                   | Code alone — [`src/lib/domain/split.ts`](src/lib/domain/split.ts)                                              |
| Whether money moves at all                       | The server, after PayPal confirms the capture — [`src/app/api/payouts/route.ts`](src/app/api/payouts/route.ts) |

Rules the code holds to, each with tests:

- Payouts always sum to exactly the amount PayPal captured.
- No payout before the capture is verified server-side, with PayPal as the source of the amount.
- One payout batch id per order, so a retried request is refused by PayPal rather than paying twice.
- No amount ever comes from the browser or the model.
- Webhooks are rejected unless their signature verifies against the raw request bytes.
- The app cannot reach live PayPal.

## Running it yourself

Needs Node 22 or newer.

```bash
npm install
cp .env.example .env.local   # fill in your own sandbox values
npm run dev
```

Create a **United States** sandbox business account and a sandbox personal account at
[developer.paypal.com](https://developer.paypal.com/), make an app against the business account with **Payouts** and
**Transaction Search** enabled, and copy its client ID and secret into `.env.local`.

**It works without an AI key.** With `GROQ_API_KEY` unset, the agent is skipped and the measured weighting decides on
its own — the whole flow still runs end to end.

```bash
npm run check   # formatting, linting, types and tests
```

## Evaluation

| Criterion                        | How it is addressed                                                                                                                        | Where to look                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Technological implementation** | Six PayPal surfaces working together, an agent reading real code under a clamped contract, and money rules held by tests                   | [`src/lib/server/`](src/lib/server/), [`src/lib/ai/`](src/lib/ai/), [`src/lib/domain/split.test.ts`](src/lib/domain/split.test.ts) |
| **Design**                       | A complete path from a pasted URL to money arriving. Two deliberate worlds: a monospaced cutting room, and cinema                          | [`src/app/globals.css`](src/app/globals.css), [`src/components/`](src/components/)                                                 |
| **Potential impact**             | Measured on a real repository, not asserted. The naive split's largest payee was the test runner; this one's is a maintainer working alone | [`src/lib/domain/weight.ts`](src/lib/domain/weight.ts)                                                                             |
| **Innovation**                   | Pays by what the code calls, not what it lists. Favours whoever is unsupported. Names nobody without consent                               | [`src/lib/domain/stage-name.ts`](src/lib/domain/stage-name.ts)                                                                     |
| **Presentation**                 | The demo ends on names lighting up as PayPal confirms each payment                                                                         | [`src/components/CreditsRoll.tsx`](src/components/CreditsRoll.tsx)                                                                 |

157 tests. The domain logic — everything that decides money — has full statement and branch coverage.

## Isn't this thanks.dev, or GitHub Sponsors?

Those settle _how_ money moves once you already know who to pay. Roll Credits answers the earlier question: given this
codebase, which humans does it actually rest on, and which of them has nobody paying them? It reads call sites rather
than a dependency list, separates volunteers from staffed teams, and attaches evidence to every amount.

## Licence

[MIT](LICENSE)
