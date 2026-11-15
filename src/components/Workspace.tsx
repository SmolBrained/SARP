"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { HOTSPOT_BY_ID } from "@/lib/content";
import { BANDS, LOS } from "@/lib/physics";
import { SCENES, timeSeries } from "@/lib/scenes";
import { initialState, placeOf, reducer, sceneOf, type AppState, type Sheet } from "@/lib/appState";
import { CHAPTERS } from "@/lib/tour";
import { parseHash, toHash } from "@/lib/urlState";
import { createStore, useStore } from "@/lib/store";
import { Sonifier } from "@/lib/sonifier";
import { formatSigned } from "@/lib/format";
import { useMedia } from "@/lib/useMedia";
import { Starfield } from "./Starfield";
import MapView, { type MapApi, type PointerInfo } from "./MapView";
import { PlaceBody, PlaceCard, Tag, TourCaption } from "./Panel";
import { Dock, Legend, PinnedReadout, ReadPop, Timeline, Toast, Tooltip, XRay, Zoom } from "./Overlays";
import { TopBar } from "./TopBar";
import { prefetchTourTiles } from "@/lib/prefetch";
import { AboutModal, ShareModal } from "./Modals";

const pointerStore = createStore<PointerInfo | null>(null);
const GAP = 16;
const DOCK_INSET = 150; // dock height + margins: places are framed above it
const SHEET_PEEK = 164; // camera framing on phones; the peek detent is max(164px, 16dvh)
const FLY_MS = 1700;
const SNAPS: readonly Sheet[] = ["peek", "half", "full"];

function ProbeLine() {
  const p = useStore(pointerStore);
  if (!p?.pinned) return <p className="hint" style={{ marginTop: 10 }}>Tap the map to read the radar at any point.</p>;
  if (!p.sample || !p.scene) return <p className="hint" style={{ marginTop: 10 }}>No measurement at this point.</p>;
  const s = p.sample;
  return <p className="hint" style={{ marginTop: 10 }}><b className="mono" style={{ color: "var(--text)" }}>{p.scene.kind === "water" ? formatSigned(s.up) : formatSigned(s.dLOS)}</b> {p.scene.kind === "water" ? "water-level change" : "toward the satellite"} · γ {s.coherence.toFixed(2)}</p>;
}

/** Keys aimed at a control (or at the focused map, which pans with arrows) must not also drive the timeline. */
const ownsKeys = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(t.tagName)
  || ["slider", "tab", "menuitem", "radio"].includes(t.getAttribute("role") ?? "") || t.closest(".maplibregl-canvas-container") !== null);

export default function Workspace() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState());
  const [toast, setToast] = useState<string | null>(null);
  const playOnArrive = useRef(false);
  const sweepPlayed = useRef(false);
  const sonifier = useMemo(() => new Sonifier(), []);
  const api = useRef<MapApi | null>(null);
  const stateRef = useRef<AppState>(state);
  const hashReady = useRef(false);
  useEffect(() => { stateRef.current = state; }, [state]);

  const phone = useMedia("(max-width: 767px)");
  const wide = useMedia("(min-width: 1200px)", true);
  const leftInset = phone ? 0 : GAP + (wide ? 380 : 340) + GAP;
  const bottomInset = phone ? SHEET_PEEK : DOCK_INSET;

  /* first load: URL → state, then intro (first visit) or a gentle auto-play */
  useEffect(() => {
    const u = parseHash(window.location.hash);
    if (u.place) dispatch({ type: "selectPlace", id: u.place });
    else if (u.view) dispatch({ type: "setView", view: u.view });
    if (u.band) dispatch({ type: "setBand", band: u.band });
    if (u.display) dispatch({ type: "setDisplay", display: u.display });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) playOnArrive.current = true; // play the story once the camera lands
    if ("serviceWorker" in navigator && window.location.protocol === "https:") void navigator.serviceWorker.register(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/sw.js`).catch(() => undefined);
    void prefetchTourTiles();
  }, []);

  /** Camera landed and the field developed: reveal the interface and play the place's story once. */
  const onArrive = useCallback(() => {
    if (!playOnArrive.current) return;
    playOnArrive.current = false;
    const sc = sceneOf(stateRef.current);
    if (sc && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) { dispatch({ type: "setTime", t: sc.t.min }); dispatch({ type: "setPlaying", playing: true }); }
  }, []);

  /* tour: each chapter flies, then plays its story once it lands (see onArrive) */
  useEffect(() => { if (state.tour !== null) playOnArrive.current = true; }, [state.tour]);

  /* compare split teaches itself: the divider sweeps once when the Everglades open */
  useEffect(() => {
    if (!state.compare || sweepPlayed.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const keys = [0.45, 0.26, 0.7, 0.45];
    const start = window.setTimeout(() => {
      sweepPlayed.current = true; // teach once per visit, not on every toggle
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / 1800);
        const seg = Math.min(keys.length - 2, Math.floor(p * (keys.length - 1)));
        const local = p * (keys.length - 1) - seg;
        const e = local < 0.5 ? 4 * local ** 3 : 1 - (-2 * local + 2) ** 3 / 2;
        dispatch({ type: "setDivider", x: keys[seg]! + (keys[seg + 1]! - keys[seg]!) * e });
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, FLY_MS);
    return () => { window.clearTimeout(start); cancelAnimationFrame(raf); };
  }, [state.compare]);

  /* URL ↔ state */
  useEffect(() => {
    const onHash = () => {
      const u = parseHash(window.location.hash);
      if (u.place && u.place !== stateRef.current.place) dispatch({ type: "selectPlace", id: u.place });
      else if (!u.place && u.view && u.view !== stateRef.current.view) dispatch({ type: "setView", view: u.view });
      if (u.band) dispatch({ type: "setBand", band: u.band });
      if (u.display) dispatch({ type: "setDisplay", display: u.display });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (!hashReady.current) { hashReady.current = true; return; }
    const h = toHash({ view: state.view, place: state.place, band: state.band, display: state.display });
    if (h !== window.location.hash) window.history.replaceState(null, "", h);
  }, [state.view, state.place, state.band, state.display]);

  /* playback: ~30 fps state updates; rendering happens in a worker */
  useEffect(() => {
    if (!state.playing) return;
    let raf = 0, last = 0;
    const loop = (ts: number) => {
      if (!last || ts - last >= 33) { dispatch({ type: "advance", dtSeconds: last ? Math.min(0.1, (ts - last) / 1000) : 0 }); last = ts; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state.playing]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  /* "How to read this" closes on outside click */
  useEffect(() => {
    if (state.popover !== "read") return;
    const down = (e: PointerEvent) => { if (!(e.target as Element).closest(".read-pop, .read-btn")) dispatch({ type: "setPopover", popover: null }); };
    window.addEventListener("pointerdown", down);
    return () => window.removeEventListener("pointerdown", down);
  }, [state.popover]);

  /* keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = stateRef.current;
      if (st.modal || st.intro) return;
      if (e.key === "Escape") {
        if (st.popover) dispatch({ type: "setPopover", popover: null });
        else if (st.sheet !== "peek" && window.matchMedia("(max-width: 767px)").matches) dispatch({ type: "setSheet", sheet: "peek" });
        else if (st.tour !== null) dispatch({ type: "endTour" });
        return;
      }
      if (ownsKeys(e.target)) return;
      if (e.key === " ") { e.preventDefault(); dispatch({ type: "setPlaying", playing: !st.playing }); }
      else if (st.tour !== null && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        const i = st.tour + (e.key === "ArrowRight" ? 1 : -1);
        if (i >= 0 && i < CHAPTERS.length) dispatch({ type: "tourGo", index: i });
      }
      else if (e.key === "ArrowRight") dispatch({ type: "step", dir: 1 });
      else if (e.key === "ArrowLeft") dispatch({ type: "step", dir: -1 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleSound = useCallback(() => {
    if (stateRef.current.sound) { sonifier.stop(); dispatch({ type: "setSound", on: false }); return; }
    if (!sonifier.start()) { setToast("This browser can't play Web Audio."); return; }
    dispatch({ type: "setSound", on: true });
    setToast(window.matchMedia("(pointer: coarse)").matches ? "Tap the map: low pitch = sinking, high = rising, clicks = fringes." : "Move over the map: low pitch = sinking, high = rising, clicks = fringes.");
  }, [sonifier]);

  const melody = useCallback(() => {
    const st = stateRef.current, sc = sceneOf(st), h = placeOf(st);
    if (!sc || !h.probe) return;
    const series = timeSeries(sc, h.probe.at, BANDS[st.band], 24);
    const vals = series.map((p) => Math.tanh((((sc.kind === "water" ? (p.value ?? 0) * LOS[2] : p.value) ?? 0) / sc.scale) * 1.4));
    dispatch({ type: "setPlaying", playing: false });
    void sonifier.melody(vals, (i) => dispatch({ type: "setTime", t: series[i]!.t }));
  }, [sonifier]);

  const onNotice = useCallback((message: string) => setToast(message), []);
  // Network loss falls back silently to the bundled Natural Earth basemap; a console note is enough.
  const onNetwork = useCallback((offline: boolean) => { if (offline) console.info("SARPulse: map tiles unreachable, using the built-in basemap."); }, []);
  const onApi = useCallback((a: MapApi) => { api.current = a; }, []);
  const closeModal = useCallback(() => dispatch({ type: "setModal", modal: null }), []);
  const setDivider = useCallback((x: number) => dispatch({ type: "setDivider", x }), []);
  const onZoom = useCallback((d: 1 | -1) => (d > 0 ? api.current?.zoomIn() : api.current?.zoomOut()), []);

  /* phone sheet: tap the grip to cycle, or drag it */
  const sheetEl = useRef<HTMLElement>(null);
  const grip = useRef<{ y: number; t: number; dy: number; moved: boolean } | null>(null);
  /** Detent heights in px, in step with the .sheet.peek/.half/.full CSS (16/50/92 dvh, peek never under 164 px). */
  const detents = () => { const vh = window.innerHeight; return [Math.max(164, vh * 0.16), vh * 0.5, vh * 0.92]; };
  const cycleSheet = useCallback(() => {
    const i = SNAPS.indexOf(stateRef.current.sheet);
    dispatch({ type: "setSheet", sheet: SNAPS[(i + 1) % SNAPS.length]! });
  }, []);

  const h = HOTSPOT_BY_ID[state.place]!;
  const sc = h.scene ? SCENES[h.scene] : null;
  const t = sc ? state.sceneT[sc.id] : 0;

  return (
    <div className="shell">
      <Starfield />
      <MapView state={state} dispatch={dispatch} pointer={pointerStore} sonifier={sonifier} leftInset={leftInset} bottomInset={bottomInset} onApi={onApi} onNotice={onNotice} onNetwork={onNetwork} onArrive={onArrive} />
      <div className="vignette" aria-hidden="true" />
      <div className="hud">
        <div className="map-area">
          {state.compare && <XRay divider={state.divider} onMove={setDivider} onClose={() => dispatch({ type: "setCompare", on: false })} />}
          {!phone && <Tooltip store={pointerStore} leftInset={leftInset} />}
          {!phone && <PinnedReadout state={state} onClear={() => dispatch({ type: "setProbe", at: null })} />}
          {toast && <Toast message={toast} onClose={() => setToast(null)} />}
        </div>
        <TopBar state={state} dispatch={dispatch} onSound={toggleSound} />
        {!phone && <PlaceCard place={state.place} band={state.band} t={t} tour={state.tour} dispatch={dispatch} onMelody={melody} />}
        {!phone && <Dock state={state} dispatch={dispatch} />}
        {state.popover === "read" && <ReadPop band={state.band} water={sc?.kind === "water"} />}
        {!phone && <Zoom onZoom={onZoom} />}
        {phone && (
          <section ref={sheetEl} className={`sheet glass ${state.sheet}`} aria-label={`${h.title} details`}>
            <button className="grip" aria-label={state.sheet === "full" ? "Collapse details" : "Expand details"} aria-expanded={state.sheet !== "peek"}
              onPointerDown={(e) => { grip.current = { y: e.clientY, t: e.timeStamp, dy: 0, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerMove={(e) => {
                const g = grip.current, el = sheetEl.current;
                if (!g || !el) return;
                g.dy = g.y - e.clientY; // up is positive
                if (!g.moved && Math.abs(g.dy) < 6) return;
                g.moved = true;
                el.classList.add("dragging");
                const d = detents(), cur = d[SNAPS.indexOf(stateRef.current.sheet)]!;
                el.style.setProperty("--drag", `${Math.max(d[0]! - cur, Math.min(d[2]! - cur, g.dy))}px`); // follows the finger, clamped to the range
              }}
              onPointerUp={(e) => {
                const g = grip.current, el = sheetEl.current;
                grip.current = null;
                if (!g) return;
                if (!g.moved) { cycleSheet(); return; }
                el?.classList.remove("dragging");
                el?.style.removeProperty("--drag");
                const d = detents(), cur = d[SNAPS.indexOf(stateRef.current.sheet)]!;
                const v = g.dy / Math.max(1, e.timeStamp - g.t); // px/ms: a flick carries on to the next detent
                const target = cur + g.dy + v * 180;
                let best = 0;
                d.forEach((h, i) => { if (Math.abs(h - target) < Math.abs(d[best]! - target)) best = i; });
                dispatch({ type: "setSheet", sheet: SNAPS[best]! });
              }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleSheet(); } }}
              onPointerCancel={() => { grip.current = null; sheetEl.current?.classList.remove("dragging"); sheetEl.current?.style.removeProperty("--drag"); }} />
            <div className="sheet-scroll">
              <div className="peek-head">
                <strong>{h.title}</strong>
                <Tag status={h.status} />
                <button className="icon-btn sound-sm" aria-pressed={state.sound} onClick={toggleSound} aria-label={state.sound ? "Turn sound off" : "Hear the ground move"}>
                  <span className={`bars${state.sound ? " on" : ""}`} aria-hidden="true"><i /><i /><i /><i /></span>
                </button>
              </div>
              <Timeline state={state} dispatch={dispatch} />
              {state.sheet === "peek" ? <ProbeLine /> : (
                <>
                  {state.tour !== null && <TourCaption index={state.tour} dispatch={dispatch} />}
                  <Legend scene={sc} place={state.place} band={state.band} display={state.display} fieldOn={state.fieldOn} t={t} nisar={state.live.nisar} dispatch={dispatch} />
                  <PlaceBody place={state.place} band={state.band} t={t} onMelody={melody} compact />
                </>
              )}
            </div>
          </section>
        )}
      </div>
      {state.modal === "about" && <AboutModal onClose={closeModal} />}
      {state.modal === "share" && <ShareModal onClose={closeModal} />}
    </div>
  );
}
