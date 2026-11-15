/** Application state machine (v3). A pure reducer: every UI transition is a tested function. */
import { HOTSPOTS, HOTSPOT_BY_ID, LIVE_LAYER_IDS, type Hotspot, type LiveLayerId } from "./content";
import type { BandId, LatLng } from "./physics";
import { SCENES, SCENE_IDS, type DisplayMode, type Scene, type SceneId } from "./scenes";
import { isView, type UrlState, type View } from "./urlState";
import { CHAPTERS } from "./tour";

/** A view filters the place list: Miami, Everglades, World. */
export const VIEW_PLACES: Readonly<Record<View, readonly string[]>> = {
  miami: HOTSPOTS.filter((h) => h.group === "miami").map((h) => h.id),
  everglades: HOTSPOTS.filter((h) => h.group === "everglades").map((h) => h.id),
  world: HOTSPOTS.filter((h) => h.group === "world").map((h) => h.id),
};
export const VIEW_LABEL: Readonly<Record<View, string>> = { miami: "Miami", everglades: "Everglades", world: "World" };

export type LiveStatus = "off" | "searching" | "ready" | "none";
export interface LiveState { readonly status: LiveStatus; readonly date: string | null }
export type Basemap = "map" | "satellite";
export type Sheet = "peek" | "half" | "full";
export type Modal = "about" | "share" | "data" | null;
export type Popover = "places" | "layers" | "read" | null;
export type Speed = 1 | 2 | 4;

export interface AppState {
  readonly view: View;
  readonly place: string;
  readonly band: BandId;
  readonly display: DisplayMode;
  readonly fieldOn: boolean;
  readonly sceneT: Readonly<Record<SceneId, number>>;
  readonly playing: boolean;
  readonly basemap: Basemap;
  readonly live: Readonly<Record<LiveLayerId, LiveState>>;
  readonly measuredAvailable: boolean;
  readonly measuredOn: boolean;
  readonly sound: boolean;
  readonly divider: number;
  /** optional photo-vs-radar split (Everglades) */
  readonly compare: boolean;
  readonly sheet: Sheet;
  readonly modal: Modal;
  readonly popover: Popover;
  /** chapter index while the guided tour runs, else null */
  readonly tour: number | null;
  /** cinematic first-visit intro on screen */
  readonly intro: boolean;
  readonly speed: Speed;
  /** pinned probe (tap on touch screens) */
  readonly probe: LatLng | null;
  /** bumps whenever the camera should move to the selected place */
  readonly flyToken: number;
}

export type Action =
  | { type: "setView"; view: View }
  | { type: "selectPlace"; id: string }
  | { type: "setPopover"; popover: Popover }
  | { type: "startTour" }
  | { type: "tourGo"; index: number }
  | { type: "endTour" }
  | { type: "setIntro"; on: boolean }
  | { type: "setSpeed"; speed: Speed }
  | { type: "setBand"; band: BandId }
  | { type: "setDisplay"; display: DisplayMode }
  | { type: "toggleField" }
  | { type: "setTime"; t: number }
  | { type: "step"; dir: 1 | -1 }
  | { type: "advance"; dtSeconds: number }
  | { type: "setPlaying"; playing: boolean }
  | { type: "setBasemap"; basemap: Basemap }
  | { type: "setLive"; id: LiveLayerId; status: LiveStatus; date?: string | null }
  | { type: "measuredAvailable" }
  | { type: "toggleMeasured" }
  | { type: "setSound"; on: boolean }
  | { type: "setDivider"; x: number }
  | { type: "setCompare"; on: boolean }
  | { type: "setSheet"; sheet: Sheet }
  | { type: "setModal"; modal: Modal }
  | { type: "setProbe"; at: LatLng | null };

/** Seconds for one Play sweep through a scene's whole time range. */
export const SWEEP_SECONDS = 8;

export function placeOf(s: AppState): Hotspot { return HOTSPOT_BY_ID[s.place]!; }
export function sceneOf(s: AppState): Scene | null {
  const id = placeOf(s).scene;
  return id ? SCENES[id] : null;
}
export function defaultDisplay(placeId: string): DisplayMode {
  const h = HOTSPOT_BY_ID[placeId];
  return h?.scene ? SCENES[h.scene].display : "fringes";
}

export function initialState(url: UrlState = {}): AppState {
  const sceneT = {} as Record<SceneId, number>;
  for (const id of SCENE_IDS) sceneT[id] = (SCENES[id].t.min + SCENES[id].t.max) / 2;
  for (const h of HOTSPOTS) if (h.scene && h.t !== undefined) sceneT[h.scene] = h.t;
  const view = isView(url.view) ? url.view : "miami";
  const place = url.place && VIEW_PLACES[view].includes(url.place) ? url.place : VIEW_PLACES[view][0]!;
  const live = Object.fromEntries(LIVE_LAYER_IDS.map((id) => [id, { status: "off", date: null }])) as Record<LiveLayerId, LiveState>;
  return {
    view, place, band: url.band ?? "nisar-l", display: url.display ?? defaultDisplay(place),
    fieldOn: true, sceneT, playing: false, basemap: "map", live,
    measuredAvailable: false, measuredOn: false, sound: false, divider: 0.5, compare: false, sheet: "peek", modal: null, popover: null,
    tour: null, intro: false, speed: 1, probe: null, flyToken: 0,
  };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "setView": {
      if (a.view === s.view) return s;
      const place = VIEW_PLACES[a.view][0]!;
      return reducer(s, { type: "selectPlace", id: place });
    }
    case "selectPlace": {
      const h = HOTSPOT_BY_ID[a.id];
      if (!h) return s;
      const view = h.group as View;
      return {
        ...s, view, place: a.id, display: defaultDisplay(a.id), playing: false, probe: null, popover: null,
        // choosing a place yourself ends the guided tour (tourGo re-arms it after its inner selectPlace)
        tour: null,
        compare: view === "everglades" && s.view === "everglades" ? s.compare : false, divider: 0.5, flyToken: s.flyToken + 1,
      };
    }
    case "setPopover": return { ...s, popover: a.popover };
    case "startTour": return reducer({ ...s, intro: false, modal: null, popover: null, sheet: "half" }, { type: "tourGo", index: 0 });
    case "tourGo": {
      const ch = CHAPTERS[a.index];
      if (!ch) return { ...s, tour: null };
      const next = reducer(s, { type: "selectPlace", id: ch.place });
      return { ...next, tour: a.index, fieldOn: true };
    }
    case "endTour": return { ...s, tour: null };
    case "setIntro": return { ...s, intro: a.on };
    case "setSpeed": return { ...s, speed: a.speed };
    case "setBand": return a.band === s.band ? s : { ...s, band: a.band };
    case "setDisplay": return { ...s, display: a.display };
    case "toggleField": return { ...s, fieldOn: !s.fieldOn };
    case "setTime": {
      const sc = sceneOf(s);
      if (!sc || !Number.isFinite(a.t)) return s;
      return { ...s, sceneT: { ...s.sceneT, [sc.id]: Math.min(sc.t.max, Math.max(sc.t.min, a.t)) } };
    }
    case "step": {
      const sc = sceneOf(s);
      if (!sc) return s;
      return reducer({ ...s, playing: false }, { type: "setTime", t: s.sceneT[sc.id] + a.dir * (sc.t.max - sc.t.min) / 40 });
    }
    case "advance": {
      const sc = sceneOf(s);
      if (!sc) return { ...s, playing: false };
      // dt = 0 is a clock tick (keep playing); negative or non-finite time is a bad clock: stop
      if (!Number.isFinite(a.dtSeconds) || a.dtSeconds < 0) return { ...s, playing: false };
      const t = s.sceneT[sc.id] + ((sc.t.max - sc.t.min) * a.dtSeconds * s.speed) / SWEEP_SECONDS;
      // one sweep then stop at the end, so the final state stays on screen
      if (t >= sc.t.max) return { ...s, playing: false, sceneT: { ...s.sceneT, [sc.id]: sc.t.max } };
      return { ...s, sceneT: { ...s.sceneT, [sc.id]: t } };
    }
    case "setPlaying": {
      const sc = sceneOf(s);
      if (!sc) return { ...s, playing: false };
      if (a.playing && s.sceneT[sc.id] >= sc.t.max - 1e-9) return { ...s, playing: true, sceneT: { ...s.sceneT, [sc.id]: sc.t.min } };
      return { ...s, playing: a.playing };
    }
    case "setBasemap": return { ...s, basemap: a.basemap };
    case "setLive": return { ...s, live: { ...s.live, [a.id]: { status: a.status, date: a.date ?? (a.status === "off" ? null : s.live[a.id].date) } } };
    case "measuredAvailable": return { ...s, measuredAvailable: true };
    case "toggleMeasured": return { ...s, measuredOn: !s.measuredOn };
    case "setSound": return { ...s, sound: a.on };
    case "setDivider": return Number.isFinite(a.x) ? { ...s, divider: Math.min(0.95, Math.max(0.05, a.x)) } : s;
    case "setCompare": return { ...s, compare: a.on, divider: 0.5 };
    case "setSheet": return { ...s, sheet: a.sheet };
    case "setModal": return { ...s, modal: a.modal, popover: null, playing: a.modal ? false : s.playing };
    case "setProbe": return { ...s, probe: a.at };
    default: return s;
  }
}
