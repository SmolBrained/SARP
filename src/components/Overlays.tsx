"use client";
/** Map-edge overlays: dock (living legend + timeline), how-to-read guide, zoom, compare split, tooltip, toast. */
import { memo, useMemo, useRef, type Dispatch } from "react";
import { HOTSPOT_BY_ID, LIVE_LAYERS } from "@/lib/content";
import { BANDS, LOS, cyclic, type BandId } from "@/lib/physics";
import { SCENES, sample, timeSeries, type Scene } from "@/lib/scenes";
import { formatLength, formatSigned } from "@/lib/format";
import { EVENTS } from "@/lib/tour";
import { sceneOf, type Action, type AppState, type LiveState, type Speed } from "@/lib/appState";
import { useStore, type Store } from "@/lib/store";
import type { PointerInfo } from "./MapView";
import { Tag } from "./Panel";
import { Icon } from "./Icon";

/** CSS conic gradient of the exact colour map the renderer uses, so the legend ring matches the map. */
const STOPS = Array.from({ length: 25 }, (_, i) => `rgb(${cyclic((i / 24) * 2 * Math.PI).join(",")})`);
const RING = `conic-gradient(from 0deg, ${STOPS.map((c, i) => `${c} ${(i / 24) * 360}deg`).join(", ")})`;
/** The exact fringe colour map as a linear ramp: one full cycle from 0 to λ/2. */
const RAMP = `linear-gradient(90deg, ${STOPS.join(", ")})`;

/* ------------------------------------------------------------ legend */
export const Legend = memo(function Legend({ scene, place, band, display, fieldOn, t, nisar, dispatch }: {
  scene: Scene | null; place: string; band: BandId; display: AppState["display"]; fieldOn: boolean; t: number; nisar: LiveState; dispatch: Dispatch<Action>;
}) {
  const b = BANDS[band];
  const h = HOTSPOT_BY_ID[place]!;
  let body: React.ReactNode;
  if (scene && fieldOn && display === "fringes") {
    const probe = h.probe?.at ?? h.center;
    const s = sample(scene, probe[0], probe[1], t, b);
    const deg = s ? ((((s.phase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) * 180) / Math.PI : 0;
    body = (
      <>
        <span className="ring" style={{ background: RING }} aria-hidden="true" title="Phase at the marked point"><span className="needle" style={{ transform: `rotate(${deg.toFixed(1)}deg)` }} /></span>
        <span className="ramp" aria-hidden="true">
          <span className="ramp-bar" style={{ background: RAMP }} />
          <span className="ramp-ticks"><span>0</span><span>{scene.kind === "water" ? formatLength(b.fringe / LOS[2]) : formatLength(b.fringe)}</span></span>
        </span>
        <span className="legend-text">
          One colour cycle = <b>{scene.kind === "water" ? formatLength(b.fringe / LOS[2]) : formatLength(b.fringe)}</b> {scene.kind === "water" ? "of water-level change" : "toward the satellite"}
        </span>
      </>
    );
  } else if (scene && fieldOn) {
    body = (
      <>
        <span className="ramp" aria-hidden="true">
          <span className={`ramp-bar ${scene.id === "miami" ? "sink-bar" : "div-bar"}`} />
          <span className="ramp-ticks">{scene.id === "miami" ? <><span>stable</span><span>−{formatLength(scene.scale, 0)}</span></> : <><span>−{formatLength(scene.scale, 0)}</span><span>0</span><span>+{formatLength(scene.scale, 0)}</span></>}</span>
        </span>
        <span className="legend-text">{scene.id === "miami" ? <>Each dot and tower is coloured by how far it has <span className="sink">sunk</span> since 2016</> : <><span className="sink">sinking</span> ◀ 0 ▶ <span className="rise">rising</span></>}</span>
      </>
    );
  } else if (nisar.status === "ready") {
    body = (<><span className="forest-bar" aria-hidden="true" /><span className="legend-text">NISAR radar: <b>green</b> is forest, <b>dark</b> is cleared land or water</span></>);
  } else {
    body = <span className="legend-text">{scene ? "Simulation hidden: turn it on in Layers." : "Real NISAR radar of this place, streamed from NASA."}</span>;
  }
  return (
    <div className="legend-row">
      {body}
      <span className="spacer" />
      {scene && fieldOn && display === "fringes" && (
        <button className="read-btn" onClick={() => dispatch({ type: "setPopover", popover: "read" })} aria-haspopup="dialog"><Icon name="book" size={14} />How to read this</button>
      )}
      <span className="badge"><Tag status={h.status} /></span>
    </div>
  );
});

/* ------------------------------------------------------------ track */
interface Tick { readonly t: number; readonly major: boolean; readonly label?: string }
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function ticksFor(sc: Scene): Tick[] {
  const out: Tick[] = [];
  if (sc.id === "miami") for (let y = 0; y <= 10; y++) out.push({ t: y, major: y % 2 === 0, label: y % 2 === 0 ? String(2016 + y) : undefined });
  else if (sc.id === "everglades") {
    const ref = Date.UTC(2026, 3, 15);
    for (let m = 1; m <= 12; m++) {
      const d = Date.UTC(2026, 3 + m, 1), t = (d - ref) / 864e5;
      if (t <= sc.t.max) { const mo = new Date(d).getUTCMonth(); out.push({ t, major: mo % 3 === 0, label: mo % 3 === 0 ? MONTH[mo] : undefined }); }
    }
  } else if (sc.id === "iceland") for (let m = 0; m <= 16; m++) out.push({ t: m, major: m % 4 === 0, label: m % 4 === 0 ? `${m} mo` : undefined });
  else for (let d = 0; d <= 30; d++) out.push({ t: d, major: d % 5 === 0, label: d % 5 === 0 ? `day ${d}` : undefined });
  return out;
}

const Track = memo(function Track({ scene, place, band, t, dispatch }: { scene: Scene; place: string; band: BandId; t: number; dispatch: Dispatch<Action> }) {
  const span = scene.t.max - scene.t.min;
  const pct = (v: number) => `${(((v - scene.t.min) / span) * 100).toFixed(3)}%`;
  const ticks = useMemo(() => ticksFor(scene), [scene]);
  const spark = useMemo(() => {
    const h = HOTSPOT_BY_ID[place]!;
    if (!h.probe) return null;
    const pts = timeSeries(scene, h.probe.at, BANDS[band], 60).map((p) => p.value ?? 0);
    const max = Math.max(...pts.map(Math.abs)) || 1;
    const xy = pts.map((v, i) => `${((i / (pts.length - 1)) * 100).toFixed(2)},${(26 - (Math.abs(v) / max) * 20).toFixed(2)}`);
    return { line: `M${xy.join("L")}`, area: `M0,30L${xy.join("L")}L100,30Z` };
  }, [scene, place, band]);
  return (
    <div className="track">
      {spark && (
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true" style={{ height: 30 }}>
          <path d={spark.area} className="spark-area" /><path d={spark.line} className="spark-line" />
        </svg>
      )}
      <span className="rail" aria-hidden="true" />
      <span className="rail-fill" aria-hidden="true" style={{ width: pct(t) }} />
      {ticks.map((k, i) => (
        <span key={k.t} aria-hidden="true">
          <span className={`tk${k.major ? " major" : ""}`} style={{ left: pct(k.t) }} />
          {k.label && <span className={`tk-label${i === 0 || i === ticks.length - 1 ? " edge" : ""}`} style={{ left: pct(k.t) }}>{k.label}</span>}
        </span>
      ))}
      {EVENTS[scene.id].map((ev) => (
        <button key={ev.t} className="event-hit" data-label={ev.label} aria-label={`Jump to: ${ev.label}`} style={{ left: pct(ev.t) }}
          onClick={() => { dispatch({ type: "setPlaying", playing: false }); dispatch({ type: "setTime", t: ev.t }); }} />
      ))}
      <input type="range" aria-label={`Time, ${scene.t.units}`} aria-valuetext={scene.t.label(t)} min={scene.t.min} max={scene.t.max} step={scene.t.step} value={t}
        onChange={(e) => { dispatch({ type: "setPlaying", playing: false }); dispatch({ type: "setTime", t: Number(e.target.value) }); }} />
    </div>
  );
});

const NEXT_SPEED: Readonly<Record<Speed, Speed>> = { 1: 2, 2: 4, 4: 1 };

export function Timeline({ state, dispatch }: { state: AppState; dispatch: Dispatch<Action> }) {
  const h = HOTSPOT_BY_ID[state.place]!;
  const sc = h.scene ? SCENES[h.scene] : null;
  if (!sc) {
    const id = h.liveDefault ?? "nisar";
    const st = state.live[id];
    return (
      <div className="live-row">
        <Tag status="LIVE" />
        <span>
          {st.status === "ready" ? <>{LIVE_LAYERS[id].title} · pass of <span className="mono">{st.date}</span></>
            : st.status === "searching" ? "Finding the latest NISAR pass…"
            : st.status === "none" ? "No recent NISAR pass found here (or you are offline)"
            : `${LIVE_LAYERS[id].title} is off`}
        </span>
        <span className="spacer" />
        {(st.status === "off" || st.status === "none") && (
          <button className="btn sm" onClick={() => dispatch({ type: "setLive", id, status: "searching" })}>{st.status === "off" ? "Show radar" : "Try again"}</button>
        )}
      </div>
    );
  }
  const t = state.sceneT[sc.id];
  const label = sc.t.label(t);
  return (
    <div className="tl">
      <button className={`play${state.playing ? " playing" : ""}`} onClick={() => dispatch({ type: "setPlaying", playing: !state.playing })} aria-label={state.playing ? "Pause" : "Play through time"}>
        <Icon name={state.playing ? "pause" : "play"} filled size={20} />
      </button>
      <div className="date" aria-live="off"><span>{label}</span><small>{sc.id === "miami" ? "year" : sc.id === "everglades" ? "date" : sc.id === "iceland" ? "since eruption" : "tide cycle"}</small></div>
      <Track scene={sc} place={state.place} band={state.band} t={t} dispatch={dispatch} />
      <button className="speed" onClick={() => dispatch({ type: "setSpeed", speed: NEXT_SPEED[state.speed] })} aria-label={`Playback speed ${state.speed}×, change`}>{state.speed}×</button>
    </div>
  );
}

export function Dock({ state, dispatch }: { state: AppState; dispatch: Dispatch<Action> }) {
  const h = HOTSPOT_BY_ID[state.place]!;
  const sc = h.scene ? SCENES[h.scene] : null;
  return (
    <section className="dock glass" aria-label="Legend and time">
      <Legend scene={sc} place={state.place} band={state.band} display={state.display} fieldOn={state.fieldOn} t={sc ? state.sceneT[sc.id] : 0} nisar={state.live.nisar} dispatch={dispatch} />
      <Timeline state={state} dispatch={dispatch} />
    </section>
  );
}

/* ------------------------------------------------------------ how to read */
export function ReadPop({ band, water }: { band: BandId; water: boolean }) {
  const b = BANDS[band];
  const per = water ? formatLength(b.fringe / LOS[2]) : formatLength(b.fringe);
  return (
    <div className="popover read-pop glass" role="dialog" aria-labelledby="read-title">
      <h3 id="read-title">Reading an interferogram in 3 steps</h3>
      <ol className="read-steps">
        <li><span><b>Find the pattern.</b> Rings or bands of colour mean the ground moved between two radar passes. Smooth, single colour means it did not.</span></li>
        <li><span><b>Count the colour cycles</b> from the calm edge inward. The order tells direction: magenta → yellow → green → blue means moving <i>toward</i> the satellite.</span></li>
        <li><span><b>Multiply.</b> Each cycle is {per}{water ? " of water level" : ""} here, so 3 cycles ≈ {water ? formatLength((3 * b.fringe) / LOS[2]) : formatLength(3 * b.fringe)}.</span></li>
      </ol>
      <p className="hint">Method from the USGS Hawaiian Volcano Observatory guide to interferograms.</p>
    </div>
  );
}

/* ------------------------------------------------------------ zoom */
export function Zoom({ onZoom }: { onZoom: (dir: 1 | -1) => void }) {
  return (
    <div className="zoom glass" role="group" aria-label="Zoom">
      <button onClick={() => onZoom(1)} aria-label="Zoom in"><Icon name="plus" /></button>
      <button onClick={() => onZoom(-1)} aria-label="Zoom out"><Icon name="minus" /></button>
    </div>
  );
}

/* ------------------------------------------------------------ tooltip */
/** Follows the cursor with the value under it (desktop). Subscribes to its own store: no app re-render per mouse move. */
export function Tooltip({ store, leftInset }: { store: Store<PointerInfo | null>; leftInset: number }) {
  const p = useStore(store);
  if (!p || !p.sample || !p.scene || p.pinned) return null;
  const s = p.sample;
  const flip = p.x > window.innerWidth - 280;
  return (
    <div className="tooltip glass" style={{ left: p.x - leftInset + (flip ? -250 : 18), top: p.y + 18 }}>
      <div><b>{p.scene.kind === "water" ? formatSigned(s.up) : formatSigned(s.dLOS)}</b> {p.scene.kind === "water" ? "water-level change" : s.dLOS >= 0 ? "toward the satellite" : "away from the satellite"}</div>
      <div className="muted">signal quality γ = {s.coherence.toFixed(2)}</div>
    </div>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="toast glass" role="status">
      <span>{message}</span>
      <button className="icon-btn" onClick={onClose} aria-label="Dismiss"><Icon name="x" size={16} /></button>
    </div>
  );
}

/* ------------------------------------------------------------ compare split */
export function XRay({ divider, onMove, onClose }: { divider: number; onMove: (x: number) => void; onClose: () => void }) {
  const dragging = useRef(false);
  const area = useRef<HTMLDivElement>(null);
  const toX = (clientX: number) => {
    const r = area.current?.getBoundingClientRect();
    if (r) onMove((clientX - r.left) / r.width);
  };
  const pct = Math.round(divider * 100);
  return (
    <div ref={area} className="xray">
      <span className="xray-chip glass" style={{ right: `calc(${(1 - divider) * 100}% + 14px)` }}>Optical <span>only leaves</span></span>
      <span className="xray-chip glass" style={{ left: `calc(${divider * 100}% + 14px)` }}>Radar <span>water below</span></span>
      <button className="xray-done glass" onClick={onClose}>Done comparing</button>
      <div className="xray-divider" style={{ left: `${divider * 100}%` }}>
        <div className="xray-handle glass" role="slider" tabIndex={0} aria-label="Optical photo versus radar divider" aria-orientation="horizontal"
          aria-valuemin={5} aria-valuemax={95} aria-valuenow={pct} aria-valuetext={`${pct}% photo, ${100 - pct}% radar`}
          onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); }}
          onPointerMove={(e) => { if (dragging.current) toX(e.clientX); }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.2 : 0.05;
            const next = e.key === "ArrowLeft" || e.key === "ArrowDown" ? divider - step : e.key === "ArrowRight" || e.key === "ArrowUp" ? divider + step : e.key === "Home" ? 0 : e.key === "End" ? 1 : null;
            if (next !== null) { e.preventDefault(); onMove(next); }
          }}>
          <Icon name="split" size={20} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ pinned readout (desktop) */
/** A click drops a pin; this card keeps its value on screen after the cursor moves on. */
export function PinnedReadout({ state, onClear }: { state: AppState; onClear: () => void }) {
  const sc = sceneOf(state);
  if (!state.probe || !sc) return null;
  const [lat, lng] = state.probe;
  const s = sample(sc, lat, lng, state.sceneT[sc.id], BANDS[state.band]);
  return (
    <div className="pinned glass" role="status">
      <div className="pinned-main">
        <span className="kicker">Pinned · {Math.abs(lat).toFixed(4)}°{lat >= 0 ? "N" : "S"} {Math.abs(lng).toFixed(4)}°{lng >= 0 ? "E" : "W"}</span>
        {s ? (
          <span><b className="mono">{sc.kind === "water" ? formatSigned(s.up) : formatSigned(s.dLOS)}</b> {sc.kind === "water" ? "water-level change" : s.dLOS >= 0 ? "toward the satellite" : "away from the satellite"} · γ {s.coherence.toFixed(2)}</span>
        ) : <span>No radar measurement at this point.</span>}
      </div>
      <button className="icon-btn" onClick={onClear} aria-label="Remove pin"><Icon name="x" size={16} /></button>
    </div>
  );
}
