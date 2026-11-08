"use client";

import { useState } from "react";

const EXAMPLE = "desilva23/celebration-planner";

/** Where the whole thing starts: one public repository, no sign-in. */
export function RepoField({
  busy,
  initial,
  onRead,
  onReplay,
}: {
  busy: boolean;
  /** A repository the page was opened with, so the field shows what is being read. */
  initial: string;
  onRead: (repo: string) => void;
  onReplay: () => void;
}): React.JSX.Element {
  const [repo, setRepo] = useState(initial);

  return (
    <>
      <form
        className="field"
        onSubmit={(event) => {
          event.preventDefault();
          onRead(repo);
        }}
      >
        <label className="visually-hidden" htmlFor="repo">
          Public GitHub repository
        </label>
        <input
          id="repo"
          value={repo}
          onChange={(event) => {
            setRepo(event.target.value);
          }}
          placeholder="github.com/you/your-project"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <button type="submit" className="button" disabled={busy || repo.trim() === ""}>
          {busy ? "Reading the code…" : "Read the code"}
        </button>
      </form>

      <p className="hint">
        No sign-in needed. Try{" "}
        <button
          type="button"
          onClick={() => {
            setRepo(EXAMPLE);
            onRead(EXAMPLE);
          }}
          disabled={busy}
        >
          {EXAMPLE}
        </button>
        , or{" "}
        <button type="button" onClick={onReplay} disabled={busy}>
          watch a real run
        </button>
        .
      </p>
    </>
  );
}
