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
}

export interface Plan {
  repo: string;
  budgetCents: number;
  filesRead: number;
  agentUsed: boolean;
  packages: PlannedPackage[];
  allocations: Allocation[];
  totalCents: number;
  belowMinimum: { name: string; cents: number }[];
  unpayable: { pkg: string; reason: string }[];
}

export interface PayoutItem {
  id: string;
  name: string;
  cents: number;
  status: string;
}

export interface PayoutRun {
  batchId: string;
  batchStatus: string;
  items: PayoutItem[];
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

export const readRepo = (repo: string, budgetCents: number): Promise<Plan> =>
  post<Plan>("/api/plan", { repo, budgetCents });

export const startPayouts = (orderId: string, repo: string): Promise<PayoutRun> =>
  post<PayoutRun>("/api/payouts", { orderId, repo });

export const checkPayouts = (run: PayoutRun): Promise<PayoutRun> =>
  post<PayoutRun>("/api/payouts", { batchId: run.batchId, items: run.items });

/** 1234 becomes "$12.34". */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
