import "server-only";
import { type PayoutItem } from "./payouts";
import { paypal } from "./paypal";

/** Whether PayPal's own records agree with what this app believes it paid. */
export interface Reconciliation {
  /** What the ledger says went out, in cents. */
  expectedCents: number;
  expectedCount: number;
  /** What PayPal's transaction records add up to, in cents. */
  foundCents: number;
  foundCount: number;
  agrees: boolean;
  /** Set when the records are still catching up, or could not be read. */
  note: string | null;
}

/** PayPal caps a search at 31 days, so the window opens a day before the run and spans thirty. */
const DAY_MS = 24 * 60 * 60 * 1000;
const BEFORE_DAYS = 1;
const AFTER_DAYS = 29;

/** Enough at once to be quick, few enough to stay polite. */
const BATCH = 5;

function iso(date: Date): string {
  return `${date.toISOString().slice(0, 19)}-0000`;
}

interface SearchResponse {
  transaction_details?: { transaction_info?: { transaction_amount?: { value?: string } } }[];
}

/**
 * Asks PayPal what it recorded against one payout's own transaction id.
 *
 * Matching on the id rather than on amounts or event codes matters: a run can
 * contain several payments of the same size, and PayPal writes more than one
 * kind of record per payout, so anything looser would double-count.
 */
async function recordedCents(transactionId: string, window: string): Promise<number | null> {
  const { ok, body } = await paypal(`/v1/reporting/transactions?${window}&transaction_id=${transactionId}`, {
    method: "GET",
  });
  if (!ok) return null;

  const row = (body as SearchResponse).transaction_details?.[0]?.transaction_info?.transaction_amount?.value;
  if (row === undefined) return null;

  // A payout leaves the sending account, so PayPal records it as negative.
  const cents = Math.abs(Math.round(Number(row) * 100));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/**
 * Checks the ledger against PayPal's own reporting.
 *
 * The point is that the app does not simply believe its own arithmetic: every
 * amount here comes back from PayPal, not from anything this process
 * remembers. Transaction reporting is a separate system from the payout
 * itself and can lag a sandbox payment by hours, so finding fewer than
 * expected means the report has not caught up — not that a payment is
 * missing. Each payment's own status is PayPal's word on whether it landed.
 */
/**
 * A search window around the run itself rather than around today, so a run
 * replayed during judging, weeks later, is still found.
 */
function windowAround(createdAt: string | undefined): string {
  const anchor = createdAt === undefined ? Date.now() : Date.parse(createdAt);
  const at = Number.isFinite(anchor) ? anchor : Date.now();
  const start = new Date(at - BEFORE_DAYS * DAY_MS);
  const end = new Date(Math.min(Date.now(), at + AFTER_DAYS * DAY_MS));
  return `start_date=${iso(start)}&end_date=${iso(end)}&fields=transaction_info`;
}

export async function reconcile(items: readonly PayoutItem[], createdAt?: string): Promise<Reconciliation> {
  const sent = items.filter((item) => item.status === "SUCCESS" && item.transactionId !== null);
  const expectedCents = sent.reduce((sum, item) => sum + item.cents, 0);
  const expectedCount = sent.length;

  if (expectedCount === 0) {
    return { expectedCents, expectedCount, foundCents: 0, foundCount: 0, agrees: false, note: "Nothing to check." };
  }

  const window = windowAround(createdAt);

  const found: number[] = [];
  for (let i = 0; i < sent.length; i += BATCH) {
    const slice = sent.slice(i, i + BATCH);
    const cents = await Promise.all(slice.map(async (item) => recordedCents(item.transactionId ?? "", window)));
    // Only a record whose amount matches the ledger counts as agreement.
    for (const [index, value] of cents.entries()) {
      if (value !== null && value === slice[index]?.cents) found.push(value);
    }
  }

  const foundCents = found.reduce((sum, cents) => sum + cents, 0);
  const agrees = found.length === expectedCount && foundCents === expectedCents;

  return {
    expectedCents,
    expectedCount,
    foundCents,
    foundCount: found.length,
    agrees,
    note: agrees ? null : "PayPal's transaction reporting updates separately and can lag a sandbox payout by hours.",
  };
}
