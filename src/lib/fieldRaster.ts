/**
 * Full-resolution interferogram rasteriser for one scene, used by the field worker.
 *
 * Every scene with a `raster` spec is separable in time: LOS(x, t) = Σₖ cₖ(t)·Bₖ(x). The spatial
 * bases Bₖ, the coverage mask and the decorrelation noise are computed ONCE per scene on a fixed
 * geographic grid (rows evenly spaced in Web-Mercator, so the image drapes onto the map exactly).
 * Each animation frame is then a handful of multiply-adds per pixel plus a colour lookup: about
 * 3–6 ms for a megapixel, so playback runs at display rate at full resolution.
 */
import { BANDS, LOOKS, coherence, cyclicInto, divergingInto, phaseSigma, type BandId, type RGB } from "./physics";
import { SCENES, type DisplayMode, type SceneId } from "./scenes";

export interface Prepared {
  readonly id: SceneId;
  readonly width: number;
  readonly height: number;
  readonly bases: readonly Float32Array[];
  /** feathered coverage 0–1 */
  readonly cover: Float32Array;
  /** spatially correlated unit-variance noise (multilooked decorrelation texture) */
  readonly noise: Float32Array;
  /** [west, north, east, south] of the image corners */
  readonly extent: readonly [number, number, number, number];
}

const mercY = (lat: number): number => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y: number): number => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

/** Gaussian-ish blur (three box passes) in place; used to feather polygon coverage edges. */
function blur(a: Float32Array, w: number, h: number, r: number): void {
  if (r < 1) return;
  const tmp = new Float32Array(a.length);
  const pass = (src: Float32Array, dst: Float32Array, horizontal: boolean) => {
    const n = horizontal ? w : h, m = horizontal ? h : w;
    const step = horizontal ? 1 : w, lineStep = horizontal ? w : 1;
    const inv = 1 / (2 * r + 1);
    for (let j = 0; j < m; j++) {
      const base = j * lineStep;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[base + Math.min(n - 1, Math.max(0, i)) * step]!;
      for (let i = 0; i < n; i++) {
        dst[base + i * step] = acc * inv;
        acc += src[base + Math.min(n - 1, i + r + 1) * step]! - src[base + Math.max(0, i - r) * step]!;
      }
    }
  };
  for (let k = 0; k < 3; k++) { pass(a, tmp, true); pass(tmp, a, false); }
}

function correlatedNoise(w: number, h: number, seed0: number): Float32Array {
  const a = new Float32Array(w * h);
  let seed = seed0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < a.length; i++) a[i] = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  blur(a, w, h, 2); // ~5 px correlation: multilooked mottling, not per-pixel static
  let m2 = 0;
  for (let i = 0; i < a.length; i++) m2 += a[i]! * a[i]!;
  const k = 1 / Math.sqrt(m2 / a.length || 1);
  for (let i = 0; i < a.length; i++) a[i]! *= k;
  return a;
}

export function prepare(id: SceneId): Prepared {
  const sc = SCENES[id as SceneId] as (typeof SCENES)[SceneId] | undefined;
  const spec = sc?.raster;
  if (!sc || !spec) throw new Error(`scene ${id} has no raster spec`);
  const { width: W, height: H } = spec;
  const [S, Wl, N, E] = sc.bbox;
  const yN = mercY(N), yS = mercY(S);
  const lats = new Float64Array(H), lngs = new Float64Array(W);
  for (let j = 0; j < H; j++) lats[j] = invMercY(yN + ((yS - yN) * (j + 0.5)) / H);
  for (let i = 0; i < W; i++) lngs[i] = Wl + ((E - Wl) * (i + 0.5)) / W;
  const cover = new Float32Array(W * H);
  const bases = spec.terms.map(() => new Float32Array(W * H));
  for (let j = 0; j < H; j++) {
    const lat = lats[j]!;
    for (let i = 0; i < W; i++) {
      const lng = lngs[i]!, o = j * W + i;
      const c = spec.cover(lat, lng);
      cover[o] = c;
      if (c <= 0) continue;
      for (let k = 0; k < bases.length; k++) bases[k]![o] = spec.terms[k]!.los(lat, lng);
    }
  }
  blur(cover, W, H, spec.feather);
  return { id, width: W, height: H, bases, cover, noise: correlatedNoise(W, H, 1234567 + [...id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7)), extent: [Wl, N, E, S] };
}

/* colour lookup tables: one Math.cos per entry instead of three per pixel */
const CYC_N = 1024;
const CYC = (() => {
  const t = new Uint8Array(CYC_N * 3), c: RGB = [0, 0, 0];
  for (let i = 0; i < CYC_N; i++) { cyclicInto((2 * Math.PI * i) / CYC_N, c); t[i * 3] = c[0]; t[i * 3 + 1] = c[1]; t[i * 3 + 2] = c[2]; }
  return t;
})();
const DIV_N = 512;
const DIVL = (() => {
  const t = new Uint8Array(DIV_N * 3), c: RGB = [0, 0, 0];
  for (let i = 0; i < DIV_N; i++) { divergingInto((2 * i) / (DIV_N - 1) - 1, c); t[i * 3] = c[0]; t[i * 3 + 1] = c[1]; t[i * 3 + 2] = c[2]; }
  return t;
})();
/** Looks averaged per displayed pixel: published interferograms are multilooked (tens of looks), which calms speckle. */

/** Radial "develop" reveal: 0 = nothing yet, 1 = fully shown; origin in image fractions (0–1). */
export interface Reveal { readonly amount: number; readonly u: number; readonly v: number }

/** Colour one frame into `out` (RGBA, length width·height·4). */
export function paint(p: Prepared, t: number, bandId: BandId, display: DisplayMode, out: Uint8ClampedArray, reveal?: Reveal): void {
  const sc = SCENES[p.id];
  const spec = sc.raster!;
  const band = BANDS[bandId];
  const n = p.width * p.height;
  const coefs = spec.terms.map((k) => k.coef(t));
  const nb = coefs.length;
  const b0 = p.bases[0]!, b1 = p.bases[1], b2 = p.bases[2], b3 = p.bases[3];
  const c0 = coefs[0]!, c1 = coefs[1] ?? 0, c2 = coefs[2] ?? 0, c3 = coefs[3] ?? 0;
  const { cover, noise } = p;
  if (display === "fringes") {
    const k = ((4 * Math.PI) / band.lambda) * (CYC_N / (2 * Math.PI)); // metres → LUT index
    const sig = phaseSigma(coherence(sc.surface, band), LOOKS) * (CYC_N / (2 * Math.PI));
    for (let o = 0; o < n; o++) {
      const cv = cover[o]!;
      const q = o << 2;
      if (cv < 0.004) { out[q + 3] = 0; continue; }
      let d = c0 * b0[o]!;
      if (nb > 1) d += c1 * b1![o]! + (nb > 2 ? c2 * b2![o]! + (nb > 3 ? c3 * b3![o]! : 0) : 0);
      let idx = Math.round(k * d + sig * noise[o]!) % CYC_N;
      if (idx < 0) idx += CYC_N;
      const l = idx * 3;
      out[q] = CYC[l]!; out[q + 1] = CYC[l + 1]!; out[q + 2] = CYC[l + 2]!;
      out[q + 3] = 255 * Math.min(1, cv * 1.15);
    }
  } else {
    const inv = 1 / sc.scale;
    for (let o = 0; o < n; o++) {
      const cv = cover[o]!;
      const q = o << 2;
      if (cv < 0.004) { out[q + 3] = 0; continue; }
      let d = c0 * b0[o]!;
      if (nb > 1) d += c1 * b1![o]! + (nb > 2 ? c2 * b2![o]! + (nb > 3 ? c3 * b3![o]! : 0) : 0);
      const v = d * inv;
      const vc = v < -1 ? -1 : v > 1 ? 1 : v;
      const l = Math.round(((vc + 1) / 2) * (DIV_N - 1)) * 3;
      out[q] = DIVL[l]!; out[q + 1] = DIVL[l + 1]!; out[q + 2] = DIVL[l + 2]!;
      out[q + 3] = Math.min(230, 60 + Math.abs(v) * 900) * Math.min(1, cv * 1.15);
    }
  }
  if (reveal && reveal.amount < 1) applyReveal(p, out, reveal);
}

/** Masks the frame to a growing disc with a bright 2–3 px leading edge, as if the radar were printing it. */
function applyReveal(p: Prepared, out: Uint8ClampedArray, r: Reveal): void {
  const W = p.width, H = p.height, ox = r.u * W, oy = r.v * H;
  const far = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy));
  const R = r.amount * far * 1.04, edge = Math.max(3, far * 0.035);
  for (let y = 0; y < H; y++) {
    const dy = y - oy;
    for (let x = 0; x < W; x++) {
      const q = (y * W + x) << 2;
      if (out[q + 3] === 0) continue;
      const d = Math.sqrt((x - ox) * (x - ox) + dy * dy);
      if (d >= R) { out[q + 3] = 0; continue; }
      if (d > R - edge) {
        const k = (R - d) / edge; // 0 at the front, 1 behind it
        const glow = 1 - k;
        out[q] = out[q]! + (255 - out[q]!) * glow * 0.75;
        out[q + 1] = out[q + 1]! + (255 - out[q + 1]!) * glow * 0.75;
        out[q + 2] = out[q + 2]! + (255 - out[q + 2]!) * glow * 0.75;
        out[q + 3] = Math.max(out[q + 3]!, 200 * glow) * Math.min(1, 0.35 + k);
      }
    }
  }
}
