/**
 * Earth Sonification Engine (Web Audio API).
 *  Pitch: motion AWAY from the satellite (sinking, water falling) glides down to 55 Hz; motion TOWARD
 *         it (uplift, water rising) climbs to 440 Hz; stable ground = 110 Hz (A2).
 *  Hiss:  low radar coherence adds band-passed noise — you hear decorrelation.
 *  Tick:  crossing a fringe (a full 2π phase cycle) under the cursor clicks, like a Geiger counter.
 */

/** s ∈ [−1, 1] → frequency (Hz). Exported for tests. */
export function frequencyFor(s: number): number {
  const c = Math.max(-1, Math.min(1, s));
  return c < 0 ? 110 * 2 ** c : 110 * 2 ** (2 * c);
}

const TWO_PI = 2 * Math.PI;

export class Sonifier {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private osc!: OscillatorNode;
  private osc2!: OscillatorNode;
  private noiseGain!: GainNode;
  private lastPhase: number | null = null;
  on = false;

  /**
   * Phones need three things a desktop does not: the context must be created and resumed inside a tap,
   * iOS must be told this is playback (so the silent switch does not mute it), and a context the system
   * suspended (call, lock screen, tab switch) must be woken again.
   */
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      const as = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (as) as.type = "playback"; // iOS 17+: play through the silent switch
    } catch { /* not supported */ }
    const ctx = new AC();
    ctx.onstatechange = () => { if (this.on && (ctx.state as string) !== "running") void ctx.resume().catch(() => undefined); };
    document.addEventListener("visibilitychange", () => { if (!document.hidden && this.on) void ctx.resume().catch(() => undefined); });
    this.master = new GainNode(ctx, { gain: 0 });
    this.master.connect(ctx.destination);
    this.osc = new OscillatorNode(ctx, { type: "sine", frequency: 110 });
    this.osc2 = new OscillatorNode(ctx, { type: "triangle", frequency: 220 });
    const g2 = new GainNode(ctx, { gain: 0.18 });
    this.osc.connect(this.master);
    this.osc2.connect(g2).connect(this.master);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const noise = new AudioBufferSourceNode(ctx, { buffer: buf, loop: true });
    this.noiseGain = new GainNode(ctx, { gain: 0 });
    noise.connect(new BiquadFilterNode(ctx, { type: "bandpass", frequency: 2500, Q: 0.7 })).connect(this.noiseGain).connect(ctx.destination);
    this.osc.start(); this.osc2.start(); noise.start();
    this.ctx = ctx;
    return ctx;
  }

  /** Call from a tap or click. Resolves true once audio is really running (false: unsupported or blocked). */
  async start(): Promise<boolean> {
    const ctx = this.ensure();
    if (!ctx) return false;
    this.unlock(ctx);
    try { await ctx.resume(); } catch { return false; }
    if ((ctx.state as string) !== "running") return false;
    this.master.gain.setTargetAtTime(0.09, ctx.currentTime, 0.08);
    this.on = true;
    return true;
  }

  /** iOS Safari only opens the output after a buffer has been played from a gesture; a silent one does it. */
  private unlock(ctx: AudioContext): void {
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      src.start(0);
    } catch { /* ignore */ }
  }

  /** One short note for a tap on a touch screen, where there is no hover to carry a continuous tone. */
  ping(s: number, coherence: number): void {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = new OscillatorNode(ctx, { type: "sine", frequency: frequencyFor(s) });
    const o2 = new OscillatorNode(ctx, { type: "triangle", frequency: frequencyFor(s) * 2 });
    const g = new GainNode(ctx, { gain: 0.0001 });
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); o2.connect(new GainNode(ctx, { gain: 0.3 })).connect(g);
    g.connect(ctx.destination);
    o.start(t); o2.start(t); o.stop(t + 0.95); o2.stop(t + 0.95);
    if (coherence < 0.8) this.tick();
  }

  stop(): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
    this.noiseGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
    this.on = false;
    this.lastPhase = null;
  }

  update(s: number, coherence: number, phase: number): void {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    const f = frequencyFor(s);
    this.osc.frequency.setTargetAtTime(f, now, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 2, now, 0.05);
    this.noiseGain.gain.setTargetAtTime(Math.max(0, 0.9 - coherence) * 0.12, now, 0.08);
    if (this.lastPhase !== null && Math.floor(phase / TWO_PI) !== Math.floor(this.lastPhase / TWO_PI)) this.tick();
    this.lastPhase = phase;
  }

  silence(): void {
    if (!this.on || !this.ctx) return;
    this.osc.frequency.setTargetAtTime(110, this.ctx.currentTime, 0.2);
    this.noiseGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    this.lastPhase = null;
  }

  private tick(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = new OscillatorNode(ctx, { type: "square", frequency: 1800 });
    const g = new GainNode(ctx, { gain: 0.0001 });
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.06);
  }

  /** Play values ∈ [−1, 1] as a melody; resolves true when it finished, false if audio could not start. */
  async melody(values: readonly number[], onStep?: (i: number) => void): Promise<boolean> {
    const ctx = this.ensure();
    if (!ctx) return false;
    this.unlock(ctx);
    try { await ctx.resume(); } catch { return false; }
    if ((ctx.state as string) !== "running") return false;
    const dur = 0.16;
    const t0 = ctx.currentTime + 0.05;
    values.forEach((s, i) => {
      const t = t0 + i * dur;
      const o = new OscillatorNode(ctx, { type: "sine", frequency: frequencyFor(s) });
      const g = new GainNode(ctx, { gain: 0.0001 });
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.95);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + dur);
      if (onStep) window.setTimeout(() => onStep(i), (t - ctx.currentTime) * 1000);
    });
    await new Promise((r) => window.setTimeout(r, (values.length * dur + 0.1) * 1000));
    return true;
  }
}
