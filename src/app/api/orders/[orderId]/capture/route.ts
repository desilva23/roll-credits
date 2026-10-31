import { NextResponse } from "next/server";
import { paypal } from "@/lib/server/paypal";

export const runtime = "nodejs";

/** PayPal order IDs are short uppercase alphanumerics; anything else is not ours. */
const ORDER_ID = /^[A-Z0-9]{5,30}$/;

interface CaptureResponse {
  status?: string;
  purchase_units?: { payments?: { captures?: { amount?: { value?: string } }[] } }[];
}

/** The captured amount is read back from PayPal, never taken from the browser. */
function capturedAmount(body: CaptureResponse): string | null {
  return body.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<NextResponse> {
  const { orderId } = await params;
  if (!ORDER_ID.test(orderId)) return NextResponse.json({ error: "bad order id" }, { status: 400 });

  const { ok, status, body } = await paypal(`/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: { "PayPal-Request-Id": `capture-${orderId}` },
  });
  if (!ok) {
    console.error("capture failed", status, body);
    return NextResponse.json({ error: "capture failed" }, { status: 502 });
  }

  const captured = body as CaptureResponse;
  const amount = capturedAmount(captured);
  console.log("capture succeeded", { orderId, status: captured.status, amount });

  return NextResponse.json({ status: captured.status ?? "UNKNOWN", amount });
}
