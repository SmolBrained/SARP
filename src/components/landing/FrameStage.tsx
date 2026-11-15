"use client";
/**
 * The home-page globe as a flipbook. Every picture was rendered once by scripts/capture-frames.mjs, so a visitor's
 * browser only draws images: no map tiles, no 3D, no loading. Scrolling to a new chapter plays the pictures
 * between the two chapters; at the top, the orbit-sweep loop plays.
 */
import { useEffect, useRef } from "react";
import { frameName, loopName, type Manifest } from "@/lib/framePath";
import type { ChapterId } from "./chapters";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const FPS = 15;
const LOOP_FPS = 12;

export function FrameStage({ chapter, manifest, variant }: { chapter: ChapterId; manifest: Manifest; variant: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const goal = useRef(manifest.anchors[chapter] ?? 0);
  useEffect(() => { goal.current = manifest.anchors[chapter] ?? 0; }, [chapter, manifest]);

  useEffect(() => {
    const canvas = cv.current, g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const dir = `${BASE}/frames/${variant}`;
    const flight = new Map<number, HTMLImageElement>();
    const loop = new Map<number, HTMLImageElement>();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dead = false, raf = 0, pos = goal.current, last = 0, loopAt = 0, hold = 0, dirty = true;

    // load order: the opening picture, every chapter's still, the loop, then the flights in order
    const order: Array<[Map<number, HTMLImageElement>, number, string]> = [];
    const anchorIdx = Object.values(manifest.anchors).sort((a, b) => a - b);
    for (const i of anchorIdx) order.push([flight, i, frameName(i, manifest.ext)]);
    for (let k = 0; k < manifest.loop; k++) order.push([loop, k, loopName(k, manifest.ext)]);
    for (let i = 0; i < manifest.count; i++) if (!anchorIdx.includes(i)) order.push([flight, i, frameName(i, manifest.ext)]);
    const pump = async (): Promise<void> => {
      for (let n = order.shift(); n && !dead; n = order.shift()) {
        const [store, i, file] = n;
        const img = new Image();
        img.decoding = "async";
        img.src = `${dir}/${file}`;
        try { await img.decode(); store.set(i, img); dirty = true; } catch { /* a missing picture is skipped: the nearest loaded one stands in */ }
      }
    };
    void Promise.all([pump(), pump(), pump(), pump()]);

    const size = (): void => { const d = Math.min(1.5, window.devicePixelRatio || 1); canvas.width = Math.round(window.innerWidth * d); canvas.height = Math.round(window.innerHeight * d); dirty = true; };
    size();
    window.addEventListener("resize", size);

    const nearest = (map: Map<number, HTMLImageElement>, want: number): HTMLImageElement | undefined => {
      for (let d = 0; d < manifest.count; d++) { const a = map.get(want - d) ?? map.get(want + d); if (a) return a; }
      return undefined;
    };
    const draw = (img: HTMLImageElement): void => {
      const cw = canvas.width, ch = canvas.height, s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      g.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    };

    const frame = (ts: number): void => {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
      last = ts;
      const target = goal.current;
      if (pos !== target) {
        if (reduced) pos = target;
        else {
          const dist = Math.abs(target - pos), speed = Math.max(FPS, dist / 1.6); // long jumps hurry, so they never take over 1.6 s
          pos += Math.sign(target - pos) * Math.min(dist, speed * dt);
        }
        dirty = true;
      }
      const atTop = Math.abs(pos - (manifest.anchors.top ?? 0)) < 0.5 && target === pos;
      if (atTop && !reduced && manifest.loop > 0) {
        if (hold > 0) hold -= dt;
        else { loopAt += LOOP_FPS * dt; if (loopAt >= manifest.loop) { loopAt = 0; hold = 1.4; } dirty = true; }
      } else loopAt = 0;
      if (!dirty) return;
      dirty = false;
      const img = atTop && manifest.loop > 0 && !reduced ? (nearest(loop, Math.floor(loopAt)) ?? nearest(flight, Math.round(pos))) : nearest(flight, Math.round(pos));
      if (img) draw(img);
    };
    raf = requestAnimationFrame(frame);
    return () => { dead = true; cancelAnimationFrame(raf); window.removeEventListener("resize", size); };
  }, [manifest, variant]);

  return (
    <>
      <canvas ref={cv} className="lp-frames" aria-hidden="true" />
      <p className="lp-credit">Map © OpenStreetMap contributors · OpenFreeMap · Natural Earth · NASA</p>
    </>
  );
}
