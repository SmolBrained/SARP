/**
 * Field rasteriser: turns the scene physics into RGBA pixels. Pure and allocation-free in the
 * hot loop, so it can run in a Web Worker (see workers/field.worker.ts) or on the main thread.
 *
 * Web-Mercator is separable (longitude depends only on x, latitude only on y), so callers pass one
 * longitude per column and one latitude per row instead of a lat/lng per pixel.
 */
import { BANDS, LOOKS, LOS, coherence, cyclicInto, divergingInto, phaseSigma, wrap, type BandId, type RGB } from "./physics";
import { SCENES, type DisplayMode, type SceneId } from "./scenes";

export interface FieldRequest {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly lngs: Float64Array; // length = width
  readonly lats: Float64Array; // length = height
  /** 1 byte per pixel: land coverage 0–255 (soft at the coast); null = no masking available */
  readonly landMask: Uint8Array | null;
  readonly band: BandId;
  readonly display: DisplayMode;
  readonly sceneT: Readonly<Partial<Record<SceneId, number>>>;
  readonly scenes: readonly SceneId[];
}
export interface FieldResult { readonly id: number; readonly width: number; readonly height: number; readonly pixels: Uint8ClampedArray }


/**
 * Spatially correlated unit-variance noise, tiled 256×256. Real interferograms are multilooked and
 * filtered, so decorrelation shows as soft mottling rather than per-pixel static.
 */
const NOISE_N = 256;
const NOISE = (() => {
  const n = NOISE_N, a = new Float32Array(n * n), b = new Float32Array(n * n);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < a.length; i++) a[i] = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  for (let pass = 0; pass < 2; pass++) { // two 3×3 box blurs ≈ Gaussian, wrapping at the edges
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += a[((y + dy + n) % n) * n + ((x + dx + n) % n)]!;
      b[y * n + x] = sum / 9;
    }
    a.set(b);
  }
  let m2 = 0;
  for (let i = 0; i < a.length; i++) m2 += a[i]! * a[i]!;
  const k = 1 / Math.sqrt(m2 / a.length);
  for (let i = 0; i < a.length; i++) a[i]! *= k;
  return a;
})();

export function renderField(req: FieldRequest, out?: Uint8ClampedArray): FieldResult {
  const { width: W, height: H, lngs, lats, landMask } = req;
  const px = out && out.length === W * H * 4 ? out.fill(0) : new Uint8ClampedArray(W * H * 4);
  const band = BANDS[req.band];
  const k = (4 * Math.PI) / band.lambda;
  const dLng = Math.abs(lngs[1]! - lngs[0]!) || 1e-9;
  const dLat = Math.abs(lats[0]! - lats[1]!) || 1e-9;
  const u: [number, number, number] = [0, 0, 0];
  const col: RGB = [0, 0, 0];
  const fringes = req.display === "fringes";
  const [l0, l1, l2] = LOS;

  for (const id of req.scenes) {
    const s = SCENES[id];
    const [S, Wb, N, E] = s.bbox;
    const t = req.sceneT[id] ?? (s.t.min + s.t.max) / 2;
    const sigma = phaseSigma(coherence(s.surface, band), LOOKS);
    const useMask = s.maskWater && landMask !== null;
    // restrict the loops to the scene's bounding box
    let x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1;
    while (x0 < W && lngs[x0]! < Wb) x0++;
    while (x1 >= 0 && lngs[x1]! > E) x1--;
    while (y0 < H && lats[y0]! > N) y0++;
    while (y1 >= 0 && lats[y1]! < S) y1--;

    for (let iy = y0; iy <= y1; iy++) {
      const lat = lats[iy]!;
      const qy = ((Math.round(lat / dLat) % NOISE_N) + NOISE_N) % NOISE_N;
      const row = iy * W;
      for (let ix = x0; ix <= x1; ix++) {
        const land = useMask ? landMask[row + ix]! : 255;
        if (land === 0) continue;
        const cover = s.evaluate(lat, lngs[ix]!, t, u);
        if (cover <= 0) continue;
        const d = u[0] * l0 + u[1] * l1 + u[2] * l2;
        let a: number;
        if (fringes) {
          // decorrelation noise anchored to geographic cells, so it does not swim while panning
          const qx = ((Math.round(lngs[ix]! / dLng) % NOISE_N) + NOISE_N) % NOISE_N;
          cyclicInto(wrap(k * d + sigma * NOISE[qy * NOISE_N + qx]!), col);
          a = 215;
        } else {
          const v = d / s.scale;
          a = Math.min(225, Math.abs(v) * 900);
          divergingInto(v, col);
        }
        a *= cover * (land / 255);
        if (a < 6) continue;
        const o = (row + ix) << 2;
        px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = a;
      }
    }
  }
  return { id: req.id, width: W, height: H, pixels: px };
}
