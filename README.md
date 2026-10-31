# Roll Credits

> Every film ends with credits. Your software doesn't.

Roll Credits reads your code, finds the people it really depends on, and pays them through PayPal.

Built for the PayPal AI Hackathon 2026. **Every payment runs in the PayPal sandbox. No real money moves, and no real
maintainer is contacted or paid.**

## Status

Early scaffold. The funding button, order capture and verified webhook handler work; the scanner, attribution agent,
split engine and credits roll are still to come.

## Running it locally

Requires Node 22 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in your own sandbox values
npm run dev
```

Create a **United States** sandbox business account and a sandbox personal account at
[developer.paypal.com](https://developer.paypal.com/), make an app against the business account, and copy its client ID
and secret into `.env.local`.

## Checks

```bash
npm run check   # formatting, linting, types and tests
```

## Licence

[MIT](LICENSE)
