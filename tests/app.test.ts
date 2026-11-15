import { describe, expect, it } from "vitest";
import { VIEW_PLACES, initialState, reducer } from "@/lib/appState";
import { CHAPTERS } from "@/lib/tour";
import { parseHash, toHash } from "@/lib/urlState";
import { renderField } from "@/lib/render";
import { formatLength, formatSigned } from "@/lib/format";
import { frequencyFor } from "@/lib/sonifier";
import { HOTSPOTS, REFS } from "@/lib/content";
import { SCENES } from "@/lib/scenes";
import { metricsFor } from "@/lib/metrics";
import { BANDS } from "@/lib/physics";

describe("state machine", () => {
  it("lands on Miami's coastal high-rises with details open", () => {
    const s = initialState();
    expect(s.view).toBe("miami");
    expect(s.place).toBe("miami-coast");
    expect(s.tour).toBeNull();
    expect(s.display).toBe("displacement");
  });
  it("a view selects its first place; the photo/radar split is opt-in and ends when you leave", () => {
    let s = reducer(initialState(), { type: "setView", view: "everglades" });
    expect(s.place).toBe(VIEW_PLACES.everglades[0]);
    expect(s.compare).toBe(false);
    s = reducer(s, { type: "setCompare", on: true });
    expect(s.compare).toBe(true);
    s = reducer(s, { type: "setView", view: "world" });
    expect(s.place).toBe(VIEW_PLACES.world[0]);
    expect(s.compare).toBe(false);
  });
  it("selecting a place from another view switches the view and flies", () => {
    const s0 = initialState();
    const s = reducer(s0, { type: "selectPlace", id: "iceland" });
    expect(s.view).toBe("world");
    expect(s.flyToken).toBe(s0.flyToken + 1);
    expect(s.display).toBe("fringes");
  });
  it("play sweeps once and stops at the end", () => {
    let s = reducer(initialState(), { type: "selectPlace", id: "iceland" });
    s = reducer(s, { type: "setTime", t: 0 });
    s = reducer(s, { type: "setPlaying", playing: true });
    for (let i = 0; i < 200; i++) s = reducer(s, { type: "advance", dtSeconds: 0.05 });
    expect(s.playing).toBe(false);
    expect(s.sceneT.iceland).toBe(SCENES.iceland.t.max);
    s = reducer(s, { type: "setPlaying", playing: true });
    expect(s.sceneT.iceland).toBe(SCENES.iceland.t.min);
  });
  it("time is clamped and arrow steps move by 1/40 of the range", () => {
    let s = reducer(initialState(), { type: "selectPlace", id: "iceland" });
    s = reducer(s, { type: "setTime", t: 999 });
    expect(s.sceneT.iceland).toBe(SCENES.iceland.t.max);
    s = reducer(s, { type: "step", dir: -1 });
    expect(s.sceneT.iceland).toBeCloseTo(SCENES.iceland.t.max - 16 / 40);
  });
  it("opening a modal pauses playback", () => {
    let s = reducer(initialState(), { type: "setPlaying", playing: true });
    s = reducer(s, { type: "setModal", modal: "about" });
    expect(s.playing).toBe(false);
    expect(s.modal).toBe("about");
  });
  it("divider stays inside the map", () => {
    expect(reducer(initialState(), { type: "setDivider", x: 2 }).divider).toBe(0.95);
    expect(reducer(initialState(), { type: "setDivider", x: -1 }).divider).toBe(0.05);
  });
  it("the tour walks the chapters in order and can be exited at any time", () => {
    let s = reducer({ ...initialState(), intro: true }, { type: "startTour" });
    expect(s.intro).toBe(false);
    expect(s.tour).toBe(0);
    expect(s.place).toBe(CHAPTERS[0]!.place);
    for (let i = 1; i < CHAPTERS.length; i++) {
      s = reducer(s, { type: "tourGo", index: i });
      expect(s.place).toBe(CHAPTERS[i]!.place);
    }
    expect(reducer(s, { type: "tourGo", index: CHAPTERS.length }).tour).toBeNull();
    expect(reducer(s, { type: "endTour" }).tour).toBeNull();
  });
  it("every tour chapter points at a real place", () => {
    for (const c of CHAPTERS) expect(HOTSPOTS.some((h) => h.id === c.place)).toBe(true);
  });
  it("2× speed sweeps twice as fast", () => {
    let a = reducer(initialState(), { type: "setTime", t: 0 });
    a = reducer(a, { type: "setPlaying", playing: true });
    const b = reducer(a, { type: "setSpeed", speed: 2 });
    const a1 = reducer(a, { type: "advance", dtSeconds: 1 }), b1 = reducer(b, { type: "advance", dtSeconds: 1 });
    expect(b1.sceneT.miami).toBeCloseTo(2 * a1.sceneT.miami);
  });
});

describe("URL state", () => {
  it("round-trips and rejects junk", () => {
    const h = toHash({ view: "world", place: "iceland", band: "nisar-s", display: "fringes" });
    expect(parseHash(h)).toEqual({ view: "world", place: "iceland", band: "nisar-s", display: "fringes" });
    expect(parseHash("#v=evil&p=<script>&b=x&d=y")).toEqual({});
  });
});

describe("renderer", () => {
  it("draws the Iceland bull's-eye and leaves areas outside scenes transparent", () => {
    const W = 60, H = 40;
    const lngs = Float64Array.from({ length: W }, (_, i) => -22.6 + (0.3 * i) / W);
    const lats = Float64Array.from({ length: H }, (_, j) => 63.95 - (0.15 * j) / H);
    const r = renderField({ id: 1, width: W, height: H, lngs, lats, landMask: null, band: "nisar-l", display: "fringes", sceneT: { iceland: 12 }, scenes: ["iceland"] });
    expect(r.pixels.length).toBe(W * H * 4);
    let opaque = 0;
    for (let i = 3; i < r.pixels.length; i += 4) if (r.pixels[i]! > 0) opaque++;
    expect(opaque).toBe(W * H);
    const empty = renderField({ id: 2, width: W, height: H, lngs, lats, landMask: null, band: "nisar-l", display: "fringes", sceneT: {}, scenes: [] });
    expect(empty.pixels.every((v) => v === 0)).toBe(true);
  });
  it("respects the land mask", () => {
    const lngs = Float64Array.from([-22.45, -22.44]), lats = Float64Array.from([63.88, 63.87]);
    const r = renderField({ id: 3, width: 2, height: 2, lngs, lats, landMask: new Uint8Array([0, 0, 0, 0]), band: "nisar-l", display: "fringes", sceneT: { iceland: 5 }, scenes: ["iceland"] });
    expect(r.pixels.every((v) => v === 0)).toBe(true);
  });
});

describe("metrics agree with the model", () => {
  it("Champlain site reports zero motion and zero rate", () => {
    const h = HOTSPOTS.find((x) => x.id === "surfside")!;
    const m = metricsFor(h, SCENES.miami, BANDS["nisar-l"], 5.45);
    expect(m[0]!.value).toBe("+0.0 mm");
    expect(m[1]!.value).toBe("0.0 mm/yr");
  });
});

describe("formatting, audio, content integrity", () => {
  it("formats lengths with sensible units and true minus signs", () => {
    expect(formatLength(0.0123)).toBe("12.3 mm");
    expect(formatLength(0.25)).toBe("25.0 cm");
    expect(formatSigned(-0.004)).toBe("−4.0 mm");
    expect(formatSigned(0.004)).toBe("+4.0 mm");
  });
  it("sonification spans 55 Hz to 440 Hz around 110 Hz", () => {
    expect(frequencyFor(-1)).toBeCloseTo(55);
    expect(frequencyFor(0)).toBeCloseTo(110);
    expect(frequencyFor(1)).toBeCloseTo(440);
    expect(frequencyFor(5)).toBeCloseTo(440);
  });
  it("every hotspot cites existing references over https", () => {
    for (const h of HOTSPOTS) for (const r of h.refs) expect(REFS[r].url).toMatch(/^https:\/\//);
  });
});
