"use client";

import { useEffect } from "react";

/**
 * Opens whatever the address asks for: `?repo=owner/name` starts a reading and
 * `?replay` plays a real run. A demo becomes one link to click rather than a
 * set of instructions, which matters when a judge gives it thirty seconds.
 *
 * Both callbacks must be stable, or every render would start a new reading.
 */
export function useDeepLink(onRepo: (repo: string) => void, onReplay: () => void): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const repo = params.get("repo");
    // The address is an outside input, read once on arrival and acted on a
    // tick later, after the page has settled.
    const timer = setTimeout(() => {
      if (params.has("replay")) onReplay();
      else if (repo !== null && repo.trim() !== "") onRepo(repo);
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [onRepo, onReplay]);
}

/** Keeps the address in step with what is on screen, so it can be shared. */
export function setAddress(query: string): void {
  window.history.replaceState(null, "", query === "" ? window.location.pathname : `?${query}`);
}
