import { describe, expect, it } from "vitest";
import { initialState, reducer, type Action } from "@/lib/appState";
import { createStore } from "@/lib/store";
import { parseHash } from "@/lib/urlState";
import { formatSigned, signed } from "@/lib/format";
import { LOOKS, LOS, bowl, cyclic, diverging, losVector, mogi, tidalFlexure } from "@/lib/physics";
import { SCENES } from "@/lib/scenes";
import { prepare } from "@/lib/fieldRaster";
import type { SceneId } from "@/lib/scenes";

describe("signed(): the minus sign is never lost", () => {
  it("keeps the sign on sub-unit values", () => {
    expect(signed("-0.5 mm")).toBe("−0.5 mm");
    expect(signed("-2.5 mm")).toBe("−2.5 mm");
    expect(signed("3.2 cm")).toBe("+3.2 cm");
  });
  it("drops the sign on a true zero only", () => {
    expect(signed("-0.0 mm")).toBe("0.0 mm");
    expect(signed("-0 mm")).toBe("0 mm");
    expect(formatSigned(-0.0004)).toBe("−0.4 mm");
  });
});

describe("line-of-sight geometry (right-looking, ascending)", () => {
  it("the ground→satellite vector points west of north-heading track and up", () => {
    const [e, n, u] = LOS;
    expect(e).toBeCloseTo(-0.5887, 3);
    expect(n).toBeCloseTo(-0.1251, 3);
    expect(u).toBeCloseTo(Math.cos((37 * Math.PI) / 180), 6);
    expect(Math.hypot(e, n, u)).toBeCloseTo(1, 12);
  });
  it("a due-north pass looks east, so the satellite lies to the WEST of the target", () => {
    expect(losVector(30, 0)[0]).toBeLessThan(0);
  });
});

describe("pure-math guards", () => {
  it("colour maps survive NaN and infinity", () => {
    expect(cyclic(NaN)).toEqual([128, 128, 128]);
    expect(cyclic(Infinity)).toEqual([128, 128, 128]);
    expect(diverging(NaN)).toEqual([247, 247, 247]);
  });
  it("degenerate sources return zero instead of NaN", () => {
    expect(mogi(0, 0, 0, 1)).toEqual([0, 0, 0]);
    expect(tidalFlexure(100, 1, 0)).toBe(0);
    expect(bowl(1, 1, 1, 0)).toBe(0);
  });
  it("one multilook constant is shared by every renderer", () => { expect(LOOKS).toBe(32); });
});

describe("reducer hardening", () => {
  const base = initialState();
  it("selecting a place yourself ends the guided tour", () => {
    const s = reducer(reducer(base, { type: "startTour" }), { type: "selectPlace", id: "iceland" });
    expect(s.tour).toBeNull();
  });
  it("tourGo still arms the tour after its inner selectPlace", () => {
    expect(reducer(base, { type: "tourGo", index: 2 }).tour).toBe(2);
  });
  it("a zero-length tick keeps playing; a bad clock stops", () => {
    let s = reducer(reducer(base, { type: "selectPlace", id: "iceland" }), { type: "setPlaying", playing: true });
    expect(reducer(s, { type: "advance", dtSeconds: 0 }).playing).toBe(true);
    expect(reducer(s, { type: "advance", dtSeconds: NaN }).playing).toBe(false);
    expect(reducer(s, { type: "advance", dtSeconds: -1 }).playing).toBe(false);
    s = reducer(s, { type: "setTime", t: NaN });
    expect(Number.isFinite(s.sceneT.iceland)).toBe(true);
  });
  it("NaN divider is ignored and unknown actions are no-ops", () => {
    expect(reducer(base, { type: "setDivider", x: NaN }).divider).toBe(0.5);
    expect(reducer(base, { type: "nope" } as unknown as Action)).toBe(base);
  });
});

describe("store", () => {
  it("does not re-notify for NaN, and one throwing listener cannot starve the rest", () => {
    const st = createStore<number>(NaN);
    let calls = 0;
    st.subscribe(() => { throw new Error("boom"); });
    st.subscribe(() => { calls++; });
    st.set(NaN); expect(calls).toBe(0);
    const err = console.error; console.error = () => undefined;
    st.set(1); console.error = err;
    expect(calls).toBe(1);
  });
});

describe("URL state", () => {
  it("accepts both #v=… and #/v=…", () => {
    expect(parseHash("#/v=world").view).toBe("world");
    expect(parseHash("#v=everglades&b=nisar-s").band).toBe("nisar-s");
    expect(parseHash("#p=nope&v=bogus")).toEqual({});
  });
});

describe("Everglades tidal fringe is alive", () => {
  it("contributes near the slough outlet and decays inland", () => {
    const ev = SCENES.everglades;
    const out: [number, number, number] = [0, 0, 0];
    // same place, two tidal phases (sin(0.83 t) = ±1): the difference is the tidal term alone
    const tPeak = Math.PI / 2 / 0.83, tTrough = (3 * Math.PI) / 2 / 0.83;
    const dNear = Math.abs((ev.evaluate(25.4, -81.0, tPeak, out), out[2]) - (ev.evaluate(25.4, -81.0, tTrough, out), out[2]));
    expect(dNear).toBeGreaterThan(0.002);
  });
});

describe("rasters", () => {
  it("prepare() names the problem for unknown scenes", () => {
    expect(() => prepare("nowhere" as SceneId)).toThrow(/nowhere has no raster spec/);
    expect(() => prepare("miami")).toThrow(/miami has no raster spec/);
  });
});
