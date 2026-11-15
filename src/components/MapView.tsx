"use client";
/**
 * MapLibre bridge (WebGL globe). React owns state; this component mirrors it onto the map.
 *
 * Radar layers live between the land and the water polygons of the basemap, so OpenStreetMap's own
 * coastline masks them exactly. Interferograms are painted at full resolution in a worker and
 * streamed into canvas sources; Miami is drawn as a persistent-scatterer point cloud.
 * MapLibre loads lazily, so nothing here runs during static prerendering.
 */
import "@/styles/maplibre.css";
import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import type * as ML from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { HOTSPOTS, HOTSPOT_BY_ID, LIVE_LAYERS, LIVE_LAYER_IDS, type LiveLayerId } from "@/lib/content";
import { BANDS } from "@/lib/physics";
import { SCENES, sample, sceneContaining, type Sample, type Scene, type SceneId } from "@/lib/scenes";
import { findLatest, tileTemplate } from "@/lib/gibs";
import { DATA_ANCHOR, IMAGERY_TILES, PALETTE, buildStyle } from "@/lib/mapStyle";
import { formatSigned } from "@/lib/format";
import { closestProgress, nisarTrack } from "@/lib/orbit";
import { Towers, psCloud } from "@/lib/psPoints";
import type { FrameRequest, FrameResponse } from "@/workers/field.worker";
import { sceneOf, type Action, type AppState } from "@/lib/appState";
import VENDOR from "@/lib/vendor.json";
import type { Store } from "@/lib/store";
import type { Sonifier } from "@/lib/sonifier";

export interface PointerInfo {
  readonly x: number; readonly y: number; readonly lat: number; readonly lng: number;
  readonly scene: Scene | null; readonly sample: Sample | null; readonly pinned: boolean;
}
export interface MapApi { zoomIn(): void; zoomOut(): void }
interface MeasuredProps { velocity_mm_yr: number; period?: string; source?: string }

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** Place zooms in content.ts use 256-px-tile zoom levels; MapLibre uses 512-px tiles. */
const Z = (z: number): number => z - 1;
/** Intro "planet rise": the globe sits low and large, its limb glowing behind the title. */
const GLOBE_CENTER: [number, number] = [-62, 20];
const introZoom = (h: number): number => Math.log2((0.62 * h * 2 * Math.PI) / 512);
const introPadding = (h: number): ML.PaddingOptions => ({ top: Math.round(h * 0.92), bottom: 0, left: 0, right: 0 });
/** Per-place camera: a little pitch turns a flat map into a landscape (3D towers in Miami, the volcano). */
const CAMERA: Readonly<Record<string, { pitch: number; bearing: number }>> = {
  "miami-coast": { pitch: 55, bearing: -18 }, surfside: { pitch: 52, bearing: -22 }, "miami-beach-west": { pitch: 45, bearing: -12 },
  everglades: { pitch: 0, bearing: 0 }, iceland: { pitch: 42, bearing: -15 }, thwaites: { pitch: 35, bearing: 18 }, amazon: { pitch: 0, bearing: 0 },
};
const REVEAL_MS = 1200;
const mercY = (lat: number): number => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const ANCHOR_LIVE = "anchor-live";
const ANCHOR_FIELD = "anchor-field";

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  pointer: Store<PointerInfo | null>;
  sonifier: Sonifier;
  /** px covered by the floating panel on the left (0 on phones) */
  leftInset: number;
  /** px covered by the dock or the bottom sheet */
  bottomInset: number;
  onApi: (api: MapApi) => void;
  onNotice: (message: string) => void;
  onNetwork: (offline: boolean) => void;
  /** the camera reached the selected place and its field has finished developing */
  onArrive?: () => void;
}

interface FieldSurface { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; source: ML.CanvasSource | null }

export default function MapView({ state, dispatch, pointer, sonifier, leftInset, bottomInset, onApi, onNotice, onNetwork, onArrive }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const cmpEl = useRef<HTMLDivElement>(null);
  const lib = useRef<typeof ML | null>(null);
  const map = useRef<ML.Map | null>(null);
  const cmp = useRef<ML.Map | null>(null);
  const markers = useRef<Record<string, { marker: ML.Marker; el: HTMLElement }>>({});
  const probeMarker = useRef<ML.Marker | null>(null);
  const callouts = useRef<{ marker: ML.Marker; value: HTMLElement; at: [number, number] }[]>([]);
  const liveDates = useRef<Partial<Record<LiveLayerId, string>>>({});
  const inflight = useRef(new Set<LiveLayerId>());
  const worker = useRef<Worker | null>(null);
  const surfaces = useRef<Partial<Record<SceneId, FieldSurface>>>({});
  const frame = useRef({ seq: 0, busy: false, want: null as FrameRequest | null, sent: "" });
  const psT = useRef<number | null>(null);
  const towers = useRef(new Towers());
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  const arriveRef = useRef(onArrive);
  useEffect(() => { arriveRef.current = onArrive; }, [onArrive]);
  const insetRef = useRef({ left: leftInset, bottom: bottomInset });
  const appliedPad = useRef({ left: -1, bottom: -1 });
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { insetRef.current = { left: leftInset, bottom: bottomInset }; }, [leftInset, bottomInset]);

  /** Keeps every target clear of the card, the dock and the top controls. */
  const padding = useCallback((): ML.PaddingOptions => {
    const { left, bottom } = insetRef.current;
    const phone = left === 0;
    return { left: phone ? 16 : left + 24, bottom: bottom + (phone ? 16 : 32), top: phone ? 72 : 88, right: phone ? 16 : 72 };
  }, []);
  const reveal = useRef({ amount: 1, raf: 0 });

  /** Screen x of the compare divider (container px), or null when compare is off. */
  const cutX = useCallback((): number | null => {
    const st = stateRef.current, m = map.current;
    if (!st.compare || !m) return null;
    const left = insetRef.current.left;
    return left + (m.getContainer().clientWidth - left) * st.divider;
  }, []);

  /* ------------------------------------------------------------------ field frames (worker) */
  const pumpFrame = useCallback(() => {
    const f = frame.current;
    if (f.busy || !f.want || !worker.current) return;
    const key = JSON.stringify([f.want.scene, f.want.t, f.want.band, f.want.display, f.want.reveal?.amount ?? 1]);
    if (key === f.sent) { f.want = null; return; }
    f.busy = true;
    f.sent = key;
    worker.current.postMessage({ ...f.want, seq: ++f.seq });
    f.want = null;
  }, []);

  /** Queue the current scene's frame (time, band, display, reveal) for the worker. */
  const pushFrame = useCallback(() => {
    const st = stateRef.current, sc = sceneOf(st), h = HOTSPOT_BY_ID[st.place]!;
    if (!sc?.raster || !st.fieldOn) return;
    const [S, W, N, E] = sc.bbox;
    const u = (h.center[1] - W) / (E - W), v = (mercY(N) - mercY(h.center[0])) / (mercY(N) - mercY(S));
    const amount = reveal.current.amount;
    frame.current.want = { seq: 0, scene: sc.id, t: st.sceneT[sc.id], band: st.band, display: st.display, reveal: amount < 1 ? { amount: Math.round(amount * 200) / 200, u, v } : undefined };
    pumpFrame();
  }, [pumpFrame]);

  const startReveal = useCallback(() => {
    const r = reveal.current;
    cancelAnimationFrame(r.raf);
    const sc = sceneOf(stateRef.current);
    if (r.amount >= 1 || !sc?.raster || !stateRef.current.fieldOn) { r.amount = 1; pushFrame(); arriveRef.current?.(); return; }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / REVEAL_MS);
      r.amount = p >= 1 ? 1 : 1 - Math.pow(1 - p, 3); // ease-out cubic
      pushFrame();
      if (p < 1) r.raf = requestAnimationFrame(tick); else arriveRef.current?.();
    };
    r.raf = requestAnimationFrame(tick);
  }, [pushFrame]);

  const onFrame = useCallback((r: FrameResponse) => {
    const m = map.current;
    frame.current.busy = false;
    if ("error" in r) { console.error(`SARPulse: could not paint ${r.scene}: ${r.error}`); pumpFrame(); return; } // keep the pipeline alive
    if (m) {
      let s = surfaces.current[r.scene];
      const w = "bitmap" in r ? r.bitmap.width : r.width, h = "bitmap" in r ? r.bitmap.height : r.height;
      if (!s) {
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) { s = { canvas, ctx, source: null }; surfaces.current[r.scene] = s; }
      }
      if (s) {
        if ("bitmap" in r) { s.ctx.clearRect(0, 0, w, h); s.ctx.drawImage(r.bitmap, 0, 0); r.bitmap.close(); }
        else s.ctx.putImageData(new ImageData(new Uint8ClampedArray(r.pixels), w, h), 0, 0);
        const id = `field-${r.scene}`;
        if (!s.source) {
          const [W, N, E, S] = r.extent;
          m.addSource(id, { type: "canvas", canvas: s.canvas, animate: false, coordinates: [[W, N], [E, N], [E, S], [W, S]] });
          m.addLayer({ id, type: "raster", source: id, paint: { "raster-fade-duration": 0, "raster-resampling": "linear", "raster-opacity": 0.92 } }, ANCHOR_FIELD);
          s.source = m.getSource(id) as ML.CanvasSource;
          syncFieldVisibility();
        }
        // one texture upload for this frame, then idle again
        const src = s.source;
        src.play();
        m.once("render", () => src.pause());
      }
    } else if ("bitmap" in r) r.bitmap.close();
    pumpFrame();
     
  }, [pumpFrame]);

  function syncFieldVisibility(): void {
    const m = map.current;
    if (!m) return;
    const st = stateRef.current, sc = sceneOf(st);
    for (const id of Object.keys(surfaces.current) as SceneId[]) {
      if (m.getLayer(`field-${id}`)) m.setLayoutProperty(`field-${id}`, "visibility", st.fieldOn && sc?.id === id ? "visible" : "none");
    }
    const miami = st.fieldOn && sc?.id === "miami";
    if (m.getLayer("ps")) m.setLayoutProperty("ps", "visibility", miami ? "visible" : "none");
    if (m.getLayer("towers")) m.setLayoutProperty("towers", "visibility", miami ? "visible" : "none");
    if (m.getLayer("building")) m.setLayoutProperty("building", "visibility", miami || st.basemap === "satellite" ? "none" : "visible");
  }

  /* ------------------------------------------------------------------ create once */
  useEffect(() => {
    const rev = reveal.current; // one stable object for the cleanup below
    let disposed = false;
    void (async () => {
      // self-hosted, pinned ES module (scripts/vendor.mjs); loaded natively so its worker resolves next to it
      const lf = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${BASE}${VENDOR.maplibre}`)) as typeof ML;
      if (disposed || !el.current) return;
      lib.current = lf;
      const s = stateRef.current;
      const h = HOTSPOT_BY_ID[s.place]!;
      const m = new lf.Map({
        container: el.current, style: buildStyle(),
        center: s.intro ? GLOBE_CENTER : [h.center[1], h.center[0]],
        zoom: s.intro ? introZoom(el.current.clientHeight) : Z(h.zoom),
        attributionControl: { compact: true }, maxPitch: 70, minZoom: 0.6, fadeDuration: 120,
        dragRotate: true, touchPitch: false, cooperativeGestures: false,
      });
      map.current = m;
      if (process.env.NODE_ENV !== "production") (window as unknown as { __sarpMap?: ML.Map }).__sarpMap = m; // dev-only debugging handle
      m.setPadding(s.intro ? introPadding(el.current.clientHeight) : padding());
      appliedPad.current = { ...insetRef.current };
      onApi({ zoomIn: () => m.zoomIn(), zoomOut: () => m.zoomOut() });

      let tileOk = false, tileErr = 0, reported = false;
      m.on("data", (e) => { if ((e as ML.MapSourceDataEvent).sourceId === "openmaptiles" && (e as ML.MapSourceDataEvent).tile) tileOk = true; });
      m.on("error", (e) => {
        const src = (e as unknown as { sourceId?: string }).sourceId;
        if (src === "openmaptiles" || src === "relief") {
          tileErr++;
          if (tileErr > 4 && !tileOk && !reported) { reported = true; onNetwork(true); void addOfflineLand(m); }
        }
      });

      m.on("load", () => {
        if (disposed) return;
        m.addLayer({ id: ANCHOR_LIVE, type: "background", layout: { visibility: "none" } }, DATA_ANCHOR);
        m.addLayer({ id: ANCHOR_FIELD, type: "background", layout: { visibility: "none" } }, DATA_ANCHOR);
        // Miami persistent scatterers
        m.addSource("ps", { type: "geojson", data: psCloud(s.sceneT.miami), maxzoom: 16, buffer: 8 });
        m.addLayer({
          id: "ps", type: "circle", source: "ps", minzoom: 10.5,
          paint: {
            "circle-radius": ["interpolate", ["exponential", 1.6], ["zoom"], 11, 1.4, 13, 2.6, 15, 4, 17, 6.5],
            "circle-color": ["interpolate", ["linear"], ["get", "v"], -1, "#ff2d55", -0.55, "#ff6a3d", -0.25, "#ffb547", -0.08, "#f0dd95", -0.02, "#c7cfe6", 0.02, "#c7cfe6", 0.3, "#5aa2ff", 1, "#4f7cff"],
            "circle-opacity": ["interpolate", ["linear"], ["abs", ["get", "v"]], 0, 0.45, 0.1, 0.9, 1, 1],
            "circle-blur": 0.35, // soft glow: reads as reflections, not as dots of paint
            "circle-stroke-width": 0,
          },
        }, ANCHOR_FIELD);
        psT.current = s.sceneT.miami;
        // Miami in 3D: OpenStreetMap footprints extruded to their real height, coloured by how fast they sink
        m.addSource("towers", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "towers", type: "fill-extrusion", source: "towers", minzoom: 12.5,
          paint: {
            "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["get", "b"],
            "fill-extrusion-color": ["interpolate", ["linear"], ["get", "v"], -1, "#ff2d55", -0.6, "#ff5a4d", -0.3, "#ff9a3d", -0.12, "#c98a6a", -0.04, "#3b4670", 0, "#2a3556"],
            "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 13.5, 0.9],
            "fill-extrusion-vertical-gradient": true,
          },
        }, "label-water");
        const collect = () => {
          const st = stateRef.current;
          if (sceneOf(st)?.id !== "miami" || m.getZoom() < 12.5) return;
          const [S, W, N, E] = SCENES.miami.bbox;
          const feats = m.querySourceFeatures("openmaptiles", { sourceLayer: "building" }).filter((f) => {
            const g = f.geometry;
            if (g.type !== "Polygon" && g.type !== "MultiPolygon") return false;
            const p0 = g.type === "Polygon" ? g.coordinates[0]?.[0] : g.coordinates[0]?.[0]?.[0];
            return !!p0 && p0[1]! >= S && p0[1]! <= N && p0[0]! >= W && p0[0]! <= E;
          });
          if (towers.current.add(feats as unknown as Parameters<Towers["add"]>[0])) {
            (m.getSource("towers") as ML.GeoJSONSource | undefined)?.setData(towers.current.at(st.sceneT.miami));
          }
        };
        m.on("idle", collect);
        for (const spot of HOTSPOTS) {
          const e = document.createElement("button");
          e.className = `pm${spot.id === s.place ? " selected" : ""}${spot.memorial ? " memorial" : ""}`;
          e.type = "button";
          e.setAttribute("aria-label", spot.title);
          e.innerHTML = `<span class="pm-ring"></span><span class="pm-dot"></span><span class="pm-label"></span>`;
          e.querySelector(".pm-label")!.textContent = spot.title;
          e.addEventListener("click", (ev) => { ev.stopPropagation(); dispatch({ type: "selectPlace", id: spot.id }); });
          const marker = new lf.Marker({ element: e, anchor: "center", opacityWhenCovered: "0" }).setLngLat([spot.center[1], spot.center[0]]).addTo(m);
          markers.current[spot.id] = { marker, el: e };
        }
        setReady(true);
      });

      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const read = (lngLat: ML.LngLat, pt: ML.Point, pinned: boolean) => {
        const st = stateRef.current;
        const cx = cutX();
        const photoSide = cx !== null && pt.x < cx;
        const sc = st.fieldOn && !photoSide ? sceneContaining(lngLat.lat, lngLat.lng) : null;
        const smp = sc && sc.id === sceneOf(st)?.id ? sample(sc, lngLat.lat, lngLat.lng, st.sceneT[sc.id], BANDS[st.band]) : null;
        pointer.set({ x: pt.x, y: pt.y, lat: lngLat.lat, lng: lngLat.lng, scene: smp ? sc : null, sample: smp, pinned });
        if (smp && sc) sonifier.update(Math.tanh((smp.dLOS / sc.scale) * 1.4), smp.coherence, smp.phase);
        else sonifier.silence();
      };
      m.on("mousemove", (e) => { if (!coarse) read(e.lngLat, e.point, false); });
      m.getCanvas().addEventListener("mouseleave", () => { if (!coarse) { pointer.set(null); sonifier.silence(); } });
      m.on("click", (e) => {
        if (coarse) read(e.lngLat, e.point, true); // touch: the readout stays pinned; mouse: the pinned card below carries it
        dispatch({ type: "setProbe", at: [e.lngLat.lat, e.lngLat.lng] });
      });
      const stars = () => document.documentElement.style.setProperty("--stars", m.getZoom() < 5.5 ? "1" : "0");
      m.on("zoomend", stars); m.once("load", stars);
      m.on("move", () => {
        const c = cmp.current;
        if (c) c.jumpTo({ center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch(), padding: m.getPadding() });
      });

      // field worker
      const w = new Worker(new URL("../workers/field.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (ev: MessageEvent<FrameResponse>) => onFrame(ev.data);
      worker.current = w;

      // measured OPERA velocities (optional, produced by the Python pipeline)
      try {
        const res = await fetch(`${BASE}/data/opera-disp-points.json`, { cache: "no-cache" });
        if (res.ok) {
          const fc = (await res.json()) as FeatureCollection<Point, MeasuredProps>;
          if (fc.features?.length) {
            const add = () => {
              m.addSource("measured", { type: "geojson", data: fc });
              m.addLayer({
                id: "measured", type: "circle", source: "measured", layout: { visibility: "none" },
                paint: {
                  "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 14, 5],
                  "circle-color": ["interpolate", ["linear"], ["get", "velocity_mm_yr"], -10, "#ff3b5c", -3, "#ffb547", 0, "#7d8db3", 3, "#5aa2ff", 10, "#4f7cff"],
                  "circle-stroke-color": PALETTE.space, "circle-stroke-width": 0.8,
                },
              });
              dispatch({ type: "measuredAvailable" });
            };
            if (m.loaded()) add(); else m.once("load", add);
          }
        }
      } catch { /* no measured data shipped */ }
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(rev.raf);
      worker.current?.terminate(); worker.current = null;
      cmp.current?.remove(); cmp.current = null;
      map.current?.remove(); map.current = null;
      surfaces.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------------ intro: slow spin from space */
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !state.intro) return;
    const h = m.getContainer().clientHeight;
    m.jumpTo({ center: GLOBE_CENTER, zoom: introZoom(h), padding: introPadding(h), bearing: 0, pitch: 0 });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // NISAR passes sweep the globe: a bright head with a fading tail over a translucent swath, each place
    // pinging as the swath passes it; the next pass lies ~24° further west, as the Earth turns beneath.
    const gradient = (p: number, a: number): ML.ExpressionSpecification => {
      const tail = Math.max(0, p - 0.22), head = Math.max(p, 0.0002);
      return ["interpolate", ["linear"], ["line-progress"], 0, "rgba(238,243,255,0)", ...(tail > 0 ? [tail, "rgba(238,243,255,0)"] : []), head, `rgba(238,243,255,${a})`, Math.min(1, head + 0.0001), "rgba(238,243,255,0)", ...(head + 0.0001 < 1 ? [1, "rgba(238,243,255,0)"] : [])] as unknown as ML.ExpressionSpecification;
    };
    let lng0 = -74, track = nisarTrack(lng0);
    const pinged = new Set<string>();
    const pingAt = HOTSPOTS.map((h) => ({ id: h.id, p: closestProgress(track, h.center[0], h.center[1]) }));
    m.addSource("track", { type: "geojson", lineMetrics: true, data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track.coords } } });
    m.addLayer({ id: "track-swath", type: "line", source: "track", layout: { "line-cap": "round" }, paint: { "line-width": 30, "line-blur": 12, "line-gradient": gradient(0, 0.16) } });
    m.addLayer({ id: "track-line", type: "line", source: "track", layout: { "line-cap": "round" }, paint: { "line-width": 1.5, "line-gradient": gradient(0, 0.9) } });
    const SWEEP = 2600, GAP = 1800;
    let raf = 0, last = 0, t0 = 0;
    const spin = (ts: number) => {
      if (last && !m.isMoving()) { const c = m.getCenter(); m.setCenter([c.lng + ((ts - last) / 1000) * 3, c.lat]); } // one turn per 120 s
      last = ts;
      if (!t0) t0 = ts;
      const k = (ts - t0) / SWEEP;
      if (k <= 1.25) {
        const p = Math.min(1.22, k);
        m.setPaintProperty("track-line", "line-gradient", gradient(Math.min(1, p), 0.9 * Math.max(0, 1 - Math.max(0, p - 1) * 4.5)));
        m.setPaintProperty("track-swath", "line-gradient", gradient(Math.min(1, p), 0.16 * Math.max(0, 1 - Math.max(0, p - 1) * 4.5)));
        for (const q of pingAt) if (!pinged.has(q.id) && p >= q.p) {
          pinged.add(q.id);
          const e = markers.current[q.id]?.el;
          if (e) { e.classList.remove("ping"); void e.offsetWidth; e.classList.add("ping"); }
        }
      } else if (ts - t0 > SWEEP * 1.25 + GAP) {
        lng0 -= 24.3; track = nisarTrack(lng0); pinged.clear(); t0 = ts;
        pingAt.forEach((q) => { const h = HOTSPOT_BY_ID[q.id]!; q.p = closestProgress(track, h.center[0], h.center[1]); });
        (m.getSource("track") as ML.GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track.coords } });
      }
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    return () => {
      cancelAnimationFrame(raf);
      for (const id of ["track-line", "track-swath"]) if (m.getLayer(id)) m.removeLayer(id);
      if (m.getSource("track")) m.removeSource("track");
    };
  }, [ready, state.intro]);

  /* ------------------------------------------------------------------ selection + camera */
  useEffect(() => {
    for (const [id, { el: e }] of Object.entries(markers.current)) {
      e.classList.toggle("selected", id === state.place);
      if (id === state.place) { e.classList.remove("pulse"); void e.offsetWidth; e.classList.add("pulse"); }
    }
  }, [state.place, ready]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || state.intro) return;
    const h = HOTSPOT_BY_ID[state.place]!;
    const refresh = () => {
      startReveal();
      const st = stateRef.current;
      for (const id of LIVE_LAYER_IDS) if (st.live[id].status === "ready" || st.live[id].status === "none") dispatch({ type: "setLive", id, status: "searching" });
      if (h.liveDefault && st.live[h.liveDefault].status === "off") dispatch({ type: "setLive", id: h.liveDefault, status: "searching" });
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const far = m.getZoom() < 4;
    m.once("moveend", refresh);
    const cam = CAMERA[h.id] ?? { pitch: 0, bearing: 0 };
    cancelAnimationFrame(reveal.current.raf); // a still-running reveal of the previous place must not touch this one
    reveal.current.amount = reduce ? 1 : 0; // the field "develops" once the camera arrives
    pushFrame();
    m.flyTo({ center: [h.center[1], h.center[0]], zoom: Z(h.zoom), padding: padding(), bearing: cam.bearing, pitch: cam.pitch, duration: reduce ? 0 : far ? 4500 : 2400, curve: far ? 1.6 : 1.42, essential: true });
    return () => { m.off("moveend", refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.flyToken, ready, state.intro]);

  /* panel/sheet size changes re-centre the view; never on mount, where it would cancel the opening flight */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (appliedPad.current.left === leftInset && appliedPad.current.bottom === bottomInset) return;
    appliedPad.current = { left: leftInset, bottom: bottomInset };
    const apply = () => m.easeTo({ padding: padding(), duration: 300 });
    if (m.isMoving()) m.once("moveend", apply); else apply();
  }, [leftInset, bottomInset, ready, padding]);

  /* ------------------------------------------------------------------ data layers */
  useEffect(() => {
    if (!ready) return;
    syncFieldVisibility();
    const sc = sceneOf(state);
    if (!state.fieldOn || !sc) return;
    if (sc.raster) {
      pushFrame();
    } else if (sc.id === "miami") {
      const t = state.sceneT.miami;
      // while playing, update in 0.08-year steps (~15 Hz over an 8 s sweep); exact when paused or scrubbed
      if (psT.current === null || (psT.current !== t && (!state.playing || Math.abs(t - psT.current) >= 0.08 || t === SCENES.miami.t.max))) {
        psT.current = t;
        (map.current?.getSource("ps") as ML.GeoJSONSource | undefined)?.setData(psCloud(t));
        if (towers.current.size) (map.current?.getSource("towers") as ML.GeoJSONSource | undefined)?.setData(towers.current.at(t));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.fieldOn, state.place, state.band, state.display, state.sceneT, state.playing, pumpFrame, pushFrame]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const sat = state.basemap === "satellite";
    m.setLayoutProperty("imagery", "visibility", sat ? "visible" : "none");
    for (const id of ["relief", "park", "ice"]) m.setLayoutProperty(id, "visibility", sat ? "none" : "visible");
    syncFieldVisibility();
    m.setPaintProperty("water", "fill-opacity", sat ? 0.7 : 1);
    m.setPaintProperty("road-minor", "line-color", sat ? "rgba(255,255,255,0.18)" : PALETTE.road);
    m.setPaintProperty("road-major", "line-color", sat ? "rgba(255,255,255,0.28)" : PALETTE.road);
  }, [state.basemap, ready]);

  /* compare: a second, photo-only map clipped to the left of the divider and locked to this one */
  useEffect(() => {
    const m = map.current, lf = lib.current, box = cmpEl.current;
    if (!ready || !m || !lf || !box) return;
    if (!state.compare) { cmp.current?.remove(); cmp.current = null; return; }
    const c = new lf.Map({
      container: box, interactive: false, attributionControl: false, fadeDuration: 0,
      style: { version: 8, projection: { type: "globe" }, sources: { imagery: { type: "raster", tiles: [IMAGERY_TILES], tileSize: 256, maxzoom: 19 } }, layers: [{ id: "bg", type: "background", paint: { "background-color": PALETTE.land } }, { id: "imagery", type: "raster", source: "imagery" }] },
      center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch(),
    });
    c.setPadding(m.getPadding());
    cmp.current = c;
    return () => { c.remove(); if (cmp.current === c) cmp.current = null; };
  }, [state.compare, ready]);

  useEffect(() => {
    const box = cmpEl.current;
    if (!box) return;
    const cx = cutX();
    box.style.clipPath = cx === null ? "inset(0 100% 0 0)" : `inset(0 calc(100% - ${cx}px) 0 0)`;
  }, [state.compare, state.divider, leftInset, cutX]);

  /* live NASA layers (GIBS) */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    for (const id of LIVE_LAYER_IDS) {
      const st = state.live[id], lid = `live-${id}`;
      if (st.status === "off" || st.status === "none") {
        if (m.getLayer(lid)) m.removeLayer(lid);
        if (m.getSource(lid)) m.removeSource(lid);
        delete liveDates.current[id];
        continue;
      }
      if (st.status === "searching") {
        if (inflight.current.has(id)) continue;
        inflight.current.add(id);
        const search = (): void => {
          const token = stateRef.current.flyToken, c = m.getCenter();
          void findLatest(LIVE_LAYERS[id], c.lat, c.lng, Math.min(8, Math.max(5, Math.round(m.getZoom() + 1)))).then((r) => {
            if (stateRef.current.live[id].status !== "searching") { inflight.current.delete(id); return; }
            if (stateRef.current.flyToken !== token) { m.once("moveend", search); return; }
            inflight.current.delete(id);
            dispatch({ type: "setLive", id, status: r.date ? "ready" : "none", date: r.date });
            if (!r.date) onNotice(`No ${LIVE_LAYERS[id].title} pass here in the last ${LIVE_LAYERS[id].searchDays} days, or you're offline.`);
          });
        };
        search();
        continue;
      }
      if (st.status === "ready" && st.date && liveDates.current[id] !== st.date) {
        if (m.getLayer(lid)) m.removeLayer(lid);
        if (m.getSource(lid)) m.removeSource(lid);
        const def = LIVE_LAYERS[id];
        m.addSource(lid, { type: "raster", tiles: [tileTemplate(def, st.date)], tileSize: 256, maxzoom: def.maxNative, attribution: "NASA GIBS / ESDIS" });
        m.addLayer({ id: lid, type: "raster", source: lid, paint: { "raster-opacity": id === "water" ? 0.85 : 0.95, "raster-fade-duration": 300 } }, ANCHOR_LIVE);
        liveDates.current[id] = st.date;
      }
    }
  }, [state.live, ready, dispatch, onNotice]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getLayer("measured")) return;
    m.setLayoutProperty("measured", "visibility", state.measuredOn ? "visible" : "none");
  }, [state.measuredOn, state.measuredAvailable, ready]);

  /* on-map callouts: the place's measuring points, labelled on the data with live values (NYT-style) */
  useEffect(() => {
    const m = map.current, lf = lib.current;
    if (!m || !lf || !ready) return;
    const h = HOTSPOT_BY_ID[state.place]!;
    const probes = [h.probe, h.probe2].filter((p): p is NonNullable<typeof p> => !!p && !!h.scene);
    callouts.current = probes.map((p, i) => {
      const e = document.createElement("div");
      e.className = `callout${i ? " second" : ""}`;
      e.innerHTML = `<span class="co-dot"></span><span class="co-line"></span><span class="co-label"><b></b><span class="co-value"></span></span>`;
      e.querySelector("b")!.textContent = p.label;
      const marker = new lf.Marker({ element: e, anchor: "center", opacityWhenCovered: "0" }).setLngLat([p.at[1], p.at[0]]).addTo(m);
      return { marker, value: e.querySelector(".co-value") as HTMLElement, at: p.at as [number, number] };
    });
    for (const [id, { el: e }] of Object.entries(markers.current)) e.classList.toggle("has-callouts", id === state.place && probes.length > 0);
    return () => { callouts.current.forEach((c) => c.marker.remove()); callouts.current = []; };
  }, [state.place, ready]);

  useEffect(() => {
    const sc = sceneOf(state);
    if (!sc) return;
    for (const c of callouts.current) {
      const smp = sample(sc, c.at[0], c.at[1], state.sceneT[sc.id], BANDS[state.band]);
      c.value.textContent = !smp ? "" : sc.kind === "water" ? `${formatSigned(smp.up)} water` : formatSigned(smp.dLOS);
    }
    for (const c of callouts.current) c.marker.getElement().style.visibility = state.fieldOn ? "" : "hidden";
  }, [state, ready]);

  useEffect(() => {
    const m = map.current, lf = lib.current;
    if (!m || !lf || !ready) return;
    if (!state.probe) { probeMarker.current?.remove(); probeMarker.current = null; return; }
    const ll: [number, number] = [state.probe[1], state.probe[0]];
    if (!probeMarker.current) {
      const e = document.createElement("div");
      e.className = "probe-pin";
      probeMarker.current = new lf.Marker({ element: e, anchor: "center" }).setLngLat(ll).addTo(m);
    } else probeMarker.current.setLngLat(ll);
  }, [state.probe, ready]);

  return (
    <>
      <div ref={el} className="map" aria-label="Radar map. Use the place picker to move between sites." />
      <div ref={cmpEl} className="map map-compare" aria-hidden="true" />
    </>
  );
}

/** Network down: draw the bundled Natural Earth land so the globe is never blank. */
async function addOfflineLand(m: ML.Map): Promise<void> {
  if (m.getSource("offline-land")) return;
  const land = (await import("@/data/offline-basemap.json")).default as unknown as FeatureCollection;
  m.addSource("offline-land", { type: "geojson", data: land });
  m.addLayer({ id: "offline-water", type: "background", paint: { "background-color": PALETTE.water } }, "relief");
  m.addLayer({ id: "offline-land", type: "fill", source: "offline-land", paint: { "fill-color": PALETTE.land, "fill-outline-color": PALETTE.line } }, "relief");
}

