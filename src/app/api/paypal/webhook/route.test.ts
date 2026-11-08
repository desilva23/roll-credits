import { beforeEach, describe, expect, it, vi } from "vitest";
import { paypal } from "@/lib/server/paypal";
import { POST } from "./route";

const config = vi.hoisted((): { webhookId: string | undefined } => ({ webhookId: "WH-1" }));

vi.mock("@/lib/server/paypal", () => ({ paypal: vi.fn() }));
vi.mock("@/lib/server/env", () => ({ env: () => ({ PAYPAL_WEBHOOK_ID: config.webhookId }) }));
const call = vi.mocked(paypal);

const SIGNED = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/x",
  "paypal-transmission-id": "id-1",
  "paypal-transmission-sig": "sig",
  "paypal-transmission-time": "2026-11-08T00:00:00Z",
};
const EVENT = {
  id: "WH-EVT",
  event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
  resource: { transaction_status: "SUCCESS" },
};

const deliver = (headers: Record<string, string>, body: unknown = EVENT): Promise<Response> =>
  POST(
    new Request("https://app.example/api/paypal/webhook", { method: "POST", headers, body: JSON.stringify(body) }),
  );

beforeEach(() => {
  call.mockReset();
  config.webhookId = "WH-1";
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

describe("the webhook endpoint", () => {
  it("rejects a delivery missing PayPal's signature headers, without asking PayPal", async () => {
    const res = await deliver({ "paypal-auth-algo": "x" });
    expect(res.status).toBe(400);
    expect(call).not.toHaveBeenCalled();
  });

  it("rejects a delivery whose signature PayPal does not verify", async () => {
    call.mockResolvedValueOnce({ ok: true, status: 200, body: { verification_status: "FAILURE" } });
    expect((await deliver(SIGNED)).status).toBe(401);
  });

  it("rejects a delivery when PayPal cannot be asked", async () => {
    call.mockResolvedValueOnce({ ok: false, status: 500, body: {} });
    expect((await deliver(SIGNED)).status).toBe(401);
  });

  it("accepts a verified delivery, having sent PayPal the headers, the webhook id and the event", async () => {
    call.mockResolvedValueOnce({ ok: true, status: 200, body: { verification_status: "SUCCESS" } });
    expect((await deliver(SIGNED)).status).toBe(200);
    const [path, init] = call.mock.calls[0] ?? [];
    expect(path).toBe("/v1/notifications/verify-webhook-signature");
    expect((init as { body: unknown }).body).toMatchObject({
      transmission_id: "id-1",
      transmission_sig: "sig",
      webhook_id: "WH-1",
      webhook_event: EVENT,
    });
  });

  it("acknowledges, but does not act on, events while no webhook id is configured", async () => {
    config.webhookId = undefined;
    expect((await deliver(SIGNED)).status).toBe(200);
    expect(call).not.toHaveBeenCalled();
  });
});
