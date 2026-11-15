"use client";
/** Place card (desktop left pane, phone sheet body) and the guided-tour caption. */
import { memo, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { HOTSPOT_BY_ID, REFS, type Status } from "@/lib/content";
import { BANDS, type BandId } from "@/lib/physics";
import { SCENES, timeSeries } from "@/lib/scenes";
import { metricsFor, type Metric } from "@/lib/metrics";
import { CHAPTERS } from "@/lib/tour";
import type { Action } from "@/lib/appState";
import { Chart, type Series } from "./Chart";
import { Icon } from "./Icon";

export const Tag = ({ status }: { status: Status | "MEASURED" }) => <span className={`tag ${status.toLowerCase()}`}>{status === "MODEL" ? "Simulated" : status === "INFO" ? "Context" : status}</span>;

/** Formats like "−28.3 mm" split into number + unit so the unit can be styled smaller. */
function splitValue(v: string): [string, string] {
  const m = /^([+\-−]?[\d.,]+)\s*(.*)$/.exec(v);
  return m ? [m[1]!, m[2]!] : [v, ""];
}

/** Odometer-style count-up when the place changes; follows playback values instantly. */
function Ticker({ value, animateKey }: { value: string; animateKey: string }) {
  const [num, unit] = splitValue(value);
  const target = Number(num.replace("−", "-").replace(/,/g, ""));
  const [shown, setShown] = useState<string | null>(null);
  const prevKey = useRef<string | null>(null); // null: count up on first mount too
  useEffect(() => {
    if (prevKey.current === animateKey || !Number.isFinite(target) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { prevKey.current = animateKey; return; }
    prevKey.current = animateKey;
    const decimals = (num.split(".")[1] ?? "").length;
    const sign = num.startsWith("+") ? "+" : "";
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 650);
      const e = 1 - Math.pow(1 - p, 3);
      const v = target * e;
      setShown(p >= 1 ? null : `${v < 0 ? "−" : sign}${Math.abs(v).toFixed(decimals)}`);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animateKey, target, num]);
  return <>{shown ?? num}{unit && <small>{unit}</small>}</>;
}

/** One hero number (the place's headline measurement) and the rest as quiet rows: no boxes, no truncation. */
export const Metrics = memo(function Metrics({ metrics, animateKey }: { metrics: readonly Metric[]; animateKey: string }) {
  const [hero, ...rest] = metrics;
  if (!hero) return null;
  return (
    <div className="metrics">
      <div className="hero-metric">
        <div className={`hero-value${/^[−+-]?\d/.test(hero.value) ? "" : " words"}`}><Ticker value={hero.value} animateKey={animateKey} /></div>
        <div className="hero-caption"><b>{hero.label}</b> · {hero.note}</div>
      </div>
      <dl className="metric-rows">
        {rest.slice(0, 3).map((m) => (
          <div key={m.label} className="metric-row">
            <dt>{m.label}<small>{m.note}</small></dt>
            <dd><Ticker value={m.value} animateKey={animateKey} /></dd>
          </div>
        ))}
      </dl>
    </div>
  );
});

export function kickerFor(place: string): string {
  const h = HOTSPOT_BY_ID[place]!;
  const [lat, lng] = h.center;
  const ll = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? "E" : "W"}`;
  return `${ll} · ${h.status === "LIVE" ? "NISAR L-band · live" : h.status === "INFO" ? "Context" : "InSAR model"}`;
}

interface CardProps { place: string; band: BandId; t: number; onMelody: () => void; compact?: boolean }

/** Everything about one place. `compact` drops the title (the phone sheet shows it in its header). */
export const PlaceBody = memo(function PlaceBody({ place, band, t, onMelody, compact = false }: CardProps) {
  const h = HOTSPOT_BY_ID[place]!;
  const sc = h.scene ? SCENES[h.scene] : null;
  const b = BANDS[band];
  const [more, setMore] = useState(false);
  const [prevPlace, setPrevPlace] = useState(place);
  if (prevPlace !== place) { setPrevPlace(place); setMore(false); }
  const chart = useMemo(() => {
    if (!sc || !h.probe) return null;
    const k = sc.kind === "water" || sc.id === "thwaites" ? 100 : 1000;
    const unit = sc.kind === "water" ? "cm of water level" : sc.id === "thwaites" ? "cm toward satellite" : "mm toward satellite";
    const conv = (v: number | null) => (v === null ? null : v * k);
    const s1 = timeSeries(sc, h.probe.at, b);
    const series: Series[] = [{ name: h.probe.label, values: s1.map((p) => conv(p.value)), color: "#00e8ff" }];
    if (h.probe2) series.push({ name: h.probe2.label, values: timeSeries(sc, h.probe2.at, b).map((p) => conv(p.value)), color: "#ffb547", dashed: true });
    return { series, labels: s1.map((p) => p.label), unit };
  }, [sc, h, b]);
  const metrics = metricsFor(h, sc, b, t);
  return (
    <>
      {!compact && (
        <>
          <div className="card-head"><span className="kicker">{kickerFor(place)}</span></div>
          <h1 className="card-name" id="place-title">{h.title}</h1>
        </>
      )}
      <p className="card-hook">{h.headline}</p>
      <Metrics metrics={metrics} animateKey={place} />
      {chart && sc && (
        <section className="spark" aria-label="Change over time">
          <div className="spark-head">
            <h3 style={{ margin: 0 }}>{chart.unit}</h3>
            {chart.series.length > 1 && (
              <div className="spark-legend">{chart.series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
            )}
          </div>
          <Chart series={chart.series} labels={chart.labels} cursor={(t - sc.t.min) / (sc.t.max - sc.t.min)} unit={chart.unit} />
        </section>
      )}
      {chart && (
        <div className="card-actions">
          <button className="btn sm" onClick={onMelody}><Icon name="music" size={16} />Hear this place</button>
        </div>
      )}
      <section className="why" aria-label="Why it matters">
        <button className="why-toggle" aria-expanded={more} onClick={() => setMore(!more)}>
          <span>Why it matters</span><Icon name="chevron" size={16} />
        </button>
        {more && (
          <>
            <p>{h.body}</p>
            <p className="radar-note"><b>How radar sees it.</b> {h.radarNote}</p>
            <div className="sources">
              <h3>Sources</h3>
              <ol>{h.refs.map((k) => <li key={k}><a href={REFS[k].url} target="_blank" rel="noopener noreferrer">{REFS[k].short}</a></li>)}</ol>
            </div>
          </>
        )}
      </section>
    </>
  );
});

export function TourCaption({ index, dispatch }: { index: number; dispatch: Dispatch<Action> }) {
  const ch = CHAPTERS[index]!;
  const last = index === CHAPTERS.length - 1;
  const swipe = useRef<number | null>(null);
  return (
    <section className="tour" aria-live="polite" aria-labelledby="tour-title" key={index}
      onTouchStart={(e) => { swipe.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const x0 = swipe.current, x1 = e.changedTouches[0]?.clientX;
        swipe.current = null;
        if (x0 === null || x1 === undefined || Math.abs(x1 - x0) < 40) return; // a swipe, not a tap
        const next = index + (x1 < x0 ? 1 : -1);
        if (next >= 0 && next < CHAPTERS.length) dispatch({ type: "tourGo", index: next });
      }}>
      <div className="tour-top">
        <span className="kicker">{String(index + 1).padStart(2, "0")} / {String(CHAPTERS.length).padStart(2, "0")} · {ch.label}</span>
        <div className="dots" role="group" aria-label="Tour chapters">
          {CHAPTERS.map((c, i) => (
            <button key={c.place} aria-label={`Chapter ${i + 1}: ${c.label}`} aria-current={i === index ? "step" : undefined} className={i < index ? "done" : undefined} onClick={() => dispatch({ type: "tourGo", index: i })} />
          ))}
        </div>
      </div>
      <h2 id="tour-title">{ch.title}</h2>
      <p>{ch.text}</p>
      <div className="tour-actions">
        <button className="btn sm ghost" onClick={() => dispatch({ type: "endTour" })}>Exit tour</button>
        <span className="spacer" />
        {index > 0 && <button className="btn sm" onClick={() => dispatch({ type: "tourGo", index: index - 1 })} aria-label="Previous chapter"><Icon name="arrow-left" size={16} /></button>}
        <button className="btn sm primary" onClick={() => dispatch(last ? { type: "endTour" } : { type: "tourGo", index: index + 1 })}>
          {last ? "Explore on my own" : <>Next<Icon name="arrow-right" size={16} /></>}
        </button>
      </div>
    </section>
  );
}

export function PlaceCard({ place, band, t, tour, dispatch, onMelody }: CardProps & { tour: number | null; dispatch: Dispatch<Action> }) {
  return (
    <aside className="card glass" aria-labelledby="place-title" key={place}>
      {tour !== null && <TourCaption index={tour} dispatch={dispatch} />}
      <div className="card-scroll">
        <PlaceBody place={place} band={band} t={t} onMelody={onMelody} />
      </div>
    </aside>
  );
}
