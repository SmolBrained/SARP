"use client";
/** Interactive "phase becomes motion" demo: lift a patch of ground, change the radar band, watch the fringes. */
import { useEffect, useMemo, useRef, useState } from "react";
import { BANDS, BAND_IDS, cyclicInto, phaseFromLOS, type BandId, type RGB } from "@/lib/physics";
import { Sonifier } from "@/lib/sonifier";
import { Icon } from "../Icon";

const N = 220;

export function FringeDemo() {
  const cv = useRef<HTMLCanvasElement>(null);
  const [band, setBand] = useState<BandId>("nisar-l");
  const [cm, setCm] = useState(12);
  const [sound, setSound] = useState(false);
  const son = useRef<Sonifier | null>(null);
  const b = BANDS[band];
  const fringes = useMemo(() => (2 * (cm / 100)) / b.lambda, [cm, b.lambda]);

  useEffect(() => {
    const c = cv.current, g = c?.getContext("2d");
    if (!c || !g) return;
    const img = g.createImageData(N, N), rgb: RGB = [0, 0, 0];
    const d = cm / 100; // peak uplift, metres toward the satellite
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x - N / 2) / (N * 0.26), v = (y - N / 2) / (N * 0.26);
      const motion = d * Math.exp(-(u * u + v * v)); // a smooth bulge, e.g. a volcano filling
      const phi = phaseFromLOS(motion, b.lambda);
      cyclicInto(phi, rgb);
      const i = (y * N + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, [band, cm, b.lambda]);

  useEffect(() => {
    const s = son.current;
    if (!sound || !s) return;
    s.update(Math.min(1, cm / 30), 1, 0);
  }, [sound, cm]);
  useEffect(() => () => son.current?.stop(), []);

  const toggleSound = () => {
    if (!son.current) son.current = new Sonifier();
    if (sound) { son.current.stop(); setSound(false); } else if (son.current.start()) { son.current.update(Math.min(1, cm / 30), 1, 0); setSound(true); }
  };

  return (
    <div className="lp-demo glass">
      <div className="lp-demo-art">
        <canvas ref={cv} width={N} height={N} role="img" aria-label={`Interferogram of a ${cm} cm uplift seen by ${b.label}: ${fringes.toFixed(1)} colour cycles`} />
        <span className="lp-demo-cap">{fringes.toFixed(1)} colour cycles</span>
      </div>
      <div className="lp-demo-ctl">
        <label className="lp-field">
          <span>Ground lifts toward the satellite <b>{cm} cm</b></span>
          <input type="range" min={0} max={30} step={1} value={cm} onChange={(e) => setCm(Number(e.target.value))} aria-label="Uplift in centimetres" />
        </label>
        <div className="lp-field">
          <span>Radar band <b>{b.label}</b></span>
          <div className="seg" role="group" aria-label="Radar band">
            {BAND_IDS.map((id) => (
              <button key={id} aria-pressed={id === band} onClick={() => setBand(id)}>{BANDS[id].mission.split("-")[0]} {BANDS[id].cls}</button>
            ))}
          </div>
        </div>
        <p className="lp-demo-read">One colour cycle means <b>{(b.fringe * 100).toFixed(1)} cm</b> of motion at {b.label}. Shorter waves, more cycles.</p>
        <button className="btn" onClick={toggleSound} aria-pressed={sound}><Icon name={sound ? "sound-on" : "sound-off"} /> {sound ? "Stop the sound" : "Hear it"}</button>
      </div>
    </div>
  );
}
