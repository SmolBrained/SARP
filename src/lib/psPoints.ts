/**
 * Miami as urban InSAR is actually published: a cloud of persistent scatterers (rooftops, balconies,
 * railings that reflect the radar consistently), each coloured by how far it has moved. Points are
 * placed deterministically: dense around the calibrated subsidence sources, sparse elsewhere on the
 * barrier islands. Points that fall in the bay or the ocean are hidden by the basemap water layer.
 *
 * Each point stores its two strongest source weights, so updating the whole cloud for a new time is
 * one creep() per source plus two multiply-adds per point.
 */
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import { bowl, creep, metersPerDeg } from "./physics";
import { MIAMI_SOURCES, SCENES } from "./scenes";

export interface PsProps { v: number }
const SCALE = SCENES.miami.scale; // m mapped to full colour: one source of truth with the scene
const MPD = metersPerDeg(25.88);

interface Pt { lng: number; lat: number; i1: number; w1: number; i2: number; w2: number }

function build(): Pt[] {
  let seed = 20160101;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const raw: [number, number][] = [];
  for (let k = 0; k < 9_000; k++) raw.push([-80.158 + 0.045 * rnd(), 25.765 + 0.207 * rnd()]);
  for (const s of MIAMI_SOURCES) {
    if (s.sigma > 150) {
      // reclaimed-wetland pockets: broad, roughly round neighbourhoods
      for (let k = 0; k < 360; k++) raw.push([s.lng + (gauss() * s.sigma * 1.25) / MPD.lng, s.lat + (gauss() * s.sigma * 1.25) / MPD.lat]);
    } else {
      // beachfront towers: a row along the coast, on the land (west) side of the shoreline
      for (let k = 0; k < 260; k++) {
        const along = gauss() * s.sigma * 1.7, inland = Math.abs(gauss()) * s.sigma * 0.9 - 0.15 * s.sigma;
        raw.push([s.lng - inland / MPD.lng, s.lat + along / MPD.lat]);
      }
    }
  }
  return raw.map(([lng, lat]) => {
    let i1 = -1, w1 = 0, i2 = -1, w2 = 0;
    MIAMI_SOURCES.forEach((s, i) => {
      const w = bowl((lng - s.lng) * MPD.lng, (lat - s.lat) * MPD.lat, 1, s.sigma);
      if (w > w1) { i2 = i1; w2 = w1; i1 = i; w1 = w; } else if (w > w2) { i2 = i; w2 = w; }
    });
    return { lng, lat, i1, w1: w1 > 0.002 ? w1 : 0, i2, w2: w2 > 0.002 ? w2 : 0 };
  });
}

let PTS: Pt[] | null = null;
let FC: FeatureCollection<Point, PsProps> | null = null;

/** The scatterer cloud with each point's displacement at time t (years since Jan 2016). */
export function psCloud(t: number): FeatureCollection<Point, PsProps> {
  PTS ??= build();
  FC ??= { type: "FeatureCollection", features: PTS.map((p): Feature<Point, PsProps> => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: { v: 0 } })) };
  const c = MIAMI_SOURCES.map((s) => creep(t, s.v0, s.tau));
  for (let k = 0; k < PTS.length; k++) {
    const p = PTS[k]!;
    const d = (p.i1 >= 0 ? p.w1 * c[p.i1]! : 0) + (p.i2 >= 0 ? p.w2 * c[p.i2]! : 0);
    FC.features[k]!.properties.v = Math.round((d / SCALE) * 1000) / 1000;
  }
  return FC;
}



/* ------------------------------------------------------------------ 3D towers */

export interface TowerProps { v: number; h: number; b: number }
interface Tower { i1: number; w1: number; i2: number; w2: number }

/** Two strongest creep sources at a footprint centroid (same weights as the scatterer cloud). */
function weightsAt(lng: number, lat: number): Tower {
  let i1 = -1, w1 = 0, i2 = -1, w2 = 0;
  MIAMI_SOURCES.forEach((s, i) => {
    const w = bowl((lng - s.lng) * MPD.lng, (lat - s.lat) * MPD.lat, 1, s.sigma);
    if (w > w1) { i2 = i1; w2 = w1; i1 = i; w1 = w; } else if (w > w2) { i2 = i; w2 = w; }
  });
  return { i1, w1: w1 > 0.002 ? w1 : 0, i2, w2: w2 > 0.002 ? w2 : 0 };
}

/**
 * Builds the tower layer from OpenStreetMap building footprints (as delivered in the basemap tiles).
 * Footprints repeat across tile edges, so they are de-duplicated by centroid and height.
 */
export class Towers {
  private readonly fc: FeatureCollection<Polygon | MultiPolygon, TowerProps> = { type: "FeatureCollection", features: [] };
  private readonly meta: Tower[] = [];
  private readonly seen = new Set<string>();

  /** Adds footprints; returns true if any were new. */
  add(features: ReadonlyArray<{ geometry: Polygon | MultiPolygon; properties: Record<string, unknown> }>): boolean {
    let added = false;
    for (const f of features) {
      const ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates[0]?.[0];
      if (!ring || ring.length < 3) continue;
      let x = 0, y = 0;
      for (const [lng, lat] of ring) { x += lng!; y += lat!; }
      x /= ring.length; y /= ring.length;
      const h = Number(f.properties["render_height"] ?? 6), b = Number(f.properties["render_min_height"] ?? 0);
      const key = `${x.toFixed(5)},${y.toFixed(5)},${h},${ring.length},${ring[0]?.[0]?.toFixed(5)}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.meta.push(weightsAt(x, y));
      this.fc.features.push({ type: "Feature", geometry: f.geometry, properties: { v: 0, h, b } });
      added = true;
    }
    return added;
  }

  /** Every tower's displacement at time t (years since Jan 2016), as a fraction of the colour scale. */
  at(t: number): FeatureCollection<Polygon | MultiPolygon, TowerProps> {
    const c = MIAMI_SOURCES.map((s) => creep(t, s.v0, s.tau));
    this.meta.forEach((m, k) => {
      const d = (m.i1 >= 0 ? m.w1 * c[m.i1]! : 0) + (m.i2 >= 0 ? m.w2 * c[m.i2]! : 0);
      this.fc.features[k]!.properties.v = Math.round((d / SCALE) * 1000) / 1000;
    });
    return this.fc;
  }

  get size(): number { return this.fc.features.length; }
}
