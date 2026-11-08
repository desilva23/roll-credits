"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type PayPalSession, captureOrder, createOrder, loadPayPal } from "@/lib/client/paypal-sdk";
import { money } from "@/lib/client/api";

interface Status {
  kind: "loading" | "ready" | "working" | "error";
  message: string;
}

export function FundButton({
  clientId,
  budgetCents,
  repo,
  onCaptured,
}: {
  clientId: string;
  budgetCents: number;
  /** Sealed into the PayPal order, so the payout can only pay this project's maintainers. */
  repo: string;
  onCaptured: (orderId: string) => void;
}): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: "loading", message: "Loading PayPal…" });
  const session = useRef<PayPalSession | null>(null);
  // Held in a ref so a new callback from the parent does not tear down and
  // rebuild the PayPal session mid-payment.
  const captured = useRef(onCaptured);
  useEffect(() => {
    captured.current = onCaptured;
  }, [onCaptured]);

  useEffect(() => {
    let cancelled = false;

    async function setUp(): Promise<void> {
      const instance = await loadPayPal(clientId);
      const methods = await instance.findEligibleMethods({ currencyCode: "USD" });
      if (cancelled) return;
      if (!methods.isEligible("paypal")) {
        setStatus({ kind: "error", message: "PayPal is not available for this account." });
        return;
      }
      session.current = instance.createPayPalOneTimePaymentSession({
        onApprove: async (data: { orderId: string }) => {
          setStatus({ kind: "working", message: "Confirming with PayPal…" });
          const result = await captureOrder(data.orderId);
          if (result.ok) {
            captured.current(data.orderId);
            return;
          }
          setStatus({ kind: "error", message: "PayPal could not take the payment." });
        },
        onCancel: () => {
          setStatus({ kind: "ready", message: "" });
        },
        onError: () => {
          setStatus({ kind: "error", message: "PayPal reported an error." });
        },
      });
      setStatus({ kind: "ready", message: "" });
    }

    setUp().catch((error: unknown) => {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "PayPal failed to load." });
    });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const pay = useCallback(() => {
    const current = session.current;
    if (current === null) return;
    setStatus({ kind: "working", message: "Opening PayPal…" });
    current.start({ presentationMode: "auto" }, createOrder(budgetCents, repo)).catch(() => {
      setStatus({ kind: "error", message: "Could not start the payment." });
    });
  }, [budgetCents, repo]);

  return (
    <div className="fund">
      <button type="button" onClick={pay} disabled={status.kind !== "ready"} className="button">
        {status.kind === "loading" ? "Loading PayPal…" : `Fund ${money(budgetCents)}`}
      </button>
      <p role="status" className="hint">
        {status.message}
      </p>
    </div>
  );
}
