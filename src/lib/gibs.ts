/**
 * Live NASA imagery from GIBS (Global Imagery Browse Services), no login required.
 * Each GIBS date is one UTC day's mosaic and radar satellites revisit every few days, so we probe
 * backwards day by day for the most recent date with pixels over the area of interest.
 */
import { GIBS_BASE, type LiveLayer } from "./content";

export const ymd = (d: Date): string => d.toISOString().slice(0, 10);
export function daysAgo(n: number, from = new Date()): Date {
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export const tileTemplate = (layer: LiveLayer, date: string): string =>
  `${GIBS_BASE}/${layer.gibs}/default/${date}/GoogleMapsCompatible_Level${layer.level}/{z}/{y}/{x}.png`;
export const tileUrl = (layer: LiveLayer, date: string, z: number, x: number, y: number): string =>
  tileTemplate(layer, date).replace("{z}", String(z)).replace("{y}", String(y)).replace("{x}", String(x));

/** Web-Mercator tile containing (lat, lng) at zoom z, plus the pixel inside it. */
export function tileOf(lat: number, lng: number, z: number): { x: number; y: number; px: number; py: number } {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  const xf = ((lng + 180) / 360) * n;
  const yf = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x: Math.floor(xf), y: Math.floor(yf), px: Math.floor((xf % 1) * 256), py: Math.floor((yf % 1) * 256) };
}

/** Fraction of opaque pixels in a box around (px, py); null when unreadable (network/CORS). */
async function coverage(url: string, px: number, py: number, half: number, signal?: AbortSignal): Promise<number | null> {
  try {
    const res = await fetch(url, { mode: "cors", signal });
    if (res.status === 400 || res.status === 404) return 0; // date outside the layer's range
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(256, 256);
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(bmp, 0, 0);
    const x0 = Math.max(0, px - half), y0 = Math.max(0, py - half);
    const w = Math.min(256, px + half) - x0, h = Math.min(256, py + half) - y0;
    const d = g.getImageData(x0, y0, w, h).data;
    let on = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 10) on++;
    return on / (w * h);
  } catch {
    return null;
  }
}

const CACHE_TTL_MS = 6 * 3600e3;
const memo = new Map<string, Promise<LatestResult>>();
export interface LatestResult { readonly date: string | null; readonly coverage?: number; readonly cached?: boolean }

function cacheGet(k: string): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(`sarp:gibs:${k}`) ?? "null") as { date: string; at: number } | null;
    return v && Date.now() - v.at < CACHE_TTL_MS ? v.date : null;
  } catch { return null; }
}
function cacheSet(k: string, date: string): void {
  try { localStorage.setItem(`sarp:gibs:${k}`, JSON.stringify({ date, at: Date.now() })); } catch { /* private mode */ }
}

/** Most recent GIBS date with data over (lat, lng); probes 6 days in parallel. */
export function findLatest(layer: LiveLayer, lat: number, lng: number, zoom = 8, signal?: AbortSignal): Promise<LatestResult> {
  const key = `${layer.id}:${lat.toFixed(1)}:${lng.toFixed(1)}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const cached = cacheGet(key);
  if (cached) {
    const p = Promise.resolve<LatestResult>({ date: cached, cached: true });
    memo.set(key, p);
    return p;
  }
  const z = Math.min(layer.maxNative, zoom);
  const t = tileOf(lat, lng, z);
  const job = (async (): Promise<LatestResult> => {
    let unknown = 0;
    for (let start = 1; start <= layer.searchDays; start += 6) {
      const dates: string[] = [];
      for (let i = start; i < start + 6 && i <= layer.searchDays; i++) dates.push(ymd(daysAgo(i)));
      const res = await Promise.all(dates.map((d) => coverage(tileUrl(layer, d, z, t.x, t.y), t.px, t.py, 24, signal)));
      for (let j = 0; j < dates.length; j++) {
        const c = res[j];
        if (c === null || c === undefined) unknown++;
        else if (c > 0.25) { cacheSet(key, dates[j]!); return { date: dates[j]!, coverage: c }; }
      }
      if (unknown >= 6 || signal?.aborted) break; // offline / blocked: stop hammering the server
    }
    memo.delete(key);
    return { date: null };
  })();
  memo.set(key, job);
  return job;
}
