/**
 * InSAR physics core. Pure, dependency-free and allocation-light, so it runs identically on
 * the main thread, inside the render Web Worker, and in unit tests.
 *
 * Conventions
 *  - Displacements in metres, local East/North/Up (ENU) frame.
 *  - d_LOS > 0: motion TOWARD the satellite (uplift); d_LOS < 0: AWAY (subsidence).
 *  - Interferometric phase phi = (4π/λ)·d_LOS. One colour cycle (2π) = λ/2 of LOS motion.
 */

export const SPEED_OF_LIGHT = 299_792_458; // m/s
const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

/* ------------------------------------------------------------------ bands */

export type BandId = "nisar-l" | "nisar-s" | "sentinel-c" | "saocom-l";
export type BandClass = "L" | "S" | "C";

export interface Band {
  readonly id: BandId;
  readonly label: string;
  readonly mission: string;
  readonly agency: string;
  readonly freqGHz: number;
  readonly cls: BandClass;
  /** wavelength, metres */
  readonly lambda: number;
  /** LOS motion per 2π fringe, metres (λ/2) */
  readonly fringe: number;
}

function band(id: BandId, label: string, mission: string, agency: string, freqGHz: number, cls: BandClass): Band {
  const lambda = SPEED_OF_LIGHT / (freqGHz * 1e9);
  return Object.freeze({ id, label, mission, agency, freqGHz, cls, lambda, fringe: lambda / 2 });
}

/** Centre frequencies from mission documentation; wavelength = c / f. */
export const BANDS: Readonly<Record<BandId, Band>> = Object.freeze({
  "nisar-l": band("nisar-l", "NISAR L-band", "NISAR", "NASA / JPL", 1.257, "L"),
  "nisar-s": band("nisar-s", "NISAR S-band", "NISAR", "ISRO", 3.2, "S"),
  "sentinel-c": band("sentinel-c", "Sentinel-1 C-band", "Sentinel-1", "ESA", 5.405, "C"),
  "saocom-l": band("saocom-l", "SAOCOM L-band", "SAOCOM-1", "CONAE", 1.275, "L"),
});
export const BAND_IDS = Object.keys(BANDS) as BandId[];
export const isBandId = (v: unknown): v is BandId => typeof v === "string" && v in BANDS;

/* ------------------------------------------------------------------ core relations */

export const phaseFromLOS = (dLOS: number, lambda: number): number => (4 * Math.PI / lambda) * dLOS;
export const losFromPhase = (phi: number, lambda: number): number => (lambda / (4 * Math.PI)) * phi;
export function wrap(phi: number): number {
  const t = phi % TWO_PI;
  return t < 0 ? t + TWO_PI : t;
}

export type Vec3 = readonly [number, number, number];

/**
 * Unit vector from the ground to a right-looking SAR satellite, in ENU.
 * headingDeg: flight direction clockwise from north; incDeg: incidence angle.
 */
export function losVector(incDeg: number, headingDeg: number): Vec3 {
  const inc = incDeg * DEG;
  const az = (headingDeg - 90) * DEG;
  return [Math.sin(inc) * Math.sin(az), Math.sin(inc) * Math.cos(az), Math.cos(inc)];
}
export const project = (u: Vec3, los: Vec3): number => u[0] * los[0] + u[1] * los[1] + u[2] * los[2];

/** NISAR observes at 33–47° incidence; mid-swath ≈ 37°. Ascending heading ≈ −12° at low latitude. */
export const GEOMETRY = Object.freeze({ incDeg: 37, headingDeg: -12 });
export const LOS: Vec3 = losVector(GEOMETRY.incDeg, GEOMETRY.headingDeg);

/* ------------------------------------------------------------------ source models */

/**
 * Mogi (1958) point pressure source in an elastic half-space. dx, dy, depth in m; dV in m³ is the source
 * volume change (cavity volume change in the point-source limit; finite-sphere corrections such as McTigue 1987
 * are second-order for depth ≫ radius and are ignored).
 */
export function mogi(dx: number, dy: number, depth: number, dV: number, nu = 0.25): Vec3 {
  const R2 = dx * dx + dy * dy + depth * depth;
  if (!(R2 > 0)) return [0, 0, 0];
  const R3 = Math.pow(R2, 1.5);
  const c = ((1 - nu) * dV) / Math.PI;
  return [(c * dx) / R3, (c * dy) / R3, (c * depth) / R3];
}
/** dV (m³) that yields a given peak uplift (m) above a Mogi source at `depth` (m). */
export const mogiVolumeForUplift = (upliftM: number, depth: number, nu = 0.25): number =>
  (upliftM * Math.PI * depth * depth) / (1 - nu);

/** Elastic-beam tidal flexure across a grounding line (Holdsworth 1969; Rignot 1998). x > 0 seaward. */
export function tidalFlexure(x: number, amplitude: number, flexLength: number): number {
  if (!(x > 0) || !(flexLength > 0)) return 0;
  const b = x / flexLength;
  return amplitude * (1 - Math.exp(-b) * (Math.cos(b) + Math.sin(b)));
}

/** Gaussian settlement bowl (building / fill scale), vertical only. */
export const bowl = (dx: number, dy: number, amplitude: number, sigma: number): number =>
  sigma > 0 ? amplitude * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)) : 0;

/** Construction-induced creep that slows with time: d(t) = v0·τ·(1 − e^(−t/τ)); τ = 0 → linear. */
export function creep(tYears: number, v0: number, tau: number): number {
  if (tYears <= 0) return 0;
  return tau ? v0 * tau * (1 - Math.exp(-tYears / tau)) : v0 * tYears;
}
export function creepRate(tYears: number, v0: number, tau: number): number {
  if (tYears < 0) return 0;
  return tau ? v0 * Math.exp(-tYears / tau) : v0;
}

/* ------------------------------------------------------------------ coherence */

export type Surface = "urban" | "wetland" | "volcanic" | "ice" | "forest";

/**
 * Illustrative 12-day-pair coherence by surface and band. Trends follow Kim et al. (2013, IEEE TGRS)
 * for the Everglades and standard InSAR practice: longer wavelengths stay coherent over vegetation,
 * built structures are coherent at every band.
 */
export const COHERENCE: Readonly<Record<Surface, Readonly<Record<BandClass, number>>>> = Object.freeze({
  urban: { L: 0.9, S: 0.85, C: 0.8 },
  wetland: { L: 0.72, S: 0.45, C: 0.3 },
  volcanic: { L: 0.85, S: 0.7, C: 0.55 },
  ice: { L: 0.62, S: 0.45, C: 0.32 },
  forest: { L: 0.5, S: 0.25, C: 0.15 },
});
export const coherence = (surface: Surface, b: Band): number => COHERENCE[surface][b.cls];

/** Multilook count used by every renderer (thumbnails and the live map tell the same speckle story). */
export const LOOKS = 32;

/** Phase standard deviation (rad) for coherence g and N looks (Cramér–Rao bound). */
export function phaseSigma(g: number, looks = 10): number {
  const c = Math.min(Math.max(g, 0.02), 0.999);
  return Math.sqrt((1 - c * c) / (2 * looks * c * c));
}

/* ------------------------------------------------------------------ geodesy helpers */

export function metersPerDeg(lat: number): { lat: number; lng: number } {
  const p = lat * DEG;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p),
    lng: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p),
  };
}
export type LatLng = readonly [number, number];

/** Local tangent-plane offset (east, north) in metres of (lat,lng) from (lat0,lng0). */
export function offsetMeters(lat: number, lng: number, lat0: number, lng0: number): [number, number] {
  const m = metersPerDeg(lat0);
  return [(lng - lng0) * m.lng, (lat - lat0) * m.lat];
}

export type Ring = ReadonlyArray<readonly [number, number]>; // [lng, lat]
export function pointInPolygon(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance (m) along the line a→b of the point's projection, measured from a. */
export function alongLine(lat: number, lng: number, a: LatLng, b: LatLng): number {
  const p = offsetMeters(lat, lng, a[0], a[1]);
  const q = offsetMeters(b[0], b[1], a[0], a[1]);
  return (q[0] * p[0] + q[1] * p[1]) / (Math.hypot(q[0], q[1]) || 1);
}

/** Hermite smoothstep: 0 at e0, 1 at e1 (works for e0 > e1 too). */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Distance (m) from a point to the nearest edge of a ring, using a local tangent plane. */
export function distanceToRing(lng: number, lat: number, ring: Ring): number {
  const m = metersPerDeg(lat);
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j]![0] - lng) * m.lng, ay = (ring[j]![1] - lat) * m.lat;
    const bx = (ring[i]![0] - lng) * m.lng, by = (ring[i]![1] - lat) * m.lat;
    const dx = bx - ax, dy = by - ay;
    const t = Math.min(1, Math.max(0, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
}

/** Signed distance (m) from a point to the infinite line a→b; positive on the left of a→b. */
export function signedDistanceToLine(lat: number, lng: number, a: LatLng, b: LatLng): number {
  const p = offsetMeters(lat, lng, a[0], a[1]);
  const q = offsetMeters(b[0], b[1], a[0], a[1]);
  const len = Math.hypot(q[0], q[1]) || 1;
  return (q[0] * p[1] - q[1] * p[0]) / len;
}

/**
 * Fractal value noise in [−1, 1]: hashed lattice values, quintic-smoothed, three octaves. Unlike a sum of
 * sines it has no repeating grid, so it reads as natural micro-topography rather than a plaid pattern.
 */
export function fbm(x: number, y: number): number {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < 3; o++) {
    const xf = x * f, yf = y * f, xi = Math.floor(xf), yi = Math.floor(yf);
    const u = xf - xi, v = yf - yi;
    const su = u * u * u * (u * (u * 6 - 15) + 10), sv = v * v * v * (v * (v * 6 - 15) + 10);
    const a = hash2(xi + o * 17, yi), b = hash2(xi + 1 + o * 17, yi), c = hash2(xi + o * 17, yi + 1), d = hash2(xi + 1 + o * 17, yi + 1);
    sum += amp * ((a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return (sum / norm) * 2 - 1;
}

/** Deterministic hash → [0, 1). */
export function hash2(a: number, b: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

/* ------------------------------------------------------------------ colour maps */

export type RGB = [number, number, number];

/**
 * Cyclic colour map for wrapped phase: CET-C2 (Kovesi 2015, "cyclic_mygbm_30_95_c78"), a perceptually
 * uniform magenta-yellow-green-blue cycle. Unlike an HSV rainbow it has no false bands or uneven contrast,
 * so every fringe reads the same. 64 control colours, linearly interpolated.
 */
const CET_C2 = "ef55f2f55febf86be2fa78d9fb84cefc90c3fc9bb8fca6adfcb0a2fbb996fcc38afccc7efcd471fcdd64fae455f7ea45efee32e6ee25dbec1dd0e818c4e416b8e014acdc13a0d71194d31087ce0f7aca0d6cc50c5ec00c4fbc0e41b71436b11e32a92f36a33f3c9b4e41945d448c6b458579447d874076943b6ea13466ad2f5db92a53c32749cd253ed72532e02927e7371dee451bf2541df46123f66d29f7782ef88334fa8f38fb9b3cfba73ffbb541fbc243fbcf45fadb48f9e54cf7ed53f3";
const CYC_STOPS: ReadonlyArray<RGB> = Array.from({ length: CET_C2.length / 6 }, (_, i) => [0, 2, 4].map((k) => parseInt(CET_C2.slice(i * 6 + k, i * 6 + k + 2), 16)) as unknown as RGB);
export function cyclicInto(phi: number, out: RGB): RGB {
  if (!Number.isFinite(phi)) { out[0] = out[1] = out[2] = 128; return out; } // neutral grey for NaN / ±∞
  const n = CYC_STOPS.length;
  const x = ((((phi / TWO_PI) % 1) + 1) % 1) * n;
  const i = Math.floor(x) % n, f = x - Math.floor(x);
  const a = CYC_STOPS[i]!, b = CYC_STOPS[(i + 1) % n]!;
  out[0] = (a[0] + (b[0] - a[0]) * f) | 0;
  out[1] = (a[1] + (b[1] - a[1]) * f) | 0;
  out[2] = (a[2] + (b[2] - a[2]) * f) | 0;
  return out;
}
export const cyclic = (phi: number): RGB => cyclicInto(phi, [0, 0, 0]);

/** Diverging map (ColorBrewer RdBu): red = away (sinking), blue = toward (rising). v ∈ [−1, 1]. */
const DIV: ReadonlyArray<RGB> = [
  [178, 24, 43], [239, 138, 98], [253, 219, 199], [247, 247, 247], [209, 229, 240], [103, 169, 207], [33, 102, 172],
];
export function divergingInto(v: number, out: RGB): RGB {
  if (Number.isNaN(v)) { out[0] = out[1] = out[2] = 247; return out; }
  const c = v < -1 ? -1 : v > 1 ? 1 : v;
  const x = ((c + 1) / 2) * (DIV.length - 1);
  const i = Math.min(x | 0, DIV.length - 2);
  const f = x - i;
  const a = DIV[i]!;
  const b = DIV[i + 1]!;
  out[0] = (a[0] + (b[0] - a[0]) * f) | 0;
  out[1] = (a[1] + (b[1] - a[1]) * f) | 0;
  out[2] = (a[2] + (b[2] - a[2]) * f) | 0;
  return out;
}
export const diverging = (v: number): RGB => divergingInto(v, [0, 0, 0]);
