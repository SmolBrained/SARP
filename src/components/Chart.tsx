"use client";
import { memo, useId } from "react";

export interface Series { readonly name: string; readonly values: ReadonlyArray<number | null>; readonly color: string; readonly dashed?: boolean }

function niceTicks(lo: number, hi: number, n = 3): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi < lo) [lo, hi] = [hi, lo];
  const span = Math.max(hi - lo, 1e-6);
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 && out.length < 20; v += step) out.push(Math.abs(v) < 1e-9 ? 0 : v);
  return out;
}

/** Dependency-free SVG chart: area under the main series, a glowing "now" cursor synced to the timeline. */
export const Chart = memo(function Chart({ series, labels, cursor, unit }: { series: readonly Series[]; labels: readonly string[]; cursor: number; unit: string }) {
  const gid = useId().replace(/:/g, "");
  const W = 340, H = 110, padL = 34, padR = 8, padT = 8, padB = 20;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const n = labels.length - 1 || 1;
  const x = (i: number) => padL + ((W - padL - padR) * i) / n;
  const y = (v: number) => padT + ((H - padT - padB) * (hi - v)) / (hi - lo);
  const pts = (vals: ReadonlyArray<number | null>) => vals.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
  const line = (vals: ReadonlyArray<number | null>) => {
    let d = "", pen = false;
    for (const p of pts(vals)) { if (!p) { pen = false; continue; } d += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`; pen = true; }
    return d;
  };
  const main = series[0];
  const mainPts = main ? pts(main.values).filter((p): p is readonly [number, number] => p !== null) : [];
  const area = mainPts.length > 1 ? `M${mainPts[0]![0]},${y(0)}L${mainPts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}L${mainPts[mainPts.length - 1]![0]},${y(0)}Z` : "";
  const c = Math.min(1, Math.max(0, cursor));
  const cx = padL + (W - padL - padR) * c;
  // value of the main series at the cursor (linear interpolation)
  let cy: number | null = null;
  if (main) {
    const fi = c * n, i0 = Math.floor(fi), i1 = Math.min(n, i0 + 1);
    const a = main.values[i0], b = main.values[i1];
    if (a != null && b != null) cy = y(a + (b - a) * (fi - i0));
  }
  const xt = [0, Math.round(n / 2), n];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={`Time series of ${unit}`}>
      <defs>
        <linearGradient id={`a${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={main?.color ?? "#fff"} stopOpacity="0.32" />
          <stop offset="1" stopColor={main?.color ?? "#fff"} stopOpacity="0" />
        </linearGradient>
      </defs>
      {niceTicks(lo, hi).map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="grid" strokeDasharray={t === 0 ? undefined : "2 4"} />
          <text x={padL - 6} y={y(t) + 3} className="axis" textAnchor="end">{Number(t.toPrecision(3))}</text>
        </g>
      ))}
      {xt.map((i, k) => <text key={i} x={x(i)} y={H - 4} className="axis" textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}>{labels[i]}</text>)}
      {area && <path d={area} fill={`url(#a${gid})`} />}
      {series.map((s) => { const d = line(s.values); return d ? <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeDasharray={s.dashed ? "5 4" : undefined} /> : null; })}
      <line x1={cx} x2={cx} y1={padT} y2={H - padB} stroke="rgba(255,255,255,.35)" strokeDasharray="2 3" />
      {cy !== null && <circle cx={cx} cy={cy} r={4.5} fill="#fff" stroke={main?.color} strokeWidth={2.5} style={{ filter: `drop-shadow(0 0 6px ${main?.color})` }} />}
    </svg>
  );
});
