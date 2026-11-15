"use client";
import { memo, useEffect, useRef } from "react";
import type { Hotspot } from "@/lib/content";
import { renderField } from "@/lib/render";
import { SCENES } from "@/lib/scenes";

/** Degrees shown in each place's thumbnail (lat span; lng span is scaled by latitude). */
const SPAN: Readonly<Record<string, number>> = { "miami-coast": 0.006, surfside: 0.006, "miami-beach-west": 0.012, everglades: 0.5, iceland: 0.2, thwaites: 0.9 };
const PX = 64;

/** A real rendered crop of the place's own physics field, so each thumbnail is distinctive. */
export const Thumb = memo(function Thumb({ place }: { place: Hotspot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    if (!place.scene || !place.probe) { drawForest(cv); return; }
    const span = SPAN[place.id] ?? 0.05;
    const [lat0, lng0] = place.id === "surfside" ? [place.center[0] - 0.0012, place.center[1]] : place.probe.at;
    const lngSpan = span / Math.cos((lat0 * Math.PI) / 180);
    const lats = Float64Array.from({ length: PX }, (_, j) => lat0 + span / 2 - (span * (j + 0.5)) / PX);
    const lngs = Float64Array.from({ length: PX }, (_, i) => lng0 - lngSpan / 2 + (lngSpan * (i + 0.5)) / PX);
    const sc = SCENES[place.scene];
    const { pixels } = renderField({ id: 0, width: PX, height: PX, lngs, lats, landMask: null, band: "nisar-l", display: sc.display, sceneT: { [sc.id]: place.t ?? sc.t.max }, scenes: [sc.id] });
    const g = cv.getContext("2d");
    if (g) g.putImageData(new ImageData(new Uint8ClampedArray(pixels), PX, PX), 0, 0);
  }, [place]);
  return (
    // fringe thumbnails roll their colours (a hue rotation approximates a phase shift of the cyclic map)
    <span className={`thumb${place.scene && SCENES[place.scene].display === "fringes" ? " cycle" : ""}`} aria-hidden="true">
      <canvas ref={ref} width={PX} height={PX} />
    </span>
  );
});

/** Live-only places: an illustration in the NISAR GCOV palette (green = forest, dark = cleared),
 *  with the "fishbone" road-and-clearing pattern typical of Rondônia. Deterministic, no network. */
function drawForest(cv: HTMLCanvasElement): void {
  const g = cv.getContext("2d");
  if (!g) return;
  const img = g.createImageData(PX, PX);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // A main road with side roads of uneven length; clearings widen next to the road, as settlers clear lots.
  const road = (x: number) => 26 + 0.3 * x;
  const spurs: ReadonlyArray<readonly [number, number]> = [[7, 13], [18, -9], [27, 17], [39, -14], [48, 10], [58, -12]];
  const cleared = (x: number, y: number) => {
    const d = y - road(x);
    if (Math.abs(d) < 1.8) return true;
    return spurs.some(([x0, len]) => {
      const along = (y - road(x0)) * Math.sign(len);
      if (along < 0 || along > Math.abs(len)) return false;
      return Math.abs(x - x0) < (along < Math.abs(len) * 0.6 ? 3.2 : 1.1);
    });
  };
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    const n = rnd();
    const k = (y * PX + x) * 4;
    if (cleared(x, y)) { img.data[k] = 34 + n * 30; img.data[k + 1] = 30 + n * 26; img.data[k + 2] = 40 + n * 30; }
    else { img.data[k] = 40 + n * 50; img.data[k + 1] = 110 + n * 80; img.data[k + 2] = 45 + n * 40; }
    img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
