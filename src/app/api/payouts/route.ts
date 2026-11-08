import { NextResponse } from "next/server";
import { parseRepoRef } from "@/lib/domain/repo-ref";
import { readPayouts, sendPayouts } from "@/lib/server/payouts";
import { paypal } from "@/lib/server/paypal";
import { planPayments } from "@/lib/server/pipeline";
import { z } from "@/lib/zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const ORDER_ID = /^[A-Z0-9]{5,30}$/;
const BATCH_ID = /^[A-Z0-9]{5,30}$/;

const startSchema = z.object({ orderId: z.string().regex(ORDER_ID), repo: z.string().min(1).max(200) });
const pollSchema = z.object({
  batchId: z.string().regex(BATCH_ID),
  items: z
    .array(
      z.object({ id: z.string().max(64), name: z.string().max(120), cents: z.number(), status: z.string().max(32) }),
    )
    .max(40),
});

interface OrderView {
  status?: string;
  purchase_units?: { payments?: { captures?: { status?: string; amount?: { value?: string } }[] } }[];
}

/** The completed capture on an order, if there is one. */
function completedCapture(order: OrderView): { value?: string } | null {
  if (order.status !== "COMPLETED") return null;
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  return capture?.status === "COMPLETED" ? (capture.amount ?? null) : null;
}

/** Confirms with PayPal that the order was really captured, and for how much. */
async function capturedCents(orderId: string): Promise<number | null> {
  const { ok, body } = await paypal(`/v2/checkout/orders/${orderId}`, { method: "GET" });
  if (!ok) return null;

  const amount = completedCapture(body as OrderView);
  if (amount?.value === undefined) return null;

  const cents = Math.round(Number(amount.value) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const raw: unknown = await request.json().catch(() => null);

  const poll = pollSchema.safeParse(raw);
  if (poll.success) {
    try {
      return NextResponse.json(await readPayouts(poll.data.batchId, poll.data.items));
    } catch {
      return NextResponse.json({ error: "could not read the payout" }, { status: 502 });
    }
  }

  const start = startSchema.safeParse(raw);
  if (!start.success) return NextResponse.json({ error: "give an order and a repository" }, { status: 400 });

  // The amount comes from PayPal, never from the browser, and no money moves
  // until PayPal itself confirms the capture completed.
  const cents = await capturedCents(start.data.orderId);
  if (cents === null || cents <= 0) {
    return NextResponse.json({ error: "that order has not been captured" }, { status: 402 });
  }

  try {
    const plan = await planPayments(parseRepoRef(start.data.repo), cents);
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
