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

function line(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function problem(error: unknown): string {
  if (error instanceof RangeError || error instanceof GitHubError) return error.message;
  console.error("plan failed", error);
  return "Could not build a plan for that repository.";
}

/**
 * Streams the reading as newline-delimited JSON: a `step` line each time the
 * pipeline finishes a stage, then one `plan` line, or one `error`.
 *
 * A first read of a repository takes several seconds, nearly all of it
 * waiting on GitHub, npm and the model. Saying what is happening is not
 * decoration — without it the page is silent long enough to look broken.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new Response(`${JSON.stringify({ error: "Give a repository and a budget." })}\n`, {
      status: 400,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const ref = parseRepoRef(parsed.data.repo);
        const budget = parseBudgetCents(parsed.data.budgetCents);
        const plan = await planPayments(ref, budget, (message) => {
          controller.enqueue(line({ step: message }));
        });
        controller.enqueue(line({ plan }));
      } catch (error: unknown) {
        controller.enqueue(line({ error: problem(error) }));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Stops a proxy holding the whole response back until it is finished.
      "X-Accel-Buffering": "no",
    },
  });
}
