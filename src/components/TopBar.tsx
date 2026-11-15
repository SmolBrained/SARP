"use client";
/** Top HUD: brand, place pill + searchable picker, action pills, Layers popover. */
import { memo, useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type ReactNode } from "react";
import { HOTSPOTS, HOTSPOT_BY_ID, LIVE_LAYERS, LIVE_LAYER_IDS } from "@/lib/content";
import { BANDS, BAND_IDS } from "@/lib/physics";
import { VIEW_LABEL, type Action, type AppState } from "@/lib/appState";
import { SCENES } from "@/lib/scenes";
import { VIEWS } from "@/lib/urlState";
import { VERB } from "@/lib/tour";
import { Thumb } from "./Thumb";
import { Icon } from "./Icon";
import { Tag } from "./Panel";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Closes a popover on outside pointer-down or Esc, and returns focus to its trigger. */
function useDismiss(open: boolean, refs: ReadonlyArray<React.RefObject<HTMLElement | null>>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!refs.some((r) => r.current?.contains(e.target as Node))) close(); };
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); (refs[0]?.current as HTMLElement | null)?.focus(); } };
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("pointerdown", down); window.removeEventListener("keydown", key, true); };
  }, [open, refs, close]);
}

/* ------------------------------------------------------------ place picker */
const Picker = memo(function Picker({ place, dispatch }: { place: string; dispatch: Dispatch<Action> }) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return VIEWS.map((v) => ({
      v, items: HOTSPOTS.filter((h) => h.group === v && (!needle || `${h.title} ${h.place} ${VERB[h.id] ?? ""}`.toLowerCase().includes(needle))),
    })).filter((g) => g.items.length);
  }, [q]);
  const flat = groups.flatMap((g) => g.items);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && flat[0]) { e.preventDefault(); dispatch({ type: "selectPlace", id: flat[0].id }); }
    if (e.key === "ArrowDown") { e.preventDefault(); (document.querySelector(".picker .pcard") as HTMLElement | null)?.focus(); }
  };
  const onCardKey = (e: KeyboardEvent) => {
    const cards = [...document.querySelectorAll<HTMLElement>(".picker .pcard")];
    const i = cards.indexOf(e.currentTarget as HTMLElement);
    // rows are as wide as the rendered grid (1 column on phones, 2 on desktop), not a hard-coded 2
    const grid = (e.currentTarget as HTMLElement).parentElement;
    const cols = Math.max(1, grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 2);
    const step = e.key === "ArrowDown" ? cols : e.key === "ArrowUp" ? -cols : e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = cards[i + step];
    if (next) next.focus(); else if (step < 0) input.current?.focus();
  };
  return (
    <div className="popover picker glass" role="dialog" aria-label="Choose a place">
      <label className="picker-search">
        <Icon name="search" size={18} />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search places: volcano, Miami, glacier…" aria-label="Search places" />
      </label>
      <div className="picker-body">
        {groups.map((g) => (
          <section className="picker-group" key={g.v} aria-label={VIEW_LABEL[g.v]}>
            <span className="kicker">{VIEW_LABEL[g.v]}</span>
            <div className="picker-grid">
              {g.items.map((h) => (
                <button key={h.id} className="pcard" aria-current={h.id === place} onKeyDown={onCardKey} onClick={() => dispatch({ type: "selectPlace", id: h.id })}>
                  <Thumb place={h} />
                  <span>
                    <span className="name">{h.title}</span>
                    <span className={`verb${h.memorial ? " memorial" : ""}`}>{VERB[h.id]}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {!flat.length && <p className="picker-empty">No place matches “{q}”.</p>}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------ layers */
function Switch({ checked, onChange, name, sub }: { checked: boolean; onChange: () => void; name: string; sub: ReactNode }) {
  return (
    <label className="switch-row">
      <span><span className="name">{name}</span><span className="sub">{sub}</span></span>
      <input type="checkbox" checked={checked} onChange={onChange} /><span className="sw" />
    </label>
  );
}

const LayersPop = memo(function LayersPop({ state, dispatch }: { state: Pick<AppState, "band" | "display" | "fieldOn" | "compare" | "live" | "measuredAvailable" | "measuredOn" | "basemap" | "view" | "place">; dispatch: Dispatch<Action> }) {
  const sceneId = HOTSPOT_BY_ID[state.place]?.scene;
  const hasRaster = Boolean(sceneId && SCENES[sceneId].raster); // Miami is drawn as points and towers: no fringe/displacement raster to switch
  return (
    <div className="popover layers-pop glass" role="dialog" aria-label="Layers">
      <section>
        <h3 id="lp-band">Radar band</h3>
        <div className="band-grid" role="radiogroup" aria-labelledby="lp-band">
          {BAND_IDS.map((id, i) => {
            const b = BANDS[id];
            // WAI-ARIA radio group: one tab stop (the checked band), arrows move the selection and focus
            const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
              const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              const next = BAND_IDS[(i + d + BAND_IDS.length) % BAND_IDS.length]!;
              dispatch({ type: "setBand", band: next });
              (e.currentTarget.parentElement?.children[BAND_IDS.indexOf(next)] as HTMLElement | undefined)?.focus();
            };
            return (
              <button key={id} className="band" role="radio" aria-checked={state.band === id} tabIndex={state.band === id ? 0 : -1} onKeyDown={onKey} onClick={() => dispatch({ type: "setBand", band: id })}>
                <b>{b.label}</b><span>{(b.fringe * 100).toFixed(1)} cm per cycle</span>
              </button>
            );
          })}
        </div>
        <p className="hint">Longer waves (L-band) see through leaves and stay coherent; shorter C-band fringes are denser and fall apart over vegetation.</p>
      </section>
      {state.view === "everglades" && (
        <section>
          <h3>Photo vs radar</h3>
          <Switch checked={state.compare} onChange={() => dispatch({ type: "setCompare", on: !state.compare })} name="Compare with photo" sub="Drag the divider: leaves on one side, water on the other" />
        </section>
      )}
      {hasRaster && (
        <section>
          <h3>Show as</h3>
          <div className="seg" role="group" aria-label="Show as">
            <button aria-pressed={state.display === "fringes"} onClick={() => dispatch({ type: "setDisplay", display: "fringes" })}>Colour fringes</button>
            <button aria-pressed={state.display === "displacement"} onClick={() => dispatch({ type: "setDisplay", display: "displacement" })}>Up / down map</button>
          </div>
        </section>
      )}
      {state.view !== "everglades" && (
        <section>
          <h3>Basemap</h3>
          <div className="seg" role="group" aria-label="Basemap">
            <button aria-pressed={state.basemap === "map"} onClick={() => dispatch({ type: "setBasemap", basemap: "map" })}>Dark map</button>
            <button aria-pressed={state.basemap === "satellite"} onClick={() => dispatch({ type: "setBasemap", basemap: "satellite" })}>Satellite photo</button>
          </div>
        </section>
      )}
      <section>
        <h3>Layers</h3>
        <Switch checked={state.fieldOn} onChange={() => dispatch({ type: "toggleField" })} name="Simulated interferogram" sub={<><Tag status="MODEL" />Physics model, computed in your browser</>} />
        {LIVE_LAYER_IDS.map((id) => {
          const def = LIVE_LAYERS[id], st = state.live[id];
          const sub = st.status === "searching" ? "Finding the latest pass…" : st.status === "none" ? "No recent pass here" : st.status === "ready" && st.date ? `Pass of ${st.date}` : def.agency;
          return <Switch key={id} checked={st.status !== "off"} onChange={() => dispatch({ type: "setLive", id, status: st.status === "off" ? "searching" : "off" })} name={def.title} sub={<><Tag status="LIVE" />{sub}</>} />;
        })}
        {state.measuredAvailable && <Switch checked={state.measuredOn} onChange={() => dispatch({ type: "toggleMeasured" })} name="OPERA DISP-S1 velocities" sub={<><Tag status="MEASURED" />From our Python pipeline</>} />}
      </section>
    </div>
  );
});

/* ------------------------------------------------------------ HUD */
export function TopBar({ state, dispatch, onSound }: { state: AppState; dispatch: Dispatch<Action>; onSound: () => void }) {
  const pill = useRef<HTMLButtonElement>(null);
  const pickerWrap = useRef<HTMLDivElement>(null);
  const layersBtn = useRef<HTMLButtonElement>(null);
  const layersWrap = useRef<HTMLDivElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const moreWrap = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const close = useMemo(() => () => dispatch({ type: "setPopover", popover: null }), [dispatch]);
  const pickerRefs = useMemo(() => [pill, pickerWrap], []);
  const layersRefs = useMemo(() => [layersBtn, layersWrap], []);
  const moreRefs = useMemo(() => [moreBtn, moreWrap], []);
  const closeMore = useMemo(() => () => setMoreOpen(false), []);
  useDismiss(state.popover === "places", pickerRefs, close);
  useDismiss(state.popover === "layers", layersRefs, close);
  useDismiss(moreOpen, moreRefs, closeMore);
  const h = HOTSPOT_BY_ID[state.place]!;
  const toggle = (p: "places" | "layers") => dispatch({ type: "setPopover", popover: state.popover === p ? null : p });
  return (
    <>
      <div className="topleft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <button className="brand glass" onClick={() => dispatch({ type: "setModal", modal: "about" })} aria-label="About SARPulse, the team and the math"><img src={`${BASE}/icons/logo-mark.svg`} alt="" width={30} height={30} /><span>SARPulse</span></button>
        <button ref={pill} className="pill glass" aria-haspopup="dialog" aria-expanded={state.popover === "places"} onClick={() => toggle("places")}>
          <span className="pill-text"><small>{VIEW_LABEL[state.view]} · {VERB[h.id]}</small><span>{h.title}</span></span>
          <Icon name="chevron" size={18} />
        </button>
      </div>
      {state.popover === "places" && <div ref={pickerWrap}><Picker place={state.place} dispatch={dispatch} /></div>}

      <div className="topright">
        <a className="action glass hide-sm" href={`${BASE}/`} aria-label="Back to the SARPulse story"><Icon name="arrow-left" size={18} />Story</a>
        <button className={`action glass hide-sm${state.tour === null ? " cta" : ""}`} aria-pressed={state.tour !== null} onClick={() => dispatch(state.tour !== null ? { type: "endTour" } : { type: "startTour" })}>
          <Icon name="compass" size={18} />{state.tour !== null ? "Exit tour" : "Tour"}
        </button>
        {state.view === "everglades" && (
          <button className="action glass hide-sm" aria-pressed={state.compare} onClick={() => dispatch({ type: "setCompare", on: !state.compare })}>
            <Icon name="layers" size={18} />{state.compare ? "Hide photo" : "Compare with photo"}
          </button>
        )}
        <button className="action glass hide-sm" aria-pressed={state.sound} onClick={onSound} aria-label={state.sound ? "Turn sound off" : "Hear the ground move"}>
          <span className={`bars${state.sound ? " on" : ""}`} aria-hidden="true"><i /><i /><i /><i /></span><span className="hide-sm">{state.sound ? "Sound on" : "Sound"}</span>
        </button>
        <button ref={layersBtn} className="action glass hide-sm" aria-haspopup="dialog" aria-expanded={state.popover === "layers"} onClick={() => toggle("layers")}>
          <Icon name="layers" size={18} />Layers
        </button>
        <button className="action glass hide-sm" onClick={() => dispatch({ type: "setModal", modal: "share" })} aria-label="Share: open SARPulse on a phone"><Icon name="qr" size={18} />Share</button>
        <div className="show-sm" style={{ position: "relative" }}>
          <button ref={moreBtn} className="action glass" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}><Icon name="more" />Menu</button>
          {moreOpen && (
            <div ref={moreWrap} className="popover glass menu" role="menu" style={{ top: 52, right: 0, width: 220, padding: 6, display: "grid" }}>
              {[
                { label: state.tour !== null ? "Exit tour" : "Start the tour", icon: "compass" as const, act: () => dispatch(state.tour !== null ? { type: "endTour" } : { type: "startTour" }) },
                { label: state.sound ? "Turn sound off" : "Sound: hear the ground", icon: (state.sound ? "sound-on" : "sound-off") as "sound-on" | "sound-off", act: onSound },
                { label: "Layers", icon: "layers" as const, act: () => dispatch({ type: "setPopover", popover: "layers" }) },
                { label: "Back to the story", icon: "arrow-left" as const, act: () => window.open(`${BASE}/`, "_self") },
                { label: "About and the math", icon: "info" as const, act: () => dispatch({ type: "setModal", modal: "about" }) },
                { label: "Share (QR code)", icon: "qr" as const, act: () => dispatch({ type: "setModal", modal: "share" }) },
              ].map((m) => (
                <button key={m.label} role="menuitem" className="btn ghost" style={{ justifyContent: "flex-start", color: "var(--text)" }} onClick={() => { setMoreOpen(false); m.act(); }}><Icon name={m.icon} size={17} />{m.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {state.popover === "layers" && (
        <div ref={layersWrap}>
          <LayersPop state={{ band: state.band, display: state.display, fieldOn: state.fieldOn, compare: state.compare, live: state.live, measuredAvailable: state.measuredAvailable, measuredOn: state.measuredOn, basemap: state.basemap, view: state.view, place: state.place }} dispatch={dispatch} />
        </div>
      )}
    </>
  );
}
