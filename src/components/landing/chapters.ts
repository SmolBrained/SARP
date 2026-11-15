import { HOTSPOT_BY_ID } from "@/lib/content";

/** Camera for each scroll chapter of the landing page: [lng, lat], zoom (512-px tiles), pitch, bearing. */
/** side: where the text card sits, so the globe's subject is centred in the free area beside it */
export type Side = "left" | "right" | "center";
export interface Cam { readonly side: Side; readonly center: readonly [number, number]; readonly zoom: number; readonly pitch: number; readonly bearing: number }

const at = (id: string, side: Side, dz = 0, pitch = 0, bearing = 0): Cam => {
  const h = HOTSPOT_BY_ID[id]!;
  return { side, center: [h.center[1], h.center[0]], zoom: h.zoom - 1 + dz, pitch, bearing };
};

export const CHAPTER_IDS = ["top", "why", "math", "miami", "everglades", "iceland", "world", "hear", "act", "data", "guide", "honest"] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

export const CAMERAS: Readonly<Record<ChapterId, Cam>> = {
  top: { side: "left", center: [-60, 15], zoom: 1.9, pitch: 0, bearing: 0 },
  why: { side: "left", center: [-80, 26], zoom: 3.1, pitch: 0, bearing: 0 },
  math: { side: "center", center: [-80.2, 25.8], zoom: 7.2, pitch: 0, bearing: 0 },
  miami: at("miami-coast", "left", -2.2, 58, -24),
  everglades: at("everglades", "right", -0.4, 0, 0),
  iceland: at("iceland", "left", -0.4, 52, -16),
  world: { side: "right", center: [-75, -20], zoom: 1.9, pitch: 0, bearing: 0 },
  hear: at("iceland", "right", -1.2, 30, 40),
  act: at("miami-coast", "center", -2.6, 40, 20),
  data: { side: "center", center: [-100, 30], zoom: 1.7, pitch: 0, bearing: 0 },
  guide: { side: "center", center: [-50, 25], zoom: 1.5, pitch: 0, bearing: 0 },
  honest: { side: "left", center: [-80.12, 25.9], zoom: 9.2, pitch: 40, bearing: 20 },
};

/** Where "Open in the viewer" lands for a place. */
export function viewerHref(base: string, id: string): string {
  const h = HOTSPOT_BY_ID[id]!;
  return `${base}/explore/#v=${h.group}&p=${id}`;
}
