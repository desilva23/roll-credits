import { beforeEach, describe, expect, it, vi } from "vitest";
import { paypal } from "./paypal";
import { reconcile } from "./reconcile";

vi.mock("./paypal", () => ({ paypal: vi.fn() }));
const call = vi.mocked(paypal);

const item = (id: string, cents: number, status = "SUCCESS") => ({
  id,
  name: id,
  cents,
  status,
  transactionId: `T-${id}`,
});

/** PayPal's reporting for one transaction: a payout leaves the account, so it is negative. */
const found = (value: string) => ({
  ok: true,
  status: 200,
  body: { transaction_details: [{ transaction_info: { transaction_amount: { value } } }] },
});
const missing = { ok: true, status: 200, body: { transaction_details: [] } };

beforeEach(() => {
  call.mockReset();
});

describe("reconcile", () => {
  it("agrees when PayPal records every payout at the ledger's amount", async () => {
    call.mockResolvedValueOnce(found("-8.19")).mockResolvedValueOnce(found("-2.50"));
    const result = await reconcile([item("a", 819), item("b", 250)]);
    expect(result).toMatchObject({ agrees: true, foundCount: 2, foundCents: 1069, expectedCents: 1069, note: null });
  });

  it("looks each payout up by its own transaction id", async () => {
    call.mockResolvedValueOnce(found("-8.19"));
    await reconcile([item("a", 819)]);
    expect(call.mock.calls[0]?.[0]).toContain("transaction_id=T-a");
  });

  it("does not agree when PayPal's amount differs from the ledger's", async () => {
    call.mockResolvedValueOnce(found("-8.00"));
    expect((await reconcile([item("a", 819)])).agrees).toBe(false);
  });

  it("calls a payout not yet in the report a lag, not a missing payment", async () => {
    call.mockResolvedValueOnce(missing);
    const result = await reconcile([item("a", 819)]);
    expect(result.agrees).toBe(false);
    expect(result.note).toContain("updates separately");
  });

  it("treats an unreadable report as not found", async () => {
    call.mockResolvedValueOnce({ ok: false, status: 500, body: {} });
    expect((await reconcile([item("a", 819)])).foundCount).toBe(0);
  });

  it("checks only payouts that succeeded", async () => {
    call.mockResolvedValueOnce(found("-8.19"));
    const result = await reconcile([item("a", 819), item("b", 250, "UNCLAIMED")]);
    expect(call).toHaveBeenCalledTimes(1);
    expect(result.expectedCount).toBe(1);
  });

  it("searches around the run's own date, so a replay weeks later is still found", async () => {
    call.mockResolvedValueOnce(found("-1.00"));
    await reconcile([item("a", 100)], "2026-10-31T08:39:18Z");
    expect(call.mock.calls[0]?.[0]).toContain("start_date=2026-10-30T08:39:18-0000");
  });

  it("says there is nothing to check when nothing succeeded", async () => {
    const result = await reconcile([item("a", 819, "UNCLAIMED")]);
    expect(call).not.toHaveBeenCalled();
    expect(result).toMatchObject({ expectedCount: 0, agrees: false, note: "Nothing to check." });
  });
});
