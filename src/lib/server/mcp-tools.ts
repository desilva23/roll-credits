import "server-only";
import { toAmountValue } from "@/lib/domain/budget";
import { parseRepoRef, repoSlug } from "@/lib/domain/repo-ref";
import { count } from "@/lib/domain/text";
import { z } from "@/lib/zod";
import { GitHubError } from "./github";
import { openOrder } from "./orders";
import { type PaymentPlan, planPayments } from "./pipeline";

/** What a tool call returns to the agent: plain text it can relay to the person. */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

/** The budget `who_to_credit` describes a plan for, when nothing is being paid yet. */
const REFERENCE_CENTS = 25_00;

/** A coding agent should not be able to open a large payment, even one a person must approve. */
const MAX_USD = 500;

const repoField = {
  type: "string",
  description:
    "A public GitHub repository, as owner/name or its URL. For the project you are working in, use its origin.",
};

export const TOOLS = [
  {
    name: "who_to_credit",
    title: "Who to credit",
    description:
      "Reads a public GitHub repository's code and reports who it really depends on: which dependencies its shipped " +
      "code imports, what each does there, who maintains them, and how a budget would be split between those people. " +
      "Favours maintainers carrying a project alone. Read-only: moves no money.",
    inputSchema: { type: "object", properties: { repo: repoField }, required: ["repo"], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "credit_maintainers",
    title: "Credit maintainers",
    description:
      "Opens a PayPal payment that, once a person approves it, pays the maintainers this repository depends on, split " +
      "by what its code actually uses. Returns a link the person must open to approve; nothing is paid without that " +
      "approval. PayPal sandbox only: no real money moves.",
    inputSchema: {
      type: "object",
      properties: {
        repo: repoField,
        amount_usd: {
          type: "number",
          minimum: 1,
          maximum: MAX_USD,
          description: "The total to split, in US dollars.",
        },
      },
      required: ["repo", "amount_usd"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
] as const;

const whoArgs = z.object({ repo: z.string().min(1).max(200) });
const creditArgs = z.object({ repo: z.string().min(1).max(200), amount_usd: z.number().min(1).max(MAX_USD) });

const usd = (cents: number): string => `$${toAmountValue(cents)}`;
const text = (body: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: body }],
  ...(isError ? { isError } : {}),
});

/** What each package earned in this plan, read from the exact per-package breakdown. */
function earned(plan: PaymentPlan, pkg: string): number {
  return plan.comparison.rows.find((row) => row.pkg === pkg)?.byCodeCents ?? 0;
}

/** The plan as a short brief the agent can relay, with evidence a person can check. */
function describe(plan: PaymentPlan): string {
  const lines = [
    `Roll Credits read ${plan.repo}: ${count(plan.filesRead, "file")}, ` +
      `${count(plan.comparison.rows.length, "dependency", "dependencies")}.`,
    "",
    `For a ${usd(plan.budgetCents)} budget, paid to ${count(plan.allocations.length, "person", "people")}:`,
  ];

  // Listed by what each package earns, so the brief reads in the order the money goes.
  const paid = plan.packages
    .filter((p) => earned(plan, p.pkg) > 0)
    .sort((a, b) => earned(plan, b.pkg) - earned(plan, a.pkg) || a.pkg.localeCompare(b.pkg))
    .slice(0, 6);
  for (const p of paid) {
    const role = p.role === null ? "" : `${p.role.replace(/[.\s]+$/, "")}. `;
    lines.push(`- ${p.pkg}: ${usd(earned(plan, p.pkg))}. ${role}${p.reason}`);
    const site = p.evidence.find((e) => !e.inTest) ?? p.evidence[0];
    if (site !== undefined) lines.push(`  evidence: ${site.path}:${site.line}`);
  }

  const { byList, byCode } = plan.comparison;
  lines.push(
    "",
    `Split evenly across the dependency list instead, ${usd(byList.neverImportedCents)} would go to packages this code ` +
      `never imports and ${usd(byList.neverShipsCents)} to code that never reaches users. Here: ` +
      `${usd(byCode.neverImportedCents)} and ${usd(byCode.neverShipsCents)}.`,
  );
  if (plan.lone !== null) {
    lines.push(
      `The person carrying ${plan.lone.pkg} alone gets ${usd(plan.lone.byCodeCents)} here, against ` +
        `${usd(plan.lone.byListCents)} by dependency list.`,
    );
  }
  lines.push("", "Names are generated: nobody real is named until they claim. Sandbox only.");
  return lines.join("\n");
}

function failure(error: unknown): ToolResult {
  if (error instanceof RangeError || error instanceof GitHubError) return text(error.message, true);
  console.error("mcp tool failed", error);
  return text("Roll Credits could not read that repository.", true);
}

async function whoToCredit(args: unknown): Promise<ToolResult> {
  const parsed = whoArgs.safeParse(args);
  if (!parsed.success) return text("Give a public GitHub repository as `repo`.", true);
  const plan = await planPayments(parseRepoRef(parsed.data.repo), REFERENCE_CENTS);
  return text(`${describe(plan)}\n\nTo fund it, call credit_maintainers with an amount.`);
}

async function creditMaintainers(args: unknown, origin: string): Promise<ToolResult> {
  const parsed = creditArgs.safeParse(args);
  if (!parsed.success) return text(`Give \`repo\` and \`amount_usd\` between 1 and ${MAX_USD}.`, true);

  const ref = parseRepoRef(parsed.data.repo);
  const cents = Math.round(parsed.data.amount_usd * 100);

  // Plan before taking money, so a person is never asked to pay for a
  // repository where nobody can be paid.
  const plan = await planPayments(ref, cents);
  if (plan.allocations.length === 0) return text(`Nobody behind ${repoSlug(ref)} can be paid right now.`, true);

  const { approveUrl } = await openOrder(cents, ref, origin);
  if (approveUrl === null) return text("PayPal opened the order but gave no approval link.", true);

  return text(
    `${describe(plan)}\n\nApprove ${usd(cents)} in PayPal to pay them:\n${approveUrl}\n\n` +
      "Nothing is paid until a person approves. After approval PayPal returns to Roll Credits, which sends the " +
      "payouts and rolls the credits as each one lands.",
  );
}

/** Runs one tool. Errors come back as a result the agent can read, not as a protocol failure. */
export async function callTool(name: string, args: unknown, origin: string): Promise<ToolResult> {
  try {
    if (name === "who_to_credit") return await whoToCredit(args);
    if (name === "credit_maintainers") return await creditMaintainers(args, origin);
    return text(`There is no tool called ${name}.`, true);
  } catch (error: unknown) {
    return failure(error);
  }
}
