/**
 * The radar data on the home-page globe: the same layers the viewer draws, so the landmark places are not just a map.
 *   Miami: persistent-scatterer dots (red = sinking) and extruded towers coloured by how fast they sink.
 *   Everglades and Iceland: the interferogram, painted once and draped on the map.
 * Everything is drawn from the shared physics (scenes.ts), so the pictures match the viewer exactly.
 */
import type * as ML from "maplibre-gl";
import { HOTSPOTS } from "@/lib/content";
import { paint, prepare } from "@/lib/fieldRaster";
import { Towers, psCloud } from "@/lib/psPoints";
import { SCENES, type SceneId } from "@/lib/scenes";

const FIELD_SCENES: readonly SceneId[] = ["everglades", "iceland"];
const BAND = "nisar-l" as const;

/** The time each place opens at in the viewer. */
function sceneTime(id: SceneId): number {
  const h = HOTSPOTS.find((x) => x.scene === id && x.t !== undefined);
  return h?.t ?? (SCENES[id].t.min + SCENES[id].t.max) / 2;
}

export interface Radar {
  /** Finds any building footprints now on screen and extrudes them; resolves once the map has drawn them. */
  settle(): Promise<void>;
  dispose(): void;
}

export function addRadar(m: ML.Map): Radar {
  const tMiami = sceneTime("miami");
  const before = m.getLayer("track-swath") ? "track-swath" : undefined;
  let dead = false;

  // 1. Miami scatterers
  m.addSource("ps", { type: "geojson", data: psCloud(tMiami), maxzoom: 16, buffer: 8 });
  m.addLayer({
    id: "ps", type: "circle", source: "ps", minzoom: 9.5,
    paint: {
      "circle-radius": ["interpolate", ["exponential", 1.6], ["zoom"], 9.5, 0.9, 11, 1.6, 13, 3.2, 15, 5, 17, 7.5],
      "circle-color": ["interpolate", ["linear"], ["get", "v"], -1, "#ff2d55", -0.55, "#ff6a3d", -0.25, "#ffb547", -0.08, "#f0dd95", -0.02, "#c7cfe6", 0.02, "#c7cfe6", 0.3, "#5aa2ff", 1, "#4f7cff"],
      "circle-opacity": ["interpolate", ["linear"], ["abs", ["get", "v"]], 0, 0.5, 0.1, 0.92, 1, 1],
      "circle-blur": 0.35,
      "circle-stroke-width": 0,
    },
  }, before);

  // 2. Miami towers
  const towers = new Towers();
  m.addSource("towers", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  m.addLayer({
    id: "towers", type: "fill-extrusion", source: "towers", minzoom: 12.5,
    paint: {
      "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["get", "b"],
      "fill-extrusion-color": ["interpolate", ["linear"], ["get", "v"], -1, "#ff2d55", -0.6, "#ff5a4d", -0.3, "#ff9a3d", -0.12, "#c98a6a", -0.04, "#3b4670", 0, "#2a3556"],
      "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 13.5, 0.92],
      "fill-extrusion-vertical-gradient": true,
    },
  }, before);
  const [S, W, N, E] = SCENES.miami.bbox;
  const collect = (): boolean => {
    if (dead || m.getZoom() < 12.5 || !m.getSource("openmaptiles")) return false;
    const feats = m.querySourceFeatures("openmaptiles", { sourceLayer: "building" }).filter((f) => {
      const g = f.geometry;
      if (g.type !== "Polygon" && g.type !== "MultiPolygon") return false;
      const p0 = g.type === "Polygon" ? g.coordinates[0]?.[0] : g.coordinates[0]?.[0]?.[0];
      return !!p0 && p0[1]! >= S && p0[1]! <= N && p0[0]! >= W && p0[0]! <= E;
    });
    if (!towers.add(feats as unknown as Parameters<Towers["add"]>[0])) return false;
    (m.getSource("towers") as ML.GeoJSONSource | undefined)?.setData(towers.at(tMiami));
    return true;
  };
  m.on("idle", collect);
  // the plain building layer would fight the towers for the same footprints: step aside over Miami
  const swap = (): void => {
    const c = m.getCenter(), over = c.lat >= S && c.lat <= N && c.lng >= W && c.lng <= E && m.getZoom() >= 11;
    if (m.getLayer("building")) m.setLayoutProperty("building", "visibility", over ? "none" : "visible");
  };
  m.on("move", swap); swap();

  // 3. Everglades and Iceland interferograms: painted off the main loop so the page stays responsive
  const timers: number[] = [];
  FIELD_SCENES.forEach((id, i) => {
    timers.push(window.setTimeout(() => {
      if (dead) return;
      try {
        const p = prepare(id);
        const out = new Uint8ClampedArray(p.width * p.height * 4);
        paint(p, sceneTime(id), BAND, SCENES[id].display, out);
        const canvas = document.createElement("canvas");
        canvas.width = p.width; canvas.height = p.height;
        canvas.getContext("2d")?.putImageData(new ImageData(out, p.width, p.height), 0, 0);
        const [w, n, e, s] = p.extent;
        const sid = `field-${id}`;
        m.addSource(sid, { type: "canvas", canvas, animate: false, coordinates: [[w, n], [e, n], [e, s], [w, s]] });
        m.addLayer({ id: sid, type: "raster", source: sid, paint: { "raster-fade-duration": 0, "raster-resampling": "linear", "raster-opacity": 0.92 } }, "ps");
        fields.add(id);
      } catch { /* the picture is a bonus: the map stands without it */ }
    }, 30 + i * 60));
  });
  const fields = new Set<SceneId>();

  return {
    async settle() {
      // wait for the interferograms to be added, then for the towers
      for (let k = 0; k < 200 && fields.size < FIELD_SCENES.length; k++) await new Promise((r) => setTimeout(r, 50));
      if (collect() || !m.isStyleLoaded()) await new Promise<void>((r) => m.once("idle", () => r()));
    },
    dispose() { dead = true; timers.forEach((t) => clearTimeout(t)); m.off("idle", collect); m.off("move", swap); },
  };
}
