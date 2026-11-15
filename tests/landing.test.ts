import { describe, expect, it } from "vitest";
import { CAMERAS, CHAPTER_IDS, viewerHref } from "@/components/landing/chapters";
import { HOTSPOTS } from "@/lib/content";
import { placeTiles, tileFor, worldTiles } from "@/lib/prefetch";

describe("landing page", () => {
  it("has a camera for every chapter, on the globe or a real place", () => {
    for (const id of CHAPTER_IDS) {
      const c = CAMERAS[id];
      expect(c, id).toBeDefined();
      expect(Math.abs(c.center[1])).toBeLessThanOrEqual(90);
      expect(Math.abs(c.center[0])).toBeLessThanOrEqual(180);
      expect(c.zoom).toBeGreaterThan(0);
    }
  });
  it("links every place to the viewer with a parseable deep link", () => {
    for (const h of HOTSPOTS) expect(viewerHref("/SARP", h.id)).toBe(`/SARP/explore/#v=${h.group}&p=${h.id}`);
  });
});

describe("tile prefetch maths", () => {
  it("finds the standard tile for a known point", () => {
    expect(tileFor(0, 0, 1)).toEqual({ z: 1, x: 1, y: 1 });
    const m = tileFor(25.76, -80.19, 10); // Miami
    expect(m).toEqual({ z: 10, x: 283, y: 436 });
  });
  it("clamps polar latitudes and wraps longitude", () => {
    expect(tileFor(89.99, 0, 3).y).toBe(0);
    expect(tileFor(0, 190, 2).x).toBeGreaterThanOrEqual(0);
  });
  it("lists the whole globe at low zoom and a block around a place", () => {
    expect(worldTiles(2)).toHaveLength(1 + 4 + 16);
    expect(placeTiles(25.76, -80.19, 5, 5)).toHaveLength(9);
    expect(placeTiles(25.76, -80.19, 12, 12)).toHaveLength(1);
  });
});

import { TIERS, tierFor } from "@/lib/triad";
describe("triage tiers", () => {
  it("classifies by speed, sign ignored", () => {
    expect(tierFor(0.4).id).toBe("t1");
    expect(tierFor(-1.7).id).toBe("t2");
    expect(tierFor(2.5).id).toBe("t3");
    expect(TIERS).toHaveLength(3);
  });
});

import { DATASETS, asfUrl } from "@/lib/asf";
describe("ASF catalogue", () => {
  it("lists all 17 datasets and builds a NISAR deep link", () => {
    expect(DATASETS).toHaveLength(17);
    expect(DATASETS.filter((d) => !d.searchable)).toHaveLength(4);
    expect(asfUrl(25.76, -80.19, 9)).toBe("https://search.asf.alaska.edu/#/?dataset=NISAR&zoom=9&center=-80.190,25.760");
  });
});

describe("prefetch covers the home-page scroll", () => {
  it("has a tile block for every zoomed-in chapter camera", () => {
    for (const id of CHAPTER_IDS) {
      const c = CAMERAS[id];
      if (c.zoom < 3.5) continue;
      expect(placeTiles(c.center[1], c.center[0], 4, Math.min(13, Math.round(c.zoom))).length).toBeGreaterThan(0);
    }
  });
});
