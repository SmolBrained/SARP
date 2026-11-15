import { isBandId, type BandId } from "./physics";
import type { DisplayMode } from "./scenes";
import { HOTSPOT_BY_ID } from "./content";

export type View = "miami" | "everglades" | "world";
export const VIEWS: readonly View[] = ["miami", "everglades", "world"];
export const isView = (v: unknown): v is View => typeof v === "string" && (VIEWS as readonly string[]).includes(v);

export interface UrlState { view?: View; place?: string; band?: BandId; display?: DisplayMode }

/** Parse "#v=world&p=iceland&b=nisar-l&d=fringes" defensively; unknown values are ignored. */
export function parseHash(hash: string): UrlState {
  const p = new URLSearchParams(hash.replace(/^#\/?/, ""));
  const out: UrlState = {};
  const v = p.get("v"); if (isView(v)) out.view = v;
  const h = p.get("p"); if (h && HOTSPOT_BY_ID[h]) out.place = h;
  const b = p.get("b"); if (isBandId(b)) out.band = b;
  const d = p.get("d"); if (d === "fringes" || d === "displacement") out.display = d;
  return out;
}
export function toHash(s: Required<UrlState>): string {
  return `#${new URLSearchParams({ v: s.view, p: s.place, b: s.band, d: s.display }).toString()}`;
}
