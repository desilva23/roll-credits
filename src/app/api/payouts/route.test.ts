import { beforeEach, describe, expect, it, vi } from "vitest";
import { capturedOrder } from "@/lib/server/orders";
import { readPayouts, sendPayouts } from "@/lib/server/payouts";
import { type PaymentPlan, planPayments } from "@/lib/server/pipeline";
import { reconcile } from "@/lib/server/reconcile";
import { POST } from "./route";

vi.mock("@/lib/server/orders", () => ({ capturedOrder: vi.fn() }));
vi.mock("@/lib/server/payouts", () => ({ sendPayouts: vi.fn(), readPayouts: vi.fn() }));
vi.mock("@/lib/server/pipeline", () => ({ planPayments: vi.fn() }));
vi.mock("@/lib/server/reconcile", () => ({ reconcile: vi.fn() }));

const REF = { owner: "desilva23", name: "celebration-planner" };
const allocation = { id: "a", name: "A", cents: 2500, packages: ["zod"], byPackage: { zod: 2500 } };
const item = (status: string) => ({ id: "a", name: "A", cents: 2500, status, transactionId: "T1" });

const post = async (body: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
  const res = await POST(
    new Request("https://app.example/api/payouts", { method: "POST", body: JSON.stringify(body) }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("starting the payouts", () => {
  it("asks for an order id and nothing else", async () => {
    expect((await post({ repo: "a/b" })).status).toBe(400);
  });

  it("refuses an order PayPal has not captured, and plans and pays nothing", async () => {
    vi.mocked(capturedOrder).mockResolvedValueOnce(null);
    expect((await post({ orderId: "ORDER12345" })).status).toBe(402);
    expect(planPayments).not.toHaveBeenCalled();
    expect(sendPayouts).not.toHaveBeenCalled();
  });

  it("plans from PayPal's amount and repository, ignoring any the request names, then pays", async () => {
    vi.mocked(capturedOrder).mockResolvedValueOnce({ cents: 2500, ref: REF });
    vi.mocked(planPayments).mockResolvedValueOnce({ allocations: [allocation] } as unknown as PaymentPlan);
    vi.mocked(sendPayouts).mockResolvedValueOnce({ batchId: "B1", batchStatus: "PENDING", items: [item("PENDING")] });

    const res = await post({ orderId: "ORDER12345", repo: "someone/else" });
    expect(res.status).toBe(200);
    expect(planPayments).toHaveBeenCalledWith(REF, 2500);
    expect(sendPayouts).toHaveBeenCalledWith("ORDER12345", [allocation]);
  });

  it("refuses to take money for a repository where nobody can be paid", async () => {
    vi.mocked(capturedOrder).mockResolvedValueOnce({ cents: 2500, ref: REF });
    vi.mocked(planPayments).mockResolvedValueOnce({ allocations: [] } as unknown as PaymentPlan);
    expect((await post({ orderId: "ORDER12345" })).status).toBe(422);
    expect(sendPayouts).not.toHaveBeenCalled();
  });

  it("reports a failed payout as a failure", async () => {
    vi.mocked(capturedOrder).mockResolvedValueOnce({ cents: 2500, ref: REF });
    vi.mocked(planPayments).mockResolvedValueOnce({ allocations: [allocation] } as unknown as PaymentPlan);
    vi.mocked(sendPayouts).mockRejectedValueOnce(new Error("PayPal refused the payout"));
    expect((await post({ orderId: "ORDER12345" })).status).toBe(502);
  });
});

describe("following the payouts", () => {
  // A real batch id's shape; anything shorter is refused, as the endpoint should.
  const poll = { batchId: "KVVAMYFVQZK2Q", items: [item("PENDING")] };

  it("checks the ledger against PayPal's records once every payout has settled", async () => {
    vi.mocked(readPayouts).mockResolvedValueOnce({
      batchId: "KVVAMYFVQZK2Q",
      batchStatus: "SUCCESS",
      items: [item("SUCCESS")],
      createdAt: "2026-11-08T15:59:33Z",
    });
    vi.mocked(reconcile).mockResolvedValueOnce({
      expectedCents: 2500,
      expectedCount: 1,
      foundCents: 2500,
      foundCount: 1,
      agrees: true,
      note: null,
    });
    const res = await post(poll);
    expect(reconcile).toHaveBeenCalledWith([item("SUCCESS")], "2026-11-08T15:59:33Z");
    expect(res.json.reconciliation).toMatchObject({ agrees: true });
  });

  it("does not reconcile while payouts are still moving", async () => {
    vi.mocked(readPayouts).mockResolvedValueOnce({
      batchId: "KVVAMYFVQZK2Q",
      batchStatus: "PROCESSING",
      items: [item("PENDING")],
    });
    const res = await post(poll);
    expect(reconcile).not.toHaveBeenCalled();
    expect(res.json.reconciliation).toBeNull();
  });

  it("does not reconcile when nothing succeeded", async () => {
    vi.mocked(readPayouts).mockResolvedValueOnce({
      batchId: "KVVAMYFVQZK2Q",
      batchStatus: "SUCCESS",
      items: [item("UNCLAIMED")],
    });
    await post(poll);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("reports when PayPal cannot be read", async () => {
    vi.mocked(readPayouts).mockRejectedValueOnce(new Error("down"));
    expect((await post(poll)).status).toBe(502);
  });
});

describe("an invalid request", () => {
  it("refuses a batch id that is not PayPal's shape", async () => {
    expect((await post({ batchId: "B1", items: [] })).status).toBe(400);
  });
});
