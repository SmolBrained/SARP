/** Key numbers for a place, computed from the same model the map draws (so they always agree). */
import type { Hotspot } from "./content";
import { BANDS, LOS, coherence, type Band } from "./physics";
import { miamiRate, sample, type Scene } from "./scenes";
import { formatLength, formatSigned } from "./format";

export interface Metric { readonly label: string; readonly value: string; readonly note: string }

export function metricsFor(h: Hotspot, sc: Scene | null, b: Band, t: number): Metric[] {
  if (!sc || !h.probe) {
    return [
      { label: "Data", value: "NISAR GCOV", note: "Live from NASA GIBS" },
      { label: "Wavelength", value: `${(BANDS["nisar-l"].lambda * 100).toFixed(1)} cm`, note: "L-band, HH and HV" },
      { label: "Revisit", value: "12 days", note: "Ascending and descending passes" },
    ];
  }
  const s = sample(sc, h.probe.at[0], h.probe.at[1], t, b);
  const out: Metric[] = [];
  out.push(sc.kind === "water"
    ? { label: "Water level Δh", value: formatSigned(s?.up ?? 0), note: h.probe.label }
    : { label: "Toward satellite", value: formatSigned(s?.dLOS ?? 0), note: h.probe.label });
  if (sc.id === "miami") {
    const rate = miamiRate(h.probe.at[0], h.probe.at[1], t) * LOS[2] * 1000;
    out.push({ label: "Rate now", value: `${Math.abs(rate) < 0.05 ? "0.0" : `${rate > 0 ? "+" : "−"}${Math.abs(rate).toFixed(1)}`} mm/yr`, note: sc.t.label(t) });
  } else if (sc.id === "iceland") {
    out.push({ label: "Uplift rate", value: "+20 mm/mo", note: "Icelandic Met Office, 2026" });
  } else {
    out.push({ label: "Fringes", value: Math.abs((s?.dLOS ?? 0) / b.fringe).toFixed(1), note: `At ${b.cls}-band` });
  }
  const g = coherence(sc.surface, b);
  out.push({ label: "Signal quality γ", value: g.toFixed(2), note: g > 0.6 ? "Clean fringes" : g > 0.4 ? "Noisy fringes" : "Signal decorrelating" });
  out.push(sc.kind === "water"
    ? { label: "One fringe", value: formatLength(b.fringe / LOS[2]), note: "Of water-level change" }
    : { label: "One fringe", value: formatLength(b.fringe), note: "Of motion toward the satellite" });
  return out;
}
