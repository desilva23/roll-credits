import "server-only";
import { createHash } from "node:crypto";
import { z } from "@/lib/zod";

/**
 * Sandbox is the only environment this app talks to. Hard-coding the base URL
 * means no configuration mistake can point real money at the demo.
 */
export const PAYPAL_API = "https://api-m.sandbox.paypal.com";

const schema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  /** Created once the site has a public URL, so it is optional until then. */
  PAYPAL_WEBHOOK_ID: z.string().min(1).optional(),
});

let cached: z.infer<typeof schema> | undefined;

export function env(): z.infer<typeof schema> {
  cached ??= schema.parse({
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID,
  });
  return cached;
}

/**
 * The key for stage names and maintainer ids.
 *
 * STAGE_NAME_SECRET when it is set. Otherwise a key derived from the PayPal
 * client secret under its own label: secret already, already configured
 * wherever the app runs, and identical locally and in production, so a name
 * means the same person in both. The label keeps the derived key unrelated to
 * anything PayPal sees.
 */
export function stageSecret(): string {
  const own = process.env.STAGE_NAME_SECRET;
  if (own !== undefined && own !== "") return own;
  return createHash("sha256").update(`roll-credits stage names:${env().PAYPAL_CLIENT_SECRET}`).digest("hex");
}
