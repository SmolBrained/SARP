import { useSyncExternalStore } from "react";

/** Minimal external store for high-frequency values (cursor readout) that must not re-render the app tree. */
export interface Store<T> { get(): T; set(v: T): void; subscribe(fn: () => void): () => void }
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => {
      if (Object.is(v, value)) return;
      value = v;
      // iterate a snapshot so (un)subscribing during notification is safe; one bad listener must not starve the rest
      for (const f of [...subs]) { try { f(); } catch (e) { console.error(e); } }
    },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
}
export const useStore = <T,>(s: Store<T>): T => useSyncExternalStore(s.subscribe, s.get, s.get);
