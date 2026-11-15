/**
 * The home-page globe flight as a fixed list of camera positions. The capture script renders each one once
 * (scripts/capture-frames.mjs) and the page plays the pictures back, so nobody's browser has to draw the 3D map.
 * Pure maths, shared by the capture script and the player.
 */
import { CAMERAS, CHAPTER_IDS, type Cam, type ChapterId } from "@/components/landing/chapters";

/** Pictures per flight between two chapters. About a second of motion at 14 frames per second. */
export const LEG_FRAMES = 14;

export interface FrameCam { readonly center: readonly [number, number]; readonly zoom: number; readonly pitch: number; readonly bearing: number; readonly from: Cam["side"]; readonly to: Cam["side"]; readonly t: number }
export interface Timeline { readonly cams: readonly FrameCam[]; readonly anchors: Readonly<Record<ChapterId, number>> }

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const wrap = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;
const ease = (t: number): number => t * t * (3 - 2 * t);

/** Camera t of the way (0..1) from chapter camera a to b: a smooth arc that rises and falls like a flight. */
export function legCam(a: Cam, b: Cam, t: number): FrameCam {
  const e = ease(t);
  const dLng = wrap(b.center[0] - a.center[0]), dLat = b.center[1] - a.center[1];
  const dist = Math.hypot(dLng, dLat);
  const bump = Math.min(2.4, dist / 30) * Math.sin(Math.PI * t); // zoom out on long hops
  return {
    center: [wrap(a.center[0] + dLng * e), a.center[1] + dLat * e],
    zoom: Math.max(0.8, lerp(a.zoom, b.zoom, e) - bump),
    pitch: lerp(a.pitch, b.pitch, e),
    bearing: a.bearing + wrap(b.bearing - a.bearing) * e,
    from: a.side, to: b.side, t: e,
  };
}

/** Every frame in order: chapter 0 still, flight, chapter 1 still, flight, ... and where each chapter sits. */
export function timeline(order: readonly ChapterId[] = CHAPTER_IDS, cams: Readonly<Record<ChapterId, Cam>> = CAMERAS, legFrames = LEG_FRAMES): Timeline {
  const out: FrameCam[] = [];
  const anchors = {} as Record<ChapterId, number>;
  order.forEach((id, i) => {
    const c = cams[id];
    anchors[id] = out.length;
    out.push({ center: c.center, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing, from: c.side, to: c.side, t: 1 });
    const next = order[i + 1];
    if (next) for (let k = 1; k <= legFrames; k++) out.push(legCam(c, cams[next], k / (legFrames + 1)));
  });
  return { cams: out, anchors };
}

/** Free space beside the text card, in pixels, blended between the two chapters' sides. */
export function paddingFor(from: Cam["side"], to: Cam["side"], t: number, w: number, h: number): { top: number; bottom: number; left: number; right: number } {
  const one = (side: Cam["side"]) => {
    const none = { top: 0, bottom: 0, left: 0, right: 0 };
    if (w < 961) return side === "center" ? none : { ...none, bottom: Math.round(h * 0.5) };
    if (side === "left") return { ...none, left: Math.round(w * 0.44) };
    if (side === "right") return { ...none, right: Math.round(w * 0.44) };
    return none;
  };
  const a = one(from), b = one(to);
  return { top: Math.round(lerp(a.top, b.top, t)), bottom: Math.round(lerp(a.bottom, b.bottom, t)), left: Math.round(lerp(a.left, b.left, t)), right: Math.round(lerp(a.right, b.right, t)) };
}

/**
 * Bump when what the pictures show changes (rev 2: radar layers baked in). A set with an older or missing rev is ignored,
 * so a visitor never gets stale bare-map pictures; the page uses the next set or the live globe instead.
 * scripts/capture-frames.mjs writes the same number: keep them equal (tests/landing.test.ts checks).
 */
export const FRAME_REV = 2;

export interface Manifest { readonly v: 1; readonly rev?: number; readonly w: number; readonly h: number; readonly ext: string; readonly count: number; readonly loop: number; readonly anchors: Readonly<Record<string, number>> }
export const frameName = (i: number, ext: string): string => `f${String(i).padStart(4, "0")}.${ext}`;
export const loopName = (i: number, ext: string): string => `l${String(i).padStart(4, "0")}.${ext}`;

/**
 * The sizes the flipbook is rendered at. Each one is framed for its own screen shape (the text card sits beside the globe on
 * wide screens and below it on narrow ones), so the landmark stays in the free space instead of being cropped or hidden.
 * `narrow` follows the same 961 px rule as paddingFor, so a capture and a visitor agree about where the card is.
 */
export const FRAME_VARIANTS = {
  phone: { w: 540, h: 960, narrow: true },
  "tablet-portrait": { w: 768, h: 1024, narrow: true },
  "tablet-landscape": { w: 1024, h: 768, narrow: false },
  desktop: { w: 1280, h: 720, narrow: false },
  wide: { w: 1720, h: 720, narrow: false },
} as const;
export type FrameVariant = keyof typeof FRAME_VARIANTS;
export const FRAME_VARIANT_IDS = Object.keys(FRAME_VARIANTS) as FrameVariant[];

/** Candidates for a screen, best first: same side of the 961 px line, then closest shape (by log aspect ratio). */
export function variantsFor(width: number, height: number): FrameVariant[] {
  const narrow = width < 961, ratio = Math.log(width / Math.max(1, height));
  const dist = (v: FrameVariant): number => Math.abs(Math.log(FRAME_VARIANTS[v].w / FRAME_VARIANTS[v].h) - ratio);
  const rank = (v: FrameVariant): number => (FRAME_VARIANTS[v].narrow === narrow ? 0 : 10) + dist(v);
  return [...FRAME_VARIANT_IDS].sort((a, b) => rank(a) - rank(b));
}
