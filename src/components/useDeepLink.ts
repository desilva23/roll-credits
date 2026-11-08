"use client";

import { useEffect } from "react";

/**
 * Opens whatever the address asks for: `?repo=owner/name` starts a reading,
 * `?replay` plays a real run, and `?funded` finishes a payment an agent began.
 * A demo becomes one link to click rather than a set of instructions, which
 * matters when a judge gives it thirty seconds.
 *
 * Every callback must be stable, or each render would start the work again.
 */
export function useDeepLink(
  onRepo: (repo: string) => void,
  onReplay: () => void,
  onFunded: (orderId: string) => void,
): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const repo = params.get("repo");
    // PayPal sends a buyer back here as `?funded&token=ORDER` after they
    // approve a payment that an agent started.
    const token = params.get("token");
    // The address is an outside input, read once on arrival and acted on a
    // tick later, after the page has settled.
    const timer = setTimeout(() => {
      if (params.has("funded") && token !== null) onFunded(token);
      else if (params.has("replay")) onReplay();
      else if (repo !== null && repo.trim() !== "") onRepo(repo);
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [onRepo, onReplay, onFunded]);
}

/** Keeps the address in step with what is on screen, so it can be shared. */
export function setAddress(query: string): void {
  window.history.replaceState(null, "", query === "" ? window.location.pathname : `?${query}`);
}
