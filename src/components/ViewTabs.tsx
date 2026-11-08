"use client";

export type View = "credits" | "ledger";

/** The same reading, two ways: the argument, and the spreadsheet behind it. */
export function ViewTabs({ view, onChange }: { view: View; onChange: (next: View) => void }): React.JSX.Element {
  return (
    <div className="views" role="group" aria-label="How to show the reading">
      {(["credits", "ledger"] as const).map((name) => (
        <button
          key={name}
          type="button"
          className={`views__tab${view === name ? " views__tab--on" : ""}`}
          aria-pressed={view === name}
          onClick={() => {
            onChange(name);
          }}
        >
          {name === "credits" ? "Credits" : "Ledger"}
        </button>
      ))}
    </div>
  );
}
