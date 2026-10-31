"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type PayPalSession, captureOrder, createOrder, loadPayPal } from "@/lib/client/paypal-sdk";

const BUDGET_CENTS = 25_00;

interface Status {
  kind: "loading" | "ready" | "working" | "done" | "error";
  message: string;
}

export function FundButton({ clientId }: { clientId: string }): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: "loading", message: "Loading PayPal…" });
  const session = useRef<PayPalSession | null>(null);

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
          const captured = await captureOrder(data.orderId);
          setStatus(
            captured.ok
              ? { kind: "done", message: `Captured $${captured.amount ?? "?"} — status ${captured.status ?? "?"}` }
              : { kind: "error", message: "The capture failed. See the server logs." },
          );
        },
        onCancel: () => {
          setStatus({ kind: "ready", message: "Payment cancelled." });
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
    current.start({ presentationMode: "auto" }, createOrder(BUDGET_CENTS)).catch(() => {
      setStatus({ kind: "error", message: "Could not start the payment." });
    });
  }, []);

  return (
    <div className="fund">
      <button type="button" onClick={pay} disabled={status.kind !== "ready"} className="fund__button">
        Fund $25.00
      </button>
      <p role="status" className="fund__status">
        {status.kind === "loading" ? "Loading PayPal…" : status.message}
      </p>
    </div>
  );
}
