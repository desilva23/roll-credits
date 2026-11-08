import "server-only";
import { toAmountValue } from "@/lib/domain/budget";
import { type RepoRef, parseRepoRef, repoSlug } from "@/lib/domain/repo-ref";
import { z } from "@/lib/zod";
import { paypal } from "./paypal";

/** An order PayPal has opened and is waiting for a person to approve. */
export interface OpenedOrder {
  orderId: string;
  /** Where a person approves the payment, when the order was opened for a redirect. */
  approveUrl: string | null;
}

/**
 * Opens a PayPal order to fund the credits for one repository.
 *
 * The repository is sealed into the order as its `custom_id`, so the payout
 * later reads which project to pay from PayPal itself. Nothing the browser or
 * an agent sends after approval can redirect the money to other maintainers.
 *
 * With `returnTo`, the order carries its own approval page and comes back to
 * that address afterwards — the path a coding agent uses, since it has no
 * browser of its own to run PayPal's button in.
 */
export async function openOrder(cents: number, ref: RepoRef, returnTo?: string): Promise<OpenedOrder> {
  const redirect =
    returnTo === undefined
      ? {}
      : {
          payment_source: {
            paypal: {
              experience_context: {
                return_url: `${returnTo}/?funded`,
                cancel_url: `${returnTo}/`,
                user_action: "PAY_NOW",
                shipping_preference: "NO_SHIPPING",
                brand_name: "Roll Credits",
              },
            },
          },
        };

  const { ok, status, body } = await paypal("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": crypto.randomUUID() },
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: "USD", value: toAmountValue(cents) },
          description: `Roll Credits for ${repoSlug(ref)}`,
          custom_id: repoSlug(ref),
        },
      ],
      ...redirect,
    },
  });
  if (!ok) {
    console.error("order create failed", status, body);
    throw new Error("PayPal would not open the order");
  }

  const order = body as { id: string; links?: { rel?: string; href?: string }[] };
  const approveUrl = order.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href ?? null;
  return { orderId: order.id, approveUrl };
}

/**
 * The shape of an order that is captured and ours. Parsing PayPal's reply
 * against it, rather than walking optional fields, means anything else —
 * not completed, no capture, no repository — is simply not a match.
 */
const capture = z.object({ status: z.literal("COMPLETED"), amount: z.object({ value: z.string() }) });
const unit = z.object({
  custom_id: z.string().min(1),
  // Only the first capture is ours to read; anything after it is not checked.
  payments: z.object({ captures: z.tuple([capture], z.unknown()) }),
});
const capturedSchema = z.object({ status: z.literal("COMPLETED"), purchase_units: z.tuple([unit], z.unknown()) });

/** The completed capture on an order and the repository it was opened for, or null. */
function readCapture(body: unknown): { value: string; repo: string } | null {
  const parsed = capturedSchema.safeParse(body);
  if (!parsed.success) return null;
  const [first] = parsed.data.purchase_units;
  return { value: first.payments.captures[0].amount.value, repo: first.custom_id };
}

/**
 * What PayPal says was captured on an order, and which repository it was
 * opened for. Null unless the capture is complete and the order is one of ours.
 */
export async function capturedOrder(orderId: string): Promise<{ cents: number; ref: RepoRef } | null> {
  const { ok, body } = await paypal(`/v2/checkout/orders/${orderId}`, { method: "GET" });
  if (!ok) return null;

  const found = readCapture(body);
  if (found === null) return null;

  const cents = Math.round(Number(found.value) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;

  try {
    return { cents, ref: parseRepoRef(found.repo) };
  } catch {
    return null;
  }
}
