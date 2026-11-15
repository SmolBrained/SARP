"use client";
/**
 * The fixed 3D globe behind the landing page. Scrolling changes the active chapter and the camera flies
 * there; at the very top the Earth turns slowly and a NISAR ground track sweeps across it. Tiles are the
 * same OpenFreeMap + Natural Earth basemap as the viewer, so the service-worker cache is shared.
 */
import { DEM_TILES } from "@/lib/prefetch";
import { useEffect, useRef, useState } from "react";
import type * as ML from "maplibre-gl";
import "@/styles/maplibre.css";
import VENDOR from "@/lib/vendor.json";
import { buildStyle } from "@/lib/mapStyle";
import { closestProgress, nisarTrack } from "@/lib/orbit";
import { offlineFallback } from "@/lib/offlineLand";
import { HOTSPOTS } from "@/lib/content";
import { paddingFor, timeline } from "@/lib/framePath";
import { addRadar, type Radar } from "./radar";
import { CAMERAS, TERRAIN_CHAPTERS, type Cam, type ChapterId } from "./chapters";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** Free space beside the text card: left/right on wide screens, above the card on narrow ones. */
function padFor(side: Cam["side"]): ML.PaddingOptions {
  const w = window.innerWidth, h = window.innerHeight, none = { top: 0, bottom: 0, left: 0, right: 0 };
  if (w < 961) return side === "center" ? none : { ...none, bottom: Math.round(h * 0.5) };
  if (side === "left") return { ...none, left: Math.round(w * 0.44) };
  if (side === "right") return { ...none, right: Math.round(w * 0.44) };
  return none;
}
const reduced = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const gradient = (p: number, a: number): ML.ExpressionSpecification => {
  const tail = Math.max(0, p - 0.2), head = Math.max(p, 0.0002), end = Math.min(1, head + 0.0001);
  return ["interpolate", ["linear"], ["line-progress"], 0, "rgba(238,243,255,0)", ...(tail > 0 ? [tail, "rgba(238,243,255,0)"] : []), head, `rgba(238,243,255,${a})`, ...(end > head ? [end, "rgba(238,243,255,0)"] : []), 1, "rgba(238,243,255,0)"] as unknown as ML.ExpressionSpecification;
};

export function GlobeStage({ chapter, onReady }: { chapter: ChapterId; onReady?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<ML.Map | null>(null);
  const cur = useRef<ChapterId>(chapter);
  const spin = useRef(true);
  const [noGl, setNoGl] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { cur.current = chapter; }, [chapter]);

  useEffect(() => {
    let disposed = false, raf = 0, radar: Radar | null = null;
    const capture = new URLSearchParams(window.location.search).has("capture"); // scripts/capture-frames.mjs drives the camera itself
    void (async () => {
      const lf = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${BASE}${VENDOR.maplibre}`)) as typeof ML;
      if (disposed || !box.current) return;
      const c0 = CAMERAS.top;
      let m: ML.Map;
      try {
        m = new lf.Map({
          container: box.current, style: buildStyle(), center: [...c0.center], zoom: c0.zoom, pitch: 0, bearing: 0,
          interactive: false, pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5), fadeDuration: capture ? 0 : 150, maxPitch: 70, attributionControl: capture ? false : { compact: true },
        });
      } catch { setNoGl(true); return; } // no WebGL (blocked, or a software renderer): show pictures instead of a blank page
      map.current = m;
      m.setPadding(padFor(c0.side));
      offlineFallback(m);
      m.on("load", () => {
        if (disposed) return;
        m.addSource("dem", { type: "raster-dem", tiles: [DEM_TILES], tileSize: 256, maxzoom: 12, encoding: "terrarium" });
        setReady(true);
        let lng0 = -74, track = nisarTrack(lng0);
        const feat = (): GeoJSON.Feature => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track.coords } });
        m.addSource("track", { type: "geojson", lineMetrics: true, data: feat() });
        m.addLayer({ id: "track-swath", type: "line", source: "track", layout: { "line-cap": "round" }, paint: { "line-width": 34, "line-blur": 14, "line-gradient": gradient(0, 0.16) } });
        m.addLayer({ id: "track-line", type: "line", source: "track", layout: { "line-cap": "round" }, paint: { "line-width": 1.6, "line-gradient": gradient(0, 0.9) } });
        radar = addRadar(m);
        const stars = (): void => document.documentElement.style.setProperty("--stars", m.getZoom() < 5.5 ? "1" : "0");
        m.on("zoomend", stars); stars();
        const pins: { id: string; el: HTMLElement; p: number }[] = [];
        for (const h of HOTSPOTS) {
          const e = document.createElement("span");
          e.className = "lp-pin";
          new lf.Marker({ element: e, anchor: "center", opacityWhenCovered: "0" }).setLngLat([h.center[1], h.center[0]]).addTo(m);
          pins.push({ id: h.id, el: e, p: closestProgress(track, h.center[0], h.center[1]) });
        }
        const c = CAMERAS[cur.current];
        if (cur.current !== "top") m.jumpTo({ center: [...c.center] as [number, number], zoom: c.zoom, pitch: c.pitch, bearing: c.bearing, padding: padFor(c.side) }); // scrolled before the globe was ready
        onReady?.();
        if (capture) {
          // scripts/capture-frames.mjs drives the camera and the sweep itself, one picture at a time
          const sweep = (p: number): void => {
            const fade = Math.max(0, 1 - Math.max(0, p - 1) * 4.5);
            m.setPaintProperty("track-line", "line-gradient", gradient(Math.min(1, p), 0.9 * fade));
            m.setPaintProperty("track-swath", "line-gradient", gradient(Math.min(1, p), 0.16 * fade));
          };
          (window as unknown as { __sarp?: unknown }).__sarp = { map: m, timeline: timeline(), paddingFor, sweep, radar };
          return;
        }
        if (reduced()) return;
        const SWEEP = 3200, GAP = 1600;
        const pinged = new Set<string>();
        let last = 0, t0 = 0;
        const frame = (ts: number) => {
          raf = requestAnimationFrame(frame);
          if (last && spin.current && !m.isMoving() && cur.current === "top") { const c = m.getCenter(); m.setCenter([c.lng + ((ts - last) / 1000) * 3.2, c.lat]); }
          last = ts;
          if (cur.current !== "top" && cur.current !== "why") return;
          if (!t0) t0 = ts;
          const k = (ts - t0) / SWEEP;
          if (k <= 1.25) {
            const p = Math.min(1.22, k), fade = Math.max(0, 1 - Math.max(0, p - 1) * 4.5);
            m.setPaintProperty("track-line", "line-gradient", gradient(Math.min(1, p), 0.9 * fade));
            m.setPaintProperty("track-swath", "line-gradient", gradient(Math.min(1, p), 0.16 * fade));
            for (const q of pins) if (!pinged.has(q.id) && p >= q.p) { pinged.add(q.id); q.el.classList.remove("ping"); void q.el.offsetWidth; q.el.classList.add("ping"); } // each place pings as the swath passes
          } else if (ts - t0 > SWEEP * 1.25 + GAP) {
            lng0 -= 24.3; track = nisarTrack(lng0); t0 = ts; pinged.clear();
            for (const q of pins) { const h = HOTSPOTS.find((x) => x.id === q.id)!; q.p = closestProgress(track, h.center[0], h.center[1]); }
            (m.getSource("track") as ML.GeoJSONSource | undefined)?.setData(feat());
          }
        };
        raf = requestAnimationFrame(frame);
      });
    })();
    return () => { disposed = true; cancelAnimationFrame(raf); radar?.dispose(); map.current?.remove(); map.current = null; };
  }, [onReady]);

  useEffect(() => {
    const m = map.current;
    if (!m || new URLSearchParams(window.location.search).has("capture")) return;
    const c = CAMERAS[chapter];
    spin.current = chapter === "top";
    const lift = () => { try { m.setTerrain(TERRAIN_CHAPTERS.has(chapter) ? { source: "dem", exaggeration: 1.7 } : null); } catch { /* terrain is a bonus: stay flat if this build or device cannot do it */ } };
    const go = () => {
      lift();
      const opts = { center: [...c.center] as [number, number], zoom: c.zoom, pitch: c.pitch, bearing: c.bearing, padding: padFor(c.side) };
      if (reduced()) m.jumpTo(opts);
      else m.flyTo({ ...opts, duration: 3200, curve: 1.5, essential: true });
    };
    if (m.loaded() || m.isStyleLoaded()) go(); else m.once("load", go);
  }, [chapter, ready]);

  const poster = `${BASE}/img/${chapter === "miami" || chapter === "act" || chapter === "honest" ? "miami" : chapter === "everglades" ? "everglades" : chapter === "iceland" || chapter === "hear" ? "iceland" : "globe"}.jpg`;
  return <div ref={box} className={`lp-globe${noGl ? " nogl" : ""}`} data-ch={chapter} aria-hidden="true" style={noGl ? { backgroundImage: `url(${poster})` } : undefined} />;
}
