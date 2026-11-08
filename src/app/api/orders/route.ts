import { NextResponse } from "next/server";
import { parseBudgetCents } from "@/lib/domain/budget";
import { parseRepoRef } from "@/lib/domain/repo-ref";
import { openOrder } from "@/lib/server/orders";
import { z } from "@/lib/zod";

export const runtime = "nodejs";

/** The client may ask for an amount, but the server decides what it really is. */
const bodySchema = z.object({ budgetCents: z.number(), repo: z.string().min(1).max(200) });

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "give a budget and a repository" }, { status: 400 });

  try {
    const cents = parseBudgetCents(parsed.data.budgetCents);
    const { orderId } = await openOrder(cents, parseRepoRef(parsed.data.repo));
    return NextResponse.json({ orderId });
  } catch (error: unknown) {
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "could not create order" }, { status: 502 });
  }
}
