import { describe, expect, it } from "vitest";
import { BANDS, BAND_IDS, LOS, coherence, losFromPhase, losVector, mogi, mogiVolumeForUplift, phaseFromLOS, phaseSigma, tidalFlexure, wrap, creepRate } from "@/lib/physics";
import { MIAMI_SOURCES, SCENES, miamiRate, sample } from "@/lib/scenes";

describe("radar bands", () => {
  it("wavelength follows λ = c / f", () => {
    expect(BANDS["nisar-l"].lambda).toBeCloseTo(0.2385, 3);
    expect(BANDS["nisar-s"].lambda).toBeCloseTo(0.0937, 3);
    expect(BANDS["sentinel-c"].lambda).toBeCloseTo(0.0555, 3);
  });
  it.each(BAND_IDS)("one 2π fringe equals λ/2 of LOS motion (%s)", (id) => {
    const b = BANDS[id];
    expect(losFromPhase(2 * Math.PI, b.lambda)).toBeCloseTo(b.fringe, 12);
    expect(phaseFromLOS(b.fringe, b.lambda)).toBeCloseTo(2 * Math.PI, 9);
  });
  it("NISAR L-band fringe is 11.9 cm", () => expect(BANDS["nisar-l"].fringe * 100).toBeCloseTo(11.9, 1));
  it("wetland double bounce: one L-band fringe ≈ 15 cm of water level (Wdowinski/FIU)", () => {
    expect((BANDS["nisar-l"].fringe / LOS[2]) * 100).toBeGreaterThan(14.4);
    expect((BANDS["nisar-l"].fringe / LOS[2]) * 100).toBeLessThan(15.5);
  });
});

describe("geometry and models", () => {
  it("wrap() maps to [0, 2π) preserving the angle", () => {
    for (const x of [-7, -0.1, 0, 3, 6.3, 100]) {
      const w = wrap(x);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(2 * Math.PI);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(x), 9);
    }
  });
  it("LOS vector is a unit vector", () => expect(Math.hypot(...losVector(37, -12))).toBeCloseTo(1, 12));
  it("Mogi peak uplift and decay with distance", () => {
    const dV = mogiVolumeForUplift(0.02, 4000);
    expect(mogi(0, 0, 4000, dV)[2]).toBeCloseTo(0.02, 12);
    expect(mogi(4000, 0, 4000, dV)[2] / 0.02).toBeCloseTo(2 ** -1.5, 9);
  });
  it("tidal flexure is zero landward and full amplitude far seaward", () => {
    expect(tidalFlexure(-100, 1, 3500)).toBe(0);
    expect(tidalFlexure(1e6, 1, 3500)).toBeCloseTo(1, 6);
  });
  it("coherence ordering over wetland: L > S > C; noise grows as coherence drops", () => {
    expect(coherence("wetland", BANDS["nisar-l"])).toBeGreaterThan(coherence("wetland", BANDS["nisar-s"]));
    expect(coherence("wetland", BANDS["nisar-s"])).toBeGreaterThan(coherence("wetland", BANDS["sentinel-c"]));
    expect(phaseSigma(0.3)).toBeGreaterThan(phaseSigma(0.9));
  });
});

describe("scenes are calibrated to the cited studies", () => {
  const u: [number, number, number] = [0, 0, 0];
  it("Svartsengi: ~20 mm/month uplift at the source (IMO 2026)", () => {
    expect(Math.round(SCENES.iceland.evaluate(63.875, -22.445, 1, u))).toBe(1);
    expect(u[2]).toBeCloseTo(0.02, 6);
  });
  it("Miami high-rises: 2–8 cm cumulative 2016–2023 and slowing (Aziz Zanjani et al. 2024)", () => {
    for (const s of MIAMI_SOURCES.filter((x) => x.tau)) {
      SCENES.miami.evaluate(s.lat, s.lng, 7.5, u);
      expect(-u[2] * 100).toBeGreaterThanOrEqual(2);
      expect(-u[2] * 100).toBeLessThanOrEqual(8.5);
      expect(Math.abs(creepRate(7, s.v0, s.tau))).toBeLessThan(Math.abs(s.v0));
    }
  });
  it("Miami Beach reclaimed wetlands: 1–3 mm/yr (Fiaschi & Wdowinski 2020)", () => {
    for (const s of MIAMI_SOURCES.filter((x) => !x.tau)) {
      expect(-s.v0 * 1000).toBeGreaterThanOrEqual(1);
      expect(-s.v0 * 1000).toBeLessThanOrEqual(3);
    }
  });
  it("Champlain Towers South site shows no pre-collapse signal (Aziz Zanjani et al. 2024)", () => {
    const has = SCENES.miami.evaluate(25.8814, -80.1219, 5.45, u);
    expect(!has || Math.abs(u[2]) < 0.001).toBe(true);
    expect(Math.abs(miamiRate(25.8814, -80.1219, 5.45))).toBeLessThan(1e-4);
  });
  it("Everglades: no signal outside the wetland, wet-season rise inside", () => {
    expect(SCENES.everglades.evaluate(25.77, -80.19, 120, u)).toBe(0);
    expect(SCENES.everglades.evaluate(25.65, -80.7, 150, u)).toBeGreaterThan(0.9);
    expect(u[2]).toBeGreaterThan(0.2);
  });
  it("sample() projects onto LOS and reports coherence", () => {
    const s = sample(SCENES.iceland, 63.875, -22.445, 1, BANDS["nisar-l"]);
    expect(s).not.toBeNull();
    expect(s!.dLOS).toBeGreaterThan(0.015);
    expect(s!.coherence).toBeCloseTo(0.85, 6);
  });
});

describe("separable renderer terms", () => {
  it("Σ coef(t)·basis(x) reproduces the reference model everywhere it has data", async () => {
    const { SCENES, SCENE_IDS } = await import("@/lib/scenes");
    const { LOS, project } = await import("@/lib/physics");
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const id of SCENE_IDS) {
      const sc = SCENES[id];
      if (!sc.raster) continue;
      const [S, W, N, E] = sc.bbox;
      let checked = 0;
      for (let i = 0; i < 4000 && checked < 300; i++) {
        const lat = S + (N - S) * rnd(), lng = W + (E - W) * rnd(), t = sc.t.min + (sc.t.max - sc.t.min) * rnd();
        const u: [number, number, number] = [0, 0, 0];
        const cover = sc.evaluate(lat, lng, t, u);
        expect(sc.raster.cover(lat, lng)).toBeCloseTo(cover, 9);
        if (cover <= 0) continue;
        const sum = sc.raster.terms.reduce((a, k) => a + k.coef(t) * k.los(lat, lng), 0);
        expect(sum).toBeCloseTo(project(u, LOS), 9);
        checked++;
      }
      expect(checked).toBeGreaterThan(100);
    }
  });
});

describe("intro ground track", () => {
  it("is a polar, retrograde sun-synchronous pass that reaches ±81.6° latitude", async () => {
    const { nisarTrack } = await import("@/lib/orbit");
    const t = nisarTrack(-80);
    const lats = t.coords.map((c) => c[1]);
    expect(Math.max(...lats)).toBeCloseTo(81.6, 0);
    expect(Math.min(...lats)).toBeCloseTo(-81.6, 0);
    const eq = t.coords[Math.floor(t.coords.length / 2)]!;
    expect(eq[1]).toBeCloseTo(0, 5);
    expect(eq[0]).toBeCloseTo(-80, 5);
    // retrograde: heading north, longitude decreases (moves west) across the equator
    expect(t.coords[120]![0]).toBeLessThan(t.coords[100]![0]);
    expect(t.progress[0]).toBe(0);
    expect(t.progress[t.progress.length - 1]).toBe(1);
  });
});
