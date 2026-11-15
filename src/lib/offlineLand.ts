import type { Map as MLMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { PALETTE } from "./mapStyle";

/** Network down: draw the bundled Natural Earth land so the globe is never blank. */
export async function addOfflineLand(m: MLMap): Promise<void> {
  if (m.getSource("offline-land")) return;
  const land = (await import("@/data/offline-basemap.json")).default as unknown as FeatureCollection;
  m.addSource("offline-land", { type: "geojson", data: land });
  m.addLayer({ id: "offline-water", type: "background", paint: { "background-color": PALETTE.water } }, "relief");
  m.addLayer({ id: "offline-land", type: "fill", source: "offline-land", paint: { "fill-color": PALETTE.land, "fill-outline-color": PALETTE.line } }, "relief");
}

/** Watch a map's basemap sources; after a few failures with nothing ever loaded, fall back to the bundled land. */
export function offlineFallback(m: MLMap, onOffline?: () => void): void {
  let ok = false, errors = 0, done = false;
  m.on("data", (e) => { const d = e as unknown as { sourceId?: string; tile?: unknown }; if (d.sourceId === "openmaptiles" && d.tile) ok = true; });
  m.on("error", (e) => {
    const src = (e as unknown as { sourceId?: string }).sourceId;
    if ((src === "openmaptiles" || src === "relief") && ++errors > 4 && !ok && !done) { done = true; onOffline?.(); void addOfflineLand(m); }
  });
}
