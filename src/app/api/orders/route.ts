import { NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { parseBudgetCents, toAmountValue } from "@/lib/domain/budget";
import { paypal } from "@/lib/server/paypal";

export const runtime = "nodejs";

/** The client may ask for an amount, but the server decides what it really is. */
const bodySchema = z.object({ budgetCents: z.number() });

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  let cents: number;
  try {
    cents = parseBudgetCents(parsed.data.budgetCents);
  } catch {
    return NextResponse.json({ error: "budget out of range" }, { status: 400 });
  }

  const { ok, status, body } = await paypal("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": crypto.randomUUID() },
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: "USD", value: toAmountValue(cents) },
          description: "Roll Credits funding round",
        },
      ],
    },
  });
  if (!ok) {
    console.error("order create failed", status, body);
    return NextResponse.json({ error: "could not create order" }, { status: 502 });
  }

  const { id } = body as { id: string };
  return NextResponse.json({ orderId: id });
}
