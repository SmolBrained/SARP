/// <reference lib="webworker" />
/**
 * Field worker: prepares each scene's spatial bases once, then paints frames on request and hands
 * them back as ImageBitmaps (zero-copy transfer; MapLibre uploads them straight to the GPU).
 * Only the newest request matters, so stale ones are dropped while a frame is being painted.
 */
import { paint, prepare, type Prepared, type Reveal } from "../lib/fieldRaster";
import type { BandId } from "../lib/physics";
import type { DisplayMode, SceneId } from "../lib/scenes";

declare const self: DedicatedWorkerGlobalScope;

export interface FrameRequest { readonly seq: number; readonly scene: SceneId; readonly t: number; readonly band: BandId; readonly display: DisplayMode; readonly reveal?: Reveal }
export type FrameResponse =
  | { readonly seq: number; readonly scene: SceneId; readonly error: string }
  | { readonly seq: number; readonly scene: SceneId; readonly extent: readonly [number, number, number, number]; readonly bitmap: ImageBitmap }
  | { readonly seq: number; readonly scene: SceneId; readonly extent: readonly [number, number, number, number]; readonly pixels: Uint8ClampedArray; readonly width: number; readonly height: number };

const prepared = new Map<SceneId, Prepared>();
const surfaces = new Map<SceneId, { canvas: OffscreenCanvas | null; ctx: OffscreenCanvasRenderingContext2D | null; img: ImageData | null; buf: Uint8ClampedArray }>();
let pending: FrameRequest | null = null;
let busy = false;

function run(req: FrameRequest): void {
  let p = prepared.get(req.scene);
  if (!p) { p = prepare(req.scene); prepared.set(req.scene, p); }
  let s = surfaces.get(req.scene);
  if (!s) {
    const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(p.width, p.height) : null;
    const ctx = canvas?.getContext("2d") ?? null;
    const img = ctx ? ctx.createImageData(p.width, p.height) : null;
    s = { canvas, ctx, img, buf: img ? img.data : new Uint8ClampedArray(p.width * p.height * 4) };
    surfaces.set(req.scene, s);
  }
  paint(p, req.t, req.band, req.display, s.buf, req.reveal);
  if (s.canvas && s.ctx && s.img) {
    s.ctx.putImageData(s.img, 0, 0);
    const bitmap = s.canvas.transferToImageBitmap();
    self.postMessage({ seq: req.seq, scene: req.scene, extent: p.extent, bitmap } satisfies FrameResponse, [bitmap]);
  } else {
    const pixels = s.buf.slice();
    self.postMessage({ seq: req.seq, scene: req.scene, extent: p.extent, pixels, width: p.width, height: p.height } satisfies FrameResponse, [pixels.buffer]);
  }
}

function pump(): void {
  if (busy || !pending) return;
  const req = pending;
  pending = null;
  busy = true;
  try { run(req); }
  catch (e) { self.postMessage({ seq: req.seq, scene: req.scene, error: e instanceof Error ? e.message : String(e) } satisfies FrameResponse); }
  finally { busy = false; }
  if (pending) setTimeout(pump, 0);
}

self.onmessage = (e: MessageEvent<FrameRequest>) => { pending = e.data; pump(); };

export {};
