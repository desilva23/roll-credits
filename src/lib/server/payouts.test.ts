import { beforeEach, describe, expect, it, vi } from "vitest";
import { paypal } from "./paypal";
import { readPayouts, sendPayouts } from "./payouts";

vi.mock("./paypal", () => ({ paypal: vi.fn() }));
const call = vi.mocked(paypal);

const allocation = (id: string, cents: number) => ({
  id,
  name: `Name ${id}`,
  cents,
  packages: ["zod"],
  byPackage: { zod: cents },
});

interface SentBody {
  sender_batch_header: { sender_batch_id: string };
  items: { amount: Record<string, string>; receiver: string; sender_item_id: string }[];
}

const sentBody = (): SentBody => (call.mock.calls[0]?.[1] as { body: SentBody }).body;

beforeEach(() => {
  call.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("sendPayouts", () => {
  const created = {
    ok: true,
    status: 201,
    body: { batch_header: { payout_batch_id: "B1", batch_status: "PENDING" } },
  };

  it("spells the amount the way Payouts expects: `currency`, not Orders' `currency_code`", async () => {
    // The bug this guards against stopped every payout from the app: PayPal
    // rejects `currency_code` here with "may not be null".
    call.mockResolvedValueOnce(created);
    await sendPayouts("ORDER1", [allocation("a", 819)]);
    expect(sentBody().items[0]?.amount).toEqual({ value: "8.19", currency: "USD" });
  });

  it("pays the five largest amounts into sandbox accounts, one each, and everyone else at example.com", async () => {
    call.mockResolvedValueOnce(created);
    const largestFirst = ["a", "b", "c", "d", "e", "f", "g"].map((id, rank) => allocation(id, 700 - rank * 100));
    await sendPayouts("ORDER1", largestFirst);
    const receivers = sentBody().items.map((item) => item.receiver);
    // Every address is under example.com, so nothing sent can reach a real inbox.
    for (const receiver of receivers) expect(receiver).toMatch(/[@.]example\.com$/);
    const sandbox = receivers.slice(0, 5);
    for (const receiver of sandbox) expect(receiver).toMatch(/@personal\.example\.com$/);
    expect(new Set(sandbox).size).toBe(5);
    expect(receivers.slice(5)).toEqual(["unclaimed-f@example.com", "unclaimed-g@example.com"]);
  });

  it("derives the batch id from the order, so a retry is refused by PayPal instead of paying twice", async () => {
    call.mockResolvedValueOnce(created);
    await sendPayouts("ORDER1", [allocation("a", 500)]);
    expect(sentBody().sender_batch_header.sender_batch_id).toBe("rollcredits-ORDER1");
    expect(sentBody().items[0]?.sender_item_id).toBe("a");
  });

  it("starts everyone as pending, with no transaction yet", async () => {
    call.mockResolvedValueOnce(created);
    const run = await sendPayouts("ORDER1", [allocation("a", 500)]);
    expect(run).toEqual({
      batchId: "B1",
      batchStatus: "PENDING",
      items: [{ id: "a", name: "Name a", cents: 500, status: "PENDING", transactionId: null }],
    });
  });

  it("fails loudly when PayPal refuses the batch", async () => {
    call.mockResolvedValueOnce({ ok: false, status: 400, body: { name: "VALIDATION_ERROR" } });
    await expect(sendPayouts("ORDER1", [allocation("a", 500)])).rejects.toThrow("PayPal refused the payout");
  });
});

describe("readPayouts", () => {
  const known = [
    { id: "a", name: "A", cents: 500, status: "PENDING", transactionId: null },
    { id: "b", name: "B", cents: 300, status: "PENDING", transactionId: null },
  ];

  it("maps PayPal's states and transaction ids onto the people it knows, and when the batch began", async () => {
    call.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        batch_header: { batch_status: "SUCCESS", time_created: "2026-11-08T15:59:33Z" },
        items: [
          { payout_item: { sender_item_id: "a" }, transaction_status: "SUCCESS", transaction_id: "T1" },
          { payout_item: { sender_item_id: "b" }, transaction_status: "UNCLAIMED", transaction_id: "T2" },
        ],
      },
    });
    const run = await readPayouts("B1", known);
    expect(run.createdAt).toBe("2026-11-08T15:59:33Z");
    expect(run.items.map((i) => [i.id, i.status, i.transactionId])).toEqual([
      ["a", "SUCCESS", "T1"],
      ["b", "UNCLAIMED", "T2"],
    ]);
  });

  it("keeps a person's last known state when PayPal does not list them yet", async () => {
    call.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        batch_header: { batch_status: "PROCESSING" },
        items: [{ payout_item: {}, transaction_status: "SUCCESS" }],
      },
    });
    const run = await readPayouts("B1", known);
    expect(run.items.map((i) => i.status)).toEqual(["PENDING", "PENDING"]);
    expect(run.createdAt).toBeUndefined();
  });

  it("fails when PayPal cannot be read", async () => {
    call.mockResolvedValueOnce({ ok: false, status: 500, body: {} });
    await expect(readPayouts("B1", known)).rejects.toThrow();
  });
});
