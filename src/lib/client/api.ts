/** Typed calls to this app's own endpoints, shared by the screens. */

export interface Evidence {
  path: string;
  line: number;
  text: string;
  inTest: boolean;
}

export interface Person {
  id: string;
  name: string;
  commits: number;
  share: number;
}

export interface PlannedPackage {
  pkg: string;
  score: number;
  reason: string;
  role: string | null;
  evidence: Evidence[];
  repo: string | null;
  maintainers: Person[];
  alreadyFunded: boolean;
  singleMaintainer: boolean;
}

export interface Allocation {
  id: string;
  name: string;
  cents: number;
  packages: string[];
  /** Exactly what each package earned this person; sums to `cents`. */
  byPackage: Record<string, number>;
}

export interface ComparisonRow {
  pkg: string;
  productUses: number;
  testUses: number;
  imported: boolean;
  ships: boolean;
  byListCents: number;
  byCodeCents: number;
}

export interface SplitSummary {
  neverImportedCents: number;
  neverShipsCents: number;
}

export interface Comparison {
  rows: ComparisonRow[];
  byList: SplitSummary;
  byCode: SplitSummary;
}

export interface LoneMaintainer {
  pkg: string;
  name: string;
  byListCents: number;
  byCodeCents: number;
}

export interface Plan {
  repo: string;
  budgetCents: number;
  filesRead: number;
  agentUsed: boolean;
  agentOutcome: "judged" | "busy" | "unavailable" | "failed";
  packages: PlannedPackage[];
  allocations: Allocation[];
  totalCents: number;
  belowMinimum: { name: string; cents: number }[];
  unpayable: { pkg: string; reason: string }[];
  comparison: Comparison;
  lone: LoneMaintainer | null;
}

export interface PayoutItem {
  id: string;
  name: string;
  cents: number;
  status: string;
}

export interface Reconciliation {
  expectedCents: number;
  foundCents: number;
  foundCount: number;
  expectedCount: number;
  agrees: boolean;
  note: string | null;
}

export interface PayoutRun {
  batchId: string;
  batchStatus: string;
  items: PayoutItem[];
  /** Null until every payout has settled. */
  reconciliation?: Reconciliation | null;
  createdAt?: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(payload.error ?? "Something went wrong.");
  return payload;
}

/** Reads one streamed line: reports a step, returns a plan, or throws the server's error. */
function handle(text: string, onStep: (message: string) => void): Plan | null {
  if (text.trim() === "") return null;
  const message = JSON.parse(text) as { step?: string; plan?: Plan; error?: string };
  if (message.error !== undefined) throw new Error(message.error);
  if (message.step !== undefined) onStep(message.step);
  return message.plan ?? null;
}

/**
 * Reads a repository, calling `onStep` as each stage finishes.
 *
 * The response is newline-delimited JSON rather than one object, so the page
 * can say what is happening across the seconds a first read takes.
 */
export async function readRepo(repo: string, budgetCents: number, onStep: (message: string) => void): Promise<Plan> {
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, budgetCents }),
  });
  if (res.body === null) throw new Error("No response from the server.");

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let plan: Plan | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    // The last piece may be half a line, so it waits for the next chunk.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const text of lines) plan = handle(text, onStep) ?? plan;
  }

  if (plan === null) throw new Error("The read ended without a plan.");
  return plan;
}

/** Starts the payouts for a captured order. The server reads which repository from PayPal. */
export const startPayouts = (orderId: string): Promise<PayoutRun> => post<PayoutRun>("/api/payouts", { orderId });

export const checkPayouts = (run: PayoutRun): Promise<PayoutRun> =>
  post<PayoutRun>("/api/payouts", { batchId: run.batchId, items: run.items });

/** 1234 becomes "$12.34". */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
