import { z } from "@/lib/zod";

/**
 * The contract the attribution agent must meet.
 *
 * The model argues about *importance*; it never sees or sets an amount. Its
 * output is parsed by this schema and then clamped, so a confused or hostile
 * reply can shift a weight within fixed bounds and nothing more. Everything
 * about money stays in `src/lib/domain/split.ts`.
 */
export const judgementSchema = z.object({
  pkg: z.string().min(1).max(214),
  /** How load-bearing this package is for the scanned project, 0 to 1. */
  importance: z.number().min(0).max(1),
  /** What the package does here, in the reader's words, not the model's jargon. */
  role: z.string().min(1).max(200),
  /** Why that importance, citing what the evidence showed. */
  reason: z.string().min(1).max(300),
});

export const judgementsSchema = z.object({
  judgements: z.array(judgementSchema).max(20),
});

export type Judgement = z.infer<typeof judgementSchema>;

/**
 * How far the model may move a package's weight.
 *
 * The deterministic score already reflects measured facts: how often the code
 * imports it, whether it ships, how alone its maintainer is. The model reads
 * the actual call sites and can tell that three imports of a payments library
 * matter more than twenty of a date formatter. That is worth something, but
 * not the right to overturn the measurement, so its judgement scales the
 * score between these bounds.
 */
export const MIN_FACTOR = 0.5;
export const MAX_FACTOR = 2;

/** Turns an importance of 0 to 1 into a bounded multiplier centred on 1. */
export function factorFromImportance(importance: number): number {
  if (!Number.isFinite(importance)) return 1;
  const clamped = Math.min(1, Math.max(0, importance));
  // 0 -> MIN_FACTOR, 0.5 -> 1, 1 -> MAX_FACTOR
  return clamped <= 0.5
    ? MIN_FACTOR + (1 - MIN_FACTOR) * (clamped / 0.5)
    : 1 + (MAX_FACTOR - 1) * ((clamped - 0.5) / 0.5);
}
