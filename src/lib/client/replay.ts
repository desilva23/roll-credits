import data from "@/data/replay.json";
import { type PayoutRun } from "./api";

/**
 * A real sandbox payout of a real plan, kept so anyone can watch the credits
 * roll without a PayPal login. Only the starting point is stored here: when
 * the roll opens it asks PayPal for every item's state, so what it shows is
 * PayPal's answer today, not a recording of one.
 */
export const replay: { recordedAt: string; repo: string; run: PayoutRun } = {
  recordedAt: data.recordedAt,
  repo: data.repo,
  run: { batchId: data.batchId, batchStatus: "PENDING", items: data.items },
};

export const replayCaption = `A replay of a real PayPal sandbox payout for ${data.repo}, made on ${data.recordedAt}. Each state is read live from PayPal as the roll opens.`;
