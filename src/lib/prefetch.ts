/**
 * Warm the tile cache for the places the tour visits, so flights land on a finished map instead of a
 * blank one. Requests go through the browser (and the service worker's tile cache), at low priority and
 * low concurrency, only on connections that can afford it. Nothing here is required for the app to work.
 */
import { HOTSPOTS } from "./content";
import { OFM } from "./mapStyle";

const FONT_STACKS = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"];

export interface Tile { readonly z: number; readonly x: number; readonly y: number }

/** Web-Mercator tile index containing (lat, lng) at zoom z. */
export function tileFor(lat: number, lng: number, z: number): Tile {
  const n = 2 ** z;
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { z, x: ((x % n) + n) % n, y: Math.max(0, Math.min(n - 1, y)) };
}

/** Every tile of the first `maxZ` zoom levels (the whole globe, a few hundred small files). */
export function worldTiles(maxZ: number): Tile[] {
  const out: Tile[] = [];
  for (let z = 0; z <= maxZ; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) out.push({ z, x, y });
  return out;
}

/** Tiles around a place: a 3×3 block at overview zooms, narrowing to the tile itself at street zoom. */
export function placeTiles(lat: number, lng: number, fromZ: number, toZ: number): Tile[] {
  const out: Tile[] = [];
  for (let z = fromZ; z <= toZ; z++) {
    const c = tileFor(lat, lng, z), n = 2 ** z, r = z <= 8 ? 1 : 0;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const y = c.y + dy;
      if (y >= 0 && y < n) out.push({ z, x: (((c.x + dx) % n) + n) % n, y });
    }
  }
  return out;
}

const fill = (tpl: string, t: Tile): string => tpl.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y));

function canPrefetch(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !(c?.saveData || (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)));
}

let started = false;
/** Idempotent; call once the page is interactive. Returns when the queue drains or is cancelled. */
export async function prefetchTourTiles(signal?: AbortSignal): Promise<void> {
  if (started || typeof window === "undefined" || !canPrefetch()) return;
  started = true;
  const idle = (): Promise<void> => new Promise((r) => ("requestIdleCallback" in window ? window.requestIdleCallback(() => r(), { timeout: 2000 }) : setTimeout(r, 400)));
  try {
    await idle();
    const meta = (await (await fetch(`${OFM}/planet`, { signal })).json()) as { tiles?: string[] };
    const vector = meta.tiles?.[0];
    const urls: string[] = [];
    for (const stack of FONT_STACKS) urls.push(`${OFM}/fonts/${encodeURIComponent(stack)}/0-255.pbf`);
    // 1) the globe: every low-zoom vector and relief tile
    for (const t of worldTiles(3)) { if (vector) urls.push(fill(vector, t)); urls.push(fill(`${OFM}/natural_earth/ne2sr/{z}/{x}/{y}.png`, t)); }
    // 2) each place, tour order first (Miami, Everglades, then the world views)
    const order = [...HOTSPOTS].sort((a, b) => Number(b.group === "miami") - Number(a.group === "miami"));
    for (const h of order) {
      const [lat, lng] = h.center;
      if (vector) for (const t of placeTiles(lat, lng, 4, Math.min(13, Math.round(h.zoom) + 2))) urls.push(fill(vector, t));
      for (const t of placeTiles(lat, lng, 4, 6)) urls.push(fill(`${OFM}/natural_earth/ne2sr/{z}/{x}/{y}.png`, t));
    }
    const queue = [...new Set(urls)];
    const worker = async (): Promise<void> => {
      for (let u = queue.shift(); u && !signal?.aborted; u = queue.shift()) {
        try { await fetch(u, { signal, priority: "low" } as RequestInit); } catch { /* offline or aborted: stop quietly */ if (signal?.aborted) return; }
        if (queue.length % 24 === 0) await idle();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  } catch { /* prefetching is best-effort */ }
}
