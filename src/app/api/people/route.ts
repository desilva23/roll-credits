import { NextResponse } from "next/server";
import { resolvePeople } from "@/lib/server/people";
import { z } from "@/lib/zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

const bodySchema = z.object({
  packages: z.array(z.string().regex(NPM_NAME)).min(1).max(12),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "give up to 12 package names" }, { status: 400 });

  try {
    return NextResponse.json({ packages: await resolvePeople(parsed.data.packages) });
  } catch (error: unknown) {
    console.error("people lookup failed", error);
    return NextResponse.json({ error: "the lookup failed" }, { status: 500 });
  }
}
