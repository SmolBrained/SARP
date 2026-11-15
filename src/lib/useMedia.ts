import { useCallback, useSyncExternalStore } from "react";

/** Subscribe to a CSS media query; returns `ssr` during prerendering. */
export function useMedia(query: string, ssr = false): boolean {
  // a stable subscribe keeps useSyncExternalStore from re-subscribing on every render
  const subscribe = useCallback((cb: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener("change", cb);
    return () => m.removeEventListener("change", cb);
  }, [query]);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => ssr,
  );
}
