import { NextResponse } from "next/server";
import { parseRepoRef } from "@/lib/domain/repo-ref";
import { GitHubError } from "@/lib/server/github";
import { scanRepo } from "@/lib/server/scan";
import { z } from "@/lib/zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ repo: z.string().min(1).max(200) });

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "give a repository" }, { status: 400 });

  try {
    return NextResponse.json(await scanRepo(parseRepoRef(parsed.data.repo)));
  } catch (error: unknown) {
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof GitHubError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("scan failed", error);
    return NextResponse.json({ error: "the scan failed" }, { status: 500 });
  }
}
