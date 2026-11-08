import { NextResponse } from "next/server";
import { capturedOrder } from "@/lib/server/orders";
import { type PayoutItem, readPayouts, sendPayouts } from "@/lib/server/payouts";
import { reconcile } from "@/lib/server/reconcile";
import { planPayments } from "@/lib/server/pipeline";
import { z } from "@/lib/zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const ORDER_ID = /^[A-Z0-9]{5,30}$/;
const BATCH_ID = /^[A-Z0-9]{5,30}$/;

const startSchema = z.object({ orderId: z.string().regex(ORDER_ID) });
const pollSchema = z.object({
  batchId: z.string().regex(BATCH_ID),
  items: z
    .array(
      z.object({
        id: z.string().max(64),
        name: z.string().max(120),
        cents: z.number(),
        status: z.string().max(32),
        transactionId: z.string().max(64).nullable().default(null),
      }),
    )
    .max(40),
});

/** Still moving, so there is nothing settled to reconcile yet. */
const IN_FLIGHT = new Set(["PENDING", "PROCESSING"]);

/**
 * Reports where a payout run has got to, and once it has settled, checks the
 * ledger against PayPal's own transaction records rather than trusting this
 * app's arithmetic.
 */
async function pollRun(batchId: string, items: PayoutItem[]): Promise<NextResponse> {
  try {
    const run = await readPayouts(batchId, items);
    const settled = run.items.every((item) => !IN_FLIGHT.has(item.status));
    const worthChecking = settled && run.items.some((item) => item.status === "SUCCESS");
    return NextResponse.json({
      ...run,
      reconciliation: worthChecking ? await reconcile(run.items, run.createdAt) : null,
    });
  } catch {
    return NextResponse.json({ error: "could not read the payout" }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const raw: unknown = await request.json().catch(() => null);

  const poll = pollSchema.safeParse(raw);
  if (poll.success) return pollRun(poll.data.batchId, poll.data.items);

  const start = startSchema.safeParse(raw);
  if (!start.success) return NextResponse.json({ error: "give an order id" }, { status: 400 });

  // Both the amount and the repository come from PayPal's own record of the
  // order, never from the request, and no money moves until PayPal confirms
  // the capture completed.
  const captured = await capturedOrder(start.data.orderId);
  if (captured === null) {
    return NextResponse.json({ error: "that order has not been captured" }, { status: 402 });
  }

  try {
    const plan = await planPayments(captured.ref, captured.cents);
    if (plan.allocations.length === 0) {
      return NextResponse.json({ error: "nobody in this repository can be paid" }, { status: 422 });
    }
    return NextResponse.json(await sendPayouts(start.data.orderId, plan.allocations));
  } catch (error: unknown) {
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("payout run failed", error);
    return NextResponse.json({ error: "the payout failed" }, { status: 502 });
  }
}
