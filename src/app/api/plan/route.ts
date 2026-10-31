import { NextResponse } from "next/server";
import { parseBudgetCents } from "@/lib/domain/budget";
import { parseRepoRef } from "@/lib/domain/repo-ref";
import { GitHubError } from "@/lib/server/github";
import { planPayments } from "@/lib/server/pipeline";
import { z } from "@/lib/zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  repo: z.string().min(1).max(200),
  budgetCents: z.number(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "give a repository and a budget" }, { status: 400 });

  try {
    const ref = parseRepoRef(parsed.data.repo);
    const budget = parseBudgetCents(parsed.data.budgetCents);
    return NextResponse.json(await planPayments(ref, budget));
  } catch (error: unknown) {
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof GitHubError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("plan failed", error);
    return NextResponse.json({ error: "could not build a plan" }, { status: 500 });
  }
}
