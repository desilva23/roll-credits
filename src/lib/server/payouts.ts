import "server-only";
import { type Allocation } from "@/lib/domain/split";
import { toAmountValue } from "@/lib/domain/budget";
import { paypal } from "./paypal";

/** What PayPal says about one person's payment. */
export interface PayoutItem {
  id: string;
  name: string;
  cents: number;
  /** PayPal's own word: SUCCESS, UNCLAIMED, PENDING, FAILED, BLOCKED, ONHOLD… */
  status: string;
}

export interface PayoutRun {
  batchId: string;
  batchStatus: string;
  items: PayoutItem[];
}

/**
 * Only this one real sandbox account can receive money. Everyone else is sent
 * to a `@example.com` address, which PayPal accepts and then reports as
 * UNCLAIMED. That is both the honest demonstration — almost no maintainer has
 * a payment route today — and the hard guarantee that nothing this project
 * sends can reach a real person's inbox.
 */
const CLAIMED_RECEIVER = process.env.PAYPAL_SANDBOX_RECEIVER ?? "sb-io9zf53636210@personal.example.com";

/** One run per order, so retrying a failed request cannot pay twice. */
function batchIdFor(orderId: string): string {
  return `rollcredits-${orderId}`;
}

/**
 * Sends the payouts for a plan.
 *
 * The caller must already have verified the capture with PayPal: this function
 * moves money and checks nothing. `sender_batch_id` is derived from the order,
 * and PayPal rejects a repeat within 30 days, so a retried request is refused
 * by PayPal rather than paying anyone twice.
 */
export async function sendPayouts(orderId: string, allocations: readonly Allocation[]): Promise<PayoutRun> {
  const items = allocations.map((a, index) => ({
    recipient_type: "EMAIL" as const,
    amount: { value: toAmountValue(a.cents), currency_code: "USD" },
    // The first person has claimed their profile; the rest have not, so their
    // money waits for them and returns to the sender after 30 days.
    receiver: index === 0 ? CLAIMED_RECEIVER : `unclaimed-${a.id}@example.com`,
    note: "Thank you for the code this project is built on.",
    sender_item_id: a.id,
  }));

  const { ok, status, body } = await paypal("/v1/payments/payouts", {
    method: "POST",
    body: {
      sender_batch_header: {
        sender_batch_id: batchIdFor(orderId),
        email_subject: "Roll Credits",
        email_message: "A project you maintain was credited.",
      },
      items,
    },
  });
  if (!ok) {
    console.error("payout failed", status, body);
    throw new Error("PayPal refused the payout");
  }

  const created = body as { batch_header: { payout_batch_id: string; batch_status: string } };
  return {
    batchId: created.batch_header.payout_batch_id,
    batchStatus: created.batch_header.batch_status,
    items: allocations.map((a) => ({ id: a.id, name: a.name, cents: a.cents, status: "PENDING" })),
  };
}

/** Reads the current state of a run. The roll polls this rather than waiting on webhooks. */
export async function readPayouts(batchId: string, known: readonly PayoutItem[]): Promise<PayoutRun> {
  const { ok, body } = await paypal(`/v1/payments/payouts/${batchId}`, { method: "GET" });
  if (!ok) throw new Error("could not read the payout");

  const batch = body as {
    batch_header: { batch_status: string };
    items?: { payout_item?: { sender_item_id?: string }; transaction_status?: string }[];
  };
  const states = new Map(
    (batch.items ?? []).flatMap((row) =>
      row.payout_item?.sender_item_id === undefined ? [] : [[row.payout_item.sender_item_id, row.transaction_status]],
    ),
  );

  return {
    batchId,
    batchStatus: batch.batch_header.batch_status,
    items: known.map((item) => ({ ...item, status: states.get(item.id) ?? item.status })),
  };
}
