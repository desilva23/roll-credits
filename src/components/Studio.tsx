"use client";

import { useCallback, useState } from "react";
import { CastList } from "@/components/CastList";
import { CreditsRoll } from "@/components/CreditsRoll";
import { FundButton } from "@/components/FundButton";
import { LedgerGrid } from "@/components/LedgerGrid";
import { RepoField } from "@/components/RepoField";
import { type View, ViewTabs } from "@/components/ViewTabs";
import { type PayoutRun, type Plan, money, readRepo, startPayouts } from "@/lib/client/api";

const BUDGET_CENTS = 25_00;

type Stage =
  | { at: "idle" }
  | { at: "reading" }
  | { at: "plan"; plan: Plan }
  | { at: "paying"; plan: Plan }
  | { at: "rolling"; run: PayoutRun };

export function Studio({ clientId }: { clientId: string }): React.JSX.Element {
  const [stage, setStage] = useState<Stage>({ at: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [view, setView] = useState<View>("credits");

  const read = useCallback((which: string) => {
    if (which.trim() === "") return;
    setProblem(null);
    setStage({ at: "reading" });
    void readRepo(which, BUDGET_CENTS).then(
      (plan) => {
        setStage({ at: "plan", plan });
      },
      (error: unknown) => {
        setProblem(error instanceof Error ? error.message : "The scan failed.");
        setStage({ at: "idle" });
      },
    );
  }, []);

  const onCaptured = useCallback(
    (orderId: string) => {
      if (stage.at !== "plan") return;
      const { plan } = stage;
      setStage({ at: "paying", plan });
      void startPayouts(orderId, plan.repo).then(
        (run) => {
          setStage({ at: "rolling", run });
        },
        (error: unknown) => {
          setProblem(error instanceof Error ? error.message : "The payout failed.");
          setStage({ at: "plan", plan });
        },
      );
    },
    [stage],
  );

  if (stage.at === "rolling") {
    return (
      <CreditsRoll
        run={stage.run}
        onClose={() => {
          setStage({ at: "idle" });
        }}
      />
    );
  }

  const plan = stage.at === "plan" || stage.at === "paying" ? stage.plan : null;
  const busy = stage.at === "reading" || stage.at === "paying";

  return (
    <>
      <RepoField busy={busy} onRead={read} />
      {problem === null ? null : <p className="notice">{problem}</p>}
      {plan === null ? null : (
        <>
          <ViewTabs view={view} onChange={setView} />
          {view === "credits" ? <CastList plan={plan} /> : <LedgerGrid plan={plan} />}

          <section className="act">
            <div className="act__head">
              <h2 className="act__title">Pay them</h2>
              <p className="act__meta">
                {money(plan.totalCents)} to {plan.allocations.length} people
              </p>
            </div>
            {stage.at === "paying" ? (
              <p className="hint">Sending the payouts through PayPal…</p>
            ) : (
              <FundButton clientId={clientId} budgetCents={BUDGET_CENTS} onCaptured={onCaptured} />
            )}
          </section>
        </>
      )}
    </>
  );
}
