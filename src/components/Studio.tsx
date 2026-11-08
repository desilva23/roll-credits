"use client";

import { useCallback, useState } from "react";
import { CreditsRoll } from "@/components/CreditsRoll";
import { PlanView } from "@/components/PlanView";
import { ReadingSteps } from "@/components/ReadingSteps";
import { RepoField } from "@/components/RepoField";
import { setAddress, useDeepLink } from "@/components/useDeepLink";
import { type PayoutRun, type Plan, readRepo, startPayouts } from "@/lib/client/api";
import { replay, replayCaption } from "@/lib/client/replay";

const BUDGET_CENTS = 25_00;

type Stage =
  | { at: "idle" }
  | { at: "reading" }
  | { at: "plan"; plan: Plan }
  | { at: "paying"; plan: Plan }
  | { at: "rolling"; run: PayoutRun; caption?: string };

/**
 * Once PayPal has captured the order, asks the server to pay everyone. The
 * server re-checks the capture with PayPal itself before any money moves.
 */
function payOut(
  orderId: string,
  plan: Plan,
  setStage: (stage: Stage) => void,
  setProblem: (problem: string) => void,
): void {
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
}

export function Studio({ clientId }: { clientId: string }): React.JSX.Element {
  const [stage, setStage] = useState<Stage>({ at: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [seed, setSeed] = useState("");

  const read = useCallback((which: string) => {
    if (which.trim() === "") return;
    setProblem(null);
    setSteps([]);
    setStage({ at: "reading" });
    void readRepo(which, BUDGET_CENTS, (message) => {
      setSteps((before) => [...before, message]);
    }).then(
      (plan) => {
        setStage({ at: "plan", plan });
        setAddress(`repo=${encodeURIComponent(plan.repo)}`);
      },
      (error: unknown) => {
        setProblem(error instanceof Error ? error.message : "The scan failed.");
        setStage({ at: "idle" });
      },
    );
  }, []);

  const openReplay = useCallback(() => {
    setStage({ at: "rolling", run: replay.run, caption: replayCaption });
    setAddress("replay");
  }, []);

  const arrive = useCallback(
    (repo: string) => {
      setSeed(repo);
      read(repo);
    },
    [read],
  );
  useDeepLink(arrive, openReplay);

  const onCaptured = useCallback(
    (orderId: string) => {
      if (stage.at === "plan") payOut(orderId, stage.plan, setStage, setProblem);
    },
    [stage],
  );

  if (stage.at === "rolling") {
    return (
      <CreditsRoll
        run={stage.run}
        {...(stage.caption === undefined ? {} : { caption: stage.caption })}
        onClose={() => {
          setStage({ at: "idle" });
          setAddress("");
        }}
      />
    );
  }

  const plan = stage.at === "plan" || stage.at === "paying" ? stage.plan : null;
  const busy = stage.at === "reading" || stage.at === "paying";

  return (
    <>
      <RepoField key={seed} initial={seed} busy={busy} onRead={read} onReplay={openReplay} />
      {stage.at === "reading" ? <ReadingSteps steps={steps} /> : null}
      {problem === null ? null : <p className="notice">{problem}</p>}
      {plan === null ? null : (
        <PlanView
          plan={plan}
          paying={stage.at === "paying"}
          clientId={clientId}
          budgetCents={BUDGET_CENTS}
          onCaptured={onCaptured}
        />
      )}
    </>
  );
}
