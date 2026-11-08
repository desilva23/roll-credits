"use client";

import { useEffect, useState } from "react";
import { type PayoutRun, checkPayouts, money } from "@/lib/client/api";

/** PayPal takes up to a minute to settle a payout, so the roll polls as it plays. */
const POLL_MS = 4000;
const SETTLED = new Set(["SUCCESS", "UNCLAIMED", "FAILED", "BLOCKED", "RETURNED", "REFUNDED", "CANCELED", "DENIED"]);

function label(status: string): string {
  if (status === "SUCCESS") return "Paid";
  if (status === "UNCLAIMED") return "Waiting to be claimed";
  if (status === "PENDING" || status === "PROCESSING") return "Sending";
  return status.toLowerCase();
}

export function CreditsRoll({ run, onClose }: { run: PayoutRun; onClose: () => void }): React.JSX.Element {
  const [state, setState] = useState(run);

  useEffect(() => {
    if (state.items.every((item) => SETTLED.has(item.status))) return;

    let live = true;
    const timer = setInterval(() => {
      void checkPayouts(state).then(
        (next) => {
          if (live) setState(next);
        },
        () => {
          // A dropped poll is not worth interrupting the roll for; the next one retries.
        },
      );
    }, POLL_MS);

    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [state]);

  const paid = state.items.filter((item) => item.status === "SUCCESS").length;

  return (
    <div className="roll" role="dialog" aria-label="Credits">
      <button type="button" className="roll__close" onClick={onClose}>
        Close
      </button>
      <div className="roll__inner roll__inner--playing">
        <p className="roll__title">Roll Credits</p>
        {state.items.map((item) => (
          <div key={item.id} className="roll__card">
            <p className="roll__for">{money(item.cents)}</p>
            <p className={`roll__name${item.status === "SUCCESS" ? " roll__name--paid" : ""}`}>{item.name}</p>
            <p className={`roll__state${item.status === "SUCCESS" ? " roll__state--paid" : ""}`}>
              {label(item.status)}
            </p>
          </div>
        ))}
        <p className="roll__end">
          {paid} of {state.items.length} paid through PayPal.
          <br />
          Every payment was a real PayPal sandbox transaction.
          <br />
          Names have been changed. No real maintainer was paid or contacted.
        </p>
      </div>
    </div>
  );
}
