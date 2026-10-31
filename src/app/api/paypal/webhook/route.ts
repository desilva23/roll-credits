import { NextResponse } from "next/server";
import { env } from "@/lib/server/env";
import { paypal } from "@/lib/server/paypal";

export const runtime = "nodejs";

/** The five headers PayPal signs each delivery with. */
const SIGNATURE_HEADERS = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
] as const;

export async function POST(request: Request): Promise<NextResponse> {
  const webhookId = env().PAYPAL_WEBHOOK_ID;
  if (webhookId === undefined) {
    console.error("webhook received but PAYPAL_WEBHOOK_ID is not set");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // The signature covers the exact bytes PayPal sent, so the body is read as
  // text and only parsed after it has been verified.
  const raw = await request.text();
  const headers = Object.fromEntries(
    SIGNATURE_HEADERS.map((name) => [name, request.headers.get(name) ?? ""]),
  ) as Record<(typeof SIGNATURE_HEADERS)[number], string>;

  if (SIGNATURE_HEADERS.some((name) => headers[name] === "")) {
    console.warn("webhook rejected: missing signature headers");
    return NextResponse.json({ error: "missing signature headers" }, { status: 400 });
  }

  const { ok, body } = await paypal("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: JSON.parse(raw) as unknown,
    },
  });

  const verified = ok && (body as { verification_status?: string }).verification_status === "SUCCESS";
  if (!verified) {
    console.warn("webhook rejected: signature did not verify", body);
    return NextResponse.json({ error: "signature did not verify" }, { status: 401 });
  }

  const event = JSON.parse(raw) as { id?: string; event_type?: string; resource?: Record<string, unknown> };
  console.log("WEBHOOK VERIFIED", {
    id: event.id,
    type: event.event_type,
    itemStatus: event.resource?.transaction_status ?? null,
  });

  // PayPal retries anything slower than 30 seconds, so acknowledge immediately.
  return NextResponse.json({ received: true });
}
