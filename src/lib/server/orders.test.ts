import { beforeEach, describe, expect, it, vi } from "vitest";
import { capturedOrder, openOrder } from "./orders";
import { paypal } from "./paypal";

vi.mock("./paypal", () => ({ paypal: vi.fn() }));
const call = vi.mocked(paypal);

const REF = { owner: "desilva23", name: "celebration-planner" };

interface OrderBody {
  purchase_units: { custom_id: string; amount: { value: string } }[];
  payment_source?: { paypal: { experience_context: { return_url: string; cancel_url: string } } };
}
const sent = (): OrderBody => (call.mock.calls[0]?.[1] as { body: OrderBody }).body;

beforeEach(() => {
  call.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("openOrder", () => {
  it("seals the repository into the order, so the payout reads it back from PayPal", async () => {
    call.mockResolvedValueOnce({ ok: true, status: 201, body: { id: "O1", links: [] } });
    await openOrder(2500, REF);
    expect(sent().purchase_units[0]?.custom_id).toBe("desilva23/celebration-planner");
    expect(sent().purchase_units[0]?.amount.value).toBe("25.00");
  });

  it("opens a button payment with no redirect and no approval link", async () => {
    call.mockResolvedValueOnce({ ok: true, status: 201, body: { id: "O1" } });
    expect(await openOrder(2500, REF)).toEqual({ orderId: "O1", approveUrl: null });
    expect(sent().payment_source).toBeUndefined();
  });

  it("for an agent, returns to the app after approval and hands back the approval link", async () => {
    call.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        id: "O2",
        links: [
          { rel: "self", href: "x" },
          { rel: "payer-action", href: "https://pay.example/O2" },
        ],
      },
    });
    const order = await openOrder(1000, REF, "https://app.example");
    expect(order).toEqual({ orderId: "O2", approveUrl: "https://pay.example/O2" });
    expect(sent().payment_source?.paypal.experience_context.return_url).toBe("https://app.example/?funded");
    expect(sent().payment_source?.paypal.experience_context.cancel_url).toBe("https://app.example/");
  });

  it("fails when PayPal will not open the order", async () => {
    call.mockResolvedValueOnce({ ok: false, status: 422, body: {} });
    await expect(openOrder(2500, REF)).rejects.toThrow("PayPal would not open the order");
  });
});

describe("capturedOrder", () => {
  // Shaped like PayPal's real reply for an order captured on Oct 31.
  const real = (over: Record<string, unknown> = {}, capture: Record<string, unknown> = {}) => ({
    status: "COMPLETED",
    purchase_units: [
      {
        custom_id: "desilva23/celebration-planner",
        payments: {
          captures: [{ status: "COMPLETED", amount: { currency_code: "USD", value: "25.00" }, ...capture }],
        },
        ...over,
      },
    ],
  });

  it("reads the amount and the repository from PayPal's own record", async () => {
    call.mockResolvedValueOnce({ ok: true, status: 200, body: real() });
    expect(await capturedOrder("O1")).toEqual({ cents: 2500, ref: REF });
  });

  it.each([
    ["an order opened before repositories were sealed in", real({ custom_id: undefined })],
    ["an order not yet completed", { ...real(), status: "APPROVED" }],
    ["a capture still pending", real({}, { status: "PENDING" })],
    ["an amount that is not a number", real({}, { amount: { value: "lots" } })],
    ["an amount of zero", real({}, { amount: { value: "0.00" } })],
    ["a repository that is not a repository", real({ custom_id: "not a repo!" })],
    ["no captures at all", real({ payments: { captures: [] } })],
  ])("refuses %s", async (_label, body) => {
    call.mockResolvedValueOnce({ ok: true, status: 200, body });
    expect(await capturedOrder("O1")).toBeNull();
  });

  it("refuses an order PayPal cannot find", async () => {
    call.mockResolvedValueOnce({ ok: false, status: 404, body: {} });
    expect(await capturedOrder("O1")).toBeNull();
  });
});
