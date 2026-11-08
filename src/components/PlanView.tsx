"use client";

import { useState } from "react";
import { CastList } from "@/components/CastList";
import { CompareSummary } from "@/components/CompareSummary";
import { FundButton } from "@/components/FundButton";
import { LedgerGrid } from "@/components/LedgerGrid";
import { type View, ViewTabs } from "@/components/ViewTabs";
import { type Plan, money } from "@/lib/client/api";

/** Everything shown once a repository has been read: the argument, the detail, and the button. */
export function PlanView({
  plan,
  paying,
  clientId,
  budgetCents,
  onCaptured,
}: {
  plan: Plan;
  paying: boolean;
  clientId: string;
  budgetCents: number;
  onCaptured: (orderId: string) => void;
}): React.JSX.Element {
  const [view, setView] = useState<View>("credits");

  return (
    <>
      <CompareSummary plan={plan} />
      <ViewTabs view={view} onChange={setView} />
      {view === "credits" ? <CastList plan={plan} /> : <LedgerGrid plan={plan} />}

      <section className="act">
        <div className="act__head">
          <h2 className="act__title">Pay them</h2>
          <p className="act__meta">
            {money(plan.totalCents)} to {plan.allocations.length} people
          </p>
        </div>
        {paying ? (
          <p className="hint">Sending the payouts through PayPal…</p>
        ) : (
          <FundButton clientId={clientId} budgetCents={budgetCents} repo={plan.repo} onCaptured={onCaptured} />
        )}
      </section>
    </>
  );
}
