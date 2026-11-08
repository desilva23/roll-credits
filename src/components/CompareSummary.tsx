import { type Plan, money } from "@/lib/client/api";
import { count } from "@/lib/domain/text";

/**
 * The project's argument as three measured lines: the same budget, split the
 * way a dependency list would split it, beside what reading the code pays.
 * Every figure here is computed by the server from this repository, so the
 * contrast is a measurement rather than a claim.
 */
export function CompareSummary({ plan }: { plan: Plan }): React.JSX.Element {
  const { comparison, lone } = plan;

  return (
    <section className="act compare" aria-labelledby="compare-title">
      <div className="act__head">
        <h2 className="act__title" id="compare-title">
          Against a dependency list
        </h2>
        <p className="act__meta">
          {money(plan.budgetCents)} split evenly across all{" "}
          {count(comparison.rows.length, "dependency", "dependencies")}, beside this plan
        </p>
      </div>

      <table className="compare__table">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">What the money reached</span>
            </th>
            <th scope="col">By dependency list</th>
            <th scope="col">Roll Credits</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Packages your code never imports</th>
            <td>{money(comparison.byList.neverImportedCents)}</td>
            <td className="compare__ours">{money(comparison.byCode.neverImportedCents)}</td>
          </tr>
          <tr>
            <th scope="row">Code that never reaches your users</th>
            <td>{money(comparison.byList.neverShipsCents)}</td>
            <td className="compare__ours">{money(comparison.byCode.neverShipsCents)}</td>
          </tr>
          {lone === null ? null : (
            <tr>
              <th scope="row">
                {lone.name}, carrying {lone.pkg} alone
              </th>
              <td>{money(lone.byListCents)}</td>
              <td className="compare__ours">{money(lone.byCodeCents)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
