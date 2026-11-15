/**
 * Physics-based scenes, each calibrated to published measurements (see content.ts for citations).
 * A scene maps (lat, lng, t) → ENU displacement, or null where it has no measurement.
 */
import {
  type Band, type LatLng, type Ring, type Surface, type Vec3,
  LOS, bowl, coherence, creep, creepRate, metersPerDeg, mogi, mogiVolumeForUplift, offsetMeters, phaseFromLOS,
  alongLine, distanceToRing, pointInPolygon, project, signedDistanceToLine, fbm, smoothstep, tidalFlexure,
} from "./physics";

export type SceneId = "miami" | "everglades" | "iceland" | "thwaites";
export type SceneKind = "deformation" | "water";
export type DisplayMode = "fringes" | "displacement";

export interface TimeAxis {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly units: string;
  label(t: number): string;
  short(t: number): string;
}

export interface Scene {
  readonly id: SceneId;
  readonly kind: SceneKind;
  readonly surface: Surface;
  /** [south, west, north, east] */
  readonly bbox: readonly [number, number, number, number];
  readonly t: TimeAxis;
  readonly display: DisplayMode;
  /** LOS displacement mapped to the full colour range in displacement mode (m). */
  readonly scale: number;
  /** Mask the field with the land polygons (scenes on coastlines with open water). */
  readonly maskWater: boolean;
  /**
   * ENU displacement written into `out`. Returns the measurement's coverage in [0, 1]: 0 where the
   * scene has no data, fading smoothly to 1 inside, so footprints never end in a hard cut.
   */
  evaluate(lat: number, lng: number, t: number, out: [number, number, number]): number;
  /**
   * Separable form used by the GPU-friendly renderer: LOS(lat, lng, t) = Σₖ coefₖ(t) · basisₖ(lat, lng).
   * Spatial bases are computed once per scene; each frame only re-weights them. Absent for scenes
   * drawn as points (Miami persistent scatterers).
   */
  readonly raster?: RasterSpec;
}

export interface FieldTerm {
  /** time weight */
  coef(t: number): number;
  /** LOS displacement (m) per unit weight */
  los(lat: number, lng: number): number;
}
export interface RasterSpec {
  /** output grid; rows are spaced evenly in Web-Mercator y so the image maps 1:1 onto the map */
  readonly width: number;
  readonly height: number;
  readonly terms: readonly FieldTerm[];
  /** coverage 0–1 (same as evaluate's return value) */
  cover(lat: number, lng: number): number;
  /** blur radius for the coverage edge, in output pixels (softens polygon corners) */
  readonly feather: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/* --------------------------------------------------------------- Miami barrier islands */
// Calibrated to Aziz Zanjani et al. (2024, Earth and Space Science): 35 coastal high-rises sank 2–8 cm
// (2016–2023), mostly post-2014 buildings, slowing with time; and Fiaschi & Wdowinski (2020, Ocean &
// Coastal Management): 1–3 mm/yr pockets on reclaimed wetlands. Area-level, approximate positions.
export interface CreepSource { readonly lat: number; readonly lng: number; readonly v0: number; readonly tau: number; readonly sigma: number }
export const MIAMI_SOURCES: readonly CreepSource[] = [
  // Sunny Isles Beach (north): most widespread subsidence in the study
  { lat: 25.9478, lng: -80.1203, v0: -0.010, tau: 4, sigma: 80 },
  { lat: 25.9528, lng: -80.1201, v0: -0.012, tau: 5, sigma: 85 },
  { lat: 25.9583, lng: -80.1199, v0: -0.009, tau: 4, sigma: 80 },
  { lat: 25.9641, lng: -80.1198, v0: -0.011, tau: 6, sigma: 85 },
  { lat: 25.9392, lng: -80.1206, v0: -0.007, tau: 4, sigma: 75 },
  // Bal Harbour
  { lat: 25.8907, lng: -80.1236, v0: -0.008, tau: 5, sigma: 80 },
  // Surfside / North Beach: post-2014 towers just south and north of the Champlain Towers South
  // site. The study found several cm at the neighbour and no pre-collapse signal at the site.
  { lat: 25.8797, lng: -80.1214, v0: -0.011, tau: 3, sigma: 60 },
  { lat: 25.8848, lng: -80.1222, v0: -0.009, tau: 3, sigma: 60 },
  // Miami Beach west: reclaimed wetlands, slow and steady, broader pockets
  { lat: 25.7952, lng: -80.1398, v0: -0.002, tau: 0, sigma: 220 },
  { lat: 25.8085, lng: -80.1372, v0: -0.0025, tau: 0, sigma: 260 },
  { lat: 25.7848, lng: -80.1447, v0: -0.0015, tau: 0, sigma: 200 },
  { lat: 25.83, lng: -80.129, v0: -0.0018, tau: 0, sigma: 240 },
];
// Pre-compute metres-per-degree once: all sources lie within 0.2° of 25.88° N.
const MIAMI_MPD = metersPerDeg(25.88);

function miamiOffset(s: CreepSource, lat: number, lng: number): [number, number] {
  return [(lng - s.lng) * MIAMI_MPD.lng, (lat - s.lat) * MIAMI_MPD.lat];
}

export const miamiRate = (lat: number, lng: number, t: number): number => {
  let r = 0;
  for (const s of MIAMI_SOURCES) {
    const [dx, dy] = miamiOffset(s, lat, lng);
    r += bowl(dx, dy, creepRate(t, s.v0, s.tau), s.sigma);
  }
  return r;
};

const miami: Scene = {
  id: "miami", kind: "deformation", surface: "urban", display: "displacement", scale: 0.04, maskWater: false,
  bbox: [25.76, -80.17, 25.98, -80.1],
  t: { min: 0, max: 10, step: 0.25, units: "years since Jan 2016", label: (t) => `${MONTHS[Math.min(11, Math.floor((((t % 1) + 1) % 1) * 12))]} ${Math.floor(2016 + t)}`, short: (t) => String(Math.floor(2016 + t)) },
  // Urban InSAR measures persistent scatterers (rooftops, balconies), so values exist only near structures.
  evaluate(lat, lng, t, out) {
    let up = 0;
    let near = false;
    for (const s of MIAMI_SOURCES) {
      const [dx, dy] = miamiOffset(s, lat, lng);
      const lim = 3 * s.sigma;
      if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
      near = true;
      up += bowl(dx, dy, creep(t, s.v0, s.tau), s.sigma);
    }
    out[0] = 0; out[1] = 0; out[2] = up;
    return near ? 1 : 0;
  },
};

/* --------------------------------------------------------------- Everglades wetland InSAR */
// Double bounce (water surface + emergent stems) makes phase sensitive to WATER-LEVEL CHANGE
// (Wdowinski et al. 2004, 2008; Hong et al. 2010). Path change = dh·cos(θ) → 1 L-band fringe ≈ 15 cm.
export const SHARK_SLOUGH: Ring = [[-80.5, 25.76], [-80.62, 25.77], [-80.8, 25.7], [-80.95, 25.56], [-81.06, 25.43], [-81.02, 25.36], [-80.9, 25.4], [-80.78, 25.52], [-80.62, 25.62], [-80.5, 25.68]];
export const WCA3A: Ring = [[-80.83, 25.77], [-80.47, 25.77], [-80.44, 26.05], [-80.68, 26.33], [-80.88, 26.3], [-80.86, 26.0]];
// Fresh/salt transition at the slough's mangrove outlet: the line runs along the lower-slough coast; left of A→B (heading SSE) = inland.
const GULF_A: LatLng = [25.35, -81.02];
const GULF_B: LatLng = [25.15, -80.92];

/** Seasonal stage (m above the mid-April low), ~45 cm range — the order reported by USGS EDEN gauges. */
export const seasonalStage = (dayOfYear: number): number => 0.225 * (1 - Math.cos((2 * Math.PI * (dayOfYear - 105)) / 365));
const evRise = (t: number): number => seasonalStage(105 + t) - seasonalStage(105);
const ssDownstream = (lat: number): number => Math.min(Math.max((25.77 - lat) / 0.42, 0), 1);
const wcaGradient = (lat: number, lng: number): number => (lng + 80.86) / 0.42 + (26.3 - lat) / 0.56;
const REF_DAY = Date.UTC(2026, 3, 15);
const dateAt = (t: number): Date => new Date(REF_DAY + t * 864e5);

/**
 * One continuous wetland footprint (Shark River Slough ∪ WCA-3A) with organic, softly fading edges:
 * the basin polygons set the extent, and two octaves of smooth noise wobble the boundary by a few km,
 * so the field reads like a wetland, not a cut-out. Each point takes the physics of the nearer basin.
 */
let evMemo = { lat: NaN, lng: NaN, ss: 0, w: 0 };
function evSigned(lat: number, lng: number): { ss: number; w: number } {
  if (lat !== evMemo.lat || lng !== evMemo.lng) {
    const ss = (pointInPolygon(lng, lat, SHARK_SLOUGH) ? 1 : -1) * distanceToRing(lng, lat, SHARK_SLOUGH);
    const w = (pointInPolygon(lng, lat, WCA3A) ? 1 : -1) * distanceToRing(lng, lat, WCA3A);
    evMemo = { lat, lng, ss, w };
  }
  return evMemo;
}
const evEdgeNoise = (lat: number, lng: number): number => 3_200 * fbm(lng * 9 + 3.1, lat * 9 - 1.7);
function evCover(lat: number, lng: number): number {
  const { ss, w } = evSigned(lat, lng);
  const d = Math.max(ss, w);
  if (d < -9_000) return 0;
  const c = smoothstep(-2_500, 3_500, d + evEdgeNoise(lat, lng));
  return c < 1e-3 ? 0 : c;
}
const inSlough = (lat: number, lng: number): boolean => { const { ss, w } = evSigned(lat, lng); return ss >= w; };
const evTidal = (lat: number, lng: number): number => {
  // tidal fringe along the fresh/salt transition (observed by Wdowinski et al. 2008)
  const x = signedDistanceToLine(lat, lng, GULF_A, GULF_B);
  return x < 35_000 && x > -2_000 ? 0.12 * Math.exp(-Math.max(x, 0) / 10_000) : 0;
};
const everglades: Scene = {
  raster: {
    width: 880, height: 1000, feather: 6,
    cover: evCover,
    terms: [
      { coef: evRise, los: (lat, lng) => LOS[2] * (inSlough(lat, lng) ? 1.15 - 0.5 * ssDownstream(lat) : 0.6 + 0.35 * wcaGradient(lat, lng)) },
      { coef: (t) => Math.min(1, t / 60), los: (lat, lng) => (inSlough(lat, lng) ? LOS[2] * 0.02 * fbm(lng * 22, lat * 22) : 0) },
      { coef: (t) => Math.sin(t * 0.83), los: (lat, lng) => (inSlough(lat, lng) ? LOS[2] * evTidal(lat, lng) : 0) },
      { coef: () => 1, los: (lat, lng) => (inSlough(lat, lng) ? 0 : LOS[2] * 0.015 * fbm(lng * 18 + 5, lat * 18)) },
    ],
  },
  id: "everglades", kind: "water", surface: "wetland", display: "fringes", scale: 0.45, maskWater: false,
  bbox: [25.2, -81.45, 26.45, -80.3],
  t: {
    min: 0, max: 365, step: 1, units: "after mid-April reference pass",
    label: (t) => { const d = dateAt(t); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; },
    short: (t) => { const d = dateAt(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; },
  },
  evaluate(lat, lng, t, out) {
    const cover = evCover(lat, lng);
    if (cover <= 0) return 0;
    const rise = evRise(t);
    const dh = inSlough(lat, lng)
      ? rise * (1.15 - 0.5 * ssDownstream(lat)) + 0.02 * fbm(lng * 22, lat * 22) * Math.min(1, t / 60) + evTidal(lat, lng) * Math.sin(t * 0.83)
      : rise * (0.6 + 0.35 * wcaGradient(lat, lng)) + 0.015 * fbm(lng * 18 + 5, lat * 18); // managed impoundment: water piles up to the SE
    out[0] = 0; out[1] = 0; out[2] = dh;
    return cover;
  },
};

/* --------------------------------------------------------------- Svartsengi, Iceland */
// Icelandic Met Office (2026): accumulation zone ~4 km deep, steady uplift ~2 cm/month.
export const SVARTSENGI = Object.freeze({ lat: 63.875, lng: -22.445, depth: 4_000 });
export const SVARTSENGI_DV_PER_MONTH = mogiVolumeForUplift(0.02, SVARTSENGI.depth);

const icelandUnitLOS = (lat: number, lng: number): number => {
  const [dx, dy] = offsetMeters(lat, lng, SVARTSENGI.lat, SVARTSENGI.lng);
  return project(mogi(dx, dy, SVARTSENGI.depth, SVARTSENGI_DV_PER_MONTH), LOS);
};
const iceland: Scene = {
  raster: {
    width: 1024, height: 1024, feather: 2,
    cover(lat, lng) {
      const r = Math.hypot(...offsetMeters(lat, lng, SVARTSENGI.lat, SVARTSENGI.lng));
      return r > 24_000 ? 0 : Math.max(1 - smoothstep(15_000, 24_000, r), 0.001);
    },
    terms: [{ coef: (t) => t, los: icelandUnitLOS }], // Mogi displacement is linear in volume, volume linear in time
  },
  id: "iceland", kind: "deformation", surface: "volcanic", display: "fringes", scale: 0.3, maskWater: true,
  bbox: [63.7, -22.85, 64.05, -22.05],
  t: { min: 0, max: 16, step: 0.1, units: "months since Jul 2025 eruption", label: (t) => `${t.toFixed(1)} months`, short: (t) => `${Math.round(t)} mo` },
  evaluate(lat, lng, t, out) {
    const [dx, dy] = offsetMeters(lat, lng, SVARTSENGI.lat, SVARTSENGI.lng);
    const r = Math.hypot(dx, dy);
    if (r > 24_000) return 0;
    const u = mogi(dx, dy, SVARTSENGI.depth, SVARTSENGI_DV_PER_MONTH * t);
    out[0] = u[0]; out[1] = u[1]; out[2] = u[2];
    return Math.max(1 - smoothstep(15_000, 24_000, r), 0.001); // round footprint, soft rim
  },
};

/* --------------------------------------------------------------- Thwaites Glacier */
export const THWAITES_GL: readonly [LatLng, LatLng] = [[-75.55, -107.6], [-75.15, -104.9]]; // schematic; left = seaward
const THWAITES_LEN = Math.hypot(...offsetMeters(THWAITES_GL[1][0], THWAITES_GL[1][1], THWAITES_GL[0][0], THWAITES_GL[0][1]));
/** Swath footprint with softly wandering edges (a few km of smooth noise), so no edge reads as a ruler cut. */
const thwaitesCover = (lat: number, lng: number): number => {
  const x = signedDistanceToLine(lat, lng, THWAITES_GL[0], THWAITES_GL[1]) + 5_000 * fbm(lng * 0.6 + 1.3, lat * 2.2);
  if (x < -20_000 || x > 60_000) return 0;
  const along = alongLine(lat, lng, THWAITES_GL[0], THWAITES_GL[1]) + 7_000 * fbm(lat * 2 - 0.4, lng * 0.55 + 9);
  return smoothstep(-20_000, -10_000, x) * (1 - smoothstep(48_000, 60_000, x)) * smoothstep(-25_000, -5_000, along) * (1 - smoothstep(THWAITES_LEN + 5_000, THWAITES_LEN + 25_000, along));
};
const thwaites: Scene = {
  raster: {
    width: 1024, height: 1024, feather: 2,
    cover: thwaitesCover,
    terms: [{
      coef: (t) => 0.9 * Math.sin((2 * Math.PI * t) / 14.77), // differential tide between passes (m)
      los: (lat, lng) => LOS[2] * tidalFlexure(signedDistanceToLine(lat, lng, THWAITES_GL[0], THWAITES_GL[1]), 1, 3_500),
    }],
  },
  id: "thwaites", kind: "deformation", surface: "ice", display: "fringes", scale: 0.8, maskWater: false,
  bbox: [-75.9, -109.0, -74.6, -103.5],
  t: { min: 0, max: 30, step: 0.25, units: "spring–neap tide cycle ≈ 14.8 d", label: (t) => `Day ${t.toFixed(1)}`, short: (t) => `d${Math.round(t)}` },
  evaluate(lat, lng, t, out) {
    const cover = thwaitesCover(lat, lng); // shared with the renderer: soft, wandering footprint
    if (cover <= 0) return 0;
    const x = signedDistanceToLine(lat, lng, THWAITES_GL[0], THWAITES_GL[1]); // physics uses the true distance
    const amp = 0.9 * Math.sin((2 * Math.PI * t) / 14.77); // differential tide between passes (m)
    out[0] = 0; out[1] = 0; out[2] = tidalFlexure(x, amp, 3_500);
    return cover;
  },
};

export const SCENES: Readonly<Record<SceneId, Scene>> = Object.freeze({ miami, everglades, iceland, thwaites });
export const SCENE_IDS = Object.keys(SCENES) as SceneId[];

/* --------------------------------------------------------------- sampling */

export interface Sample {
  readonly u: Vec3;
  readonly dLOS: number;
  readonly up: number;
  readonly phase: number;
  readonly coherence: number;
}

export function sample(scene: Scene, lat: number, lng: number, t: number, b: Band): Sample | null {
  const u: [number, number, number] = [0, 0, 0];
  if (scene.evaluate(lat, lng, t, u) < 0.05) return null;
  const dLOS = project(u, LOS);
  return { u, dLOS, up: u[2], phase: phaseFromLOS(dLOS, b.lambda), coherence: coherence(scene.surface, b) };
}

export interface SeriesPoint { readonly t: number; readonly label: string; readonly value: number | null }

/** Time series at a point. `kind: "water"` returns water level (m); otherwise LOS displacement (m). */
export function timeSeries(scene: Scene, at: LatLng, b: Band, n = 40): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = scene.t.min + ((scene.t.max - scene.t.min) * i) / n;
    const s = sample(scene, at[0], at[1], t, b);
    out.push({ t, label: scene.t.short(t), value: s ? (scene.kind === "water" ? s.up : s.dLOS) : null });
  }
  return out;
}

export function sceneContaining(lat: number, lng: number): Scene | null {
  for (const id of SCENE_IDS) {
    const s = SCENES[id];
    const [S, W, N, E] = s.bbox;
    if (lat >= S && lat <= N && lng >= W && lng <= E) return s;
  }
  return null;
}
