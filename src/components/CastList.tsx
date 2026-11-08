import { type Plan, money } from "@/lib/client/api";

/** The widest weight in the plan, so the rules are drawn relative to it. */
function longest(plan: Plan): number {
  return Math.max(...plan.packages.map((p) => p.score), 1);
}

/** What this package earned across everyone, exactly, from the server's breakdown. */
function paidFor(plan: Plan, pkg: string): number {
  return plan.comparison.rows.find((row) => row.pkg === pkg)?.byCodeCents ?? 0;
}

/**
 * What the scan found, in the order the money follows. Every row has to answer
 * one question a maintainer might ask: why this much, and on what evidence?
 */
export function CastList({ plan }: { plan: Plan }): React.JSX.Element {
  const max = longest(plan);

  return (
    <section className="act">
      <div className="act__head">
        <h2 className="act__title">The cast</h2>
        <p className="act__meta">
          {plan.filesRead} files read{plan.agentUsed ? ", weighed by the agent" : ", weighed by measurement alone"}
        </p>
      </div>

      <ul className="cast">
        {plan.packages.map((p) => {
          const amount = paidFor(plan, p.pkg);
          return (
            <li key={p.pkg} className="cast__item">
              <div className="cast__top">
                <span className="cast__pkg">{p.pkg}</span>
                <span className="cast__amount">{amount > 0 ? money(amount) : "—"}</span>
              </div>

              {p.role === null ? null : <p className="cast__role">{p.role}</p>}
              <p className="cast__why">{p.reason}</p>
              <div className="weight" style={{ width: `${Math.max(4, (p.score / max) * 100)}%` }} />

              <ul className="evidence">
                {p.evidence.map((e) => (
                  <li key={`${e.path}:${e.line}`}>
                    {e.path}:{e.line} {e.text}
                  </li>
                ))}
              </ul>

              {p.maintainers.length === 0 ? (
                <p className="people">Nobody to pay: this package points at no repository.</p>
              ) : (
                <p className="people">
                  <b>{p.maintainers[0]?.name}</b>
                  {p.maintainers.length > 1 ? ` and ${p.maintainers.length - 1} others` : ""}
                  {p.singleMaintainer ? <span className="alone"> · one person wrote most of this</span> : null}
                  {p.alreadyFunded ? " · already takes funding" : " · no funding link"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
