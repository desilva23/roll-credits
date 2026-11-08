import { beforeEach, describe, expect, it, vi } from "vitest";
import { paypal } from "@/lib/server/paypal";
import { POST } from "./route";

vi.mock("@/lib/server/paypal", () => ({ paypal: vi.fn() }));
const call = vi.mocked(paypal);

const capture = async (orderId: string): Promise<{ status: number; json: Record<string, unknown> }> => {
  const res = await POST(new Request("https://app.example", { method: "POST" }), {
    params: Promise.resolve({ orderId }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  call.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("capturing an order", () => {
  it.each(["../../payouts", "lowercase1", "ABC", "A".repeat(40)])("refuses %s as an order id", async (id) => {
    expect((await capture(id)).status).toBe(400);
    expect(call).not.toHaveBeenCalled();
  });

  it("captures once, however many times it is asked, and reports what PayPal took", async () => {
    call.mockResolvedValueOnce({
      ok: true,
      status: 201,
      body: { status: "COMPLETED", purchase_units: [{ payments: { captures: [{ amount: { value: "25.00" } }] } }] },
    });
    const result = await capture("ORDER12345");
    expect(result.json).toEqual({ status: "COMPLETED", amount: "25.00" });
    expect(call.mock.calls[0]?.[1]).toMatchObject({ headers: { "PayPal-Request-Id": "capture-ORDER12345" } });
  });

  it("reports an unknown amount rather than inventing one", async () => {
    call.mockResolvedValueOnce({ ok: true, status: 201, body: {} });
    expect((await capture("ORDER12345")).json).toEqual({ status: "UNKNOWN", amount: null });
  });

  it("reports a capture PayPal refused", async () => {
    call.mockResolvedValueOnce({ ok: false, status: 422, body: {} });
    expect((await capture("ORDER12345")).status).toBe(502);
  });
});
