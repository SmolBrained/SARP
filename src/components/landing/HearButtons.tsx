"use client";
import { useRef, useState } from "react";
import { Sonifier, frequencyFor } from "@/lib/sonifier";
import { Icon } from "../Icon";

const RISE = Array.from({ length: 20 }, (_, i) => Math.tanh((i / 19) * 1.6));
const SINK = RISE.map((v) => -v);

/** Two one-tap listens that work on every device: a volcano lifting and ground sinking. */
export function HearButtons() {
  const son = useRef<Sonifier | null>(null);
  const [busy, setBusy] = useState<"rise" | "sink" | null>(null);
  const [msg, setMsg] = useState("");
  const play = async (kind: "rise" | "sink") => {
    if (busy) return;
    if (!son.current) son.current = new Sonifier();
    setBusy(kind); setMsg("");
    const ok = await son.current.melody(kind === "rise" ? RISE : SINK);
    setBusy(null);
    if (!ok) setMsg("Sound could not start. Check your volume and the silent switch, then tap again.");
  };
  return (
    <div className="lp-hear">
      <div className="lp-hear-row">
        <button className="btn" onClick={() => void play("rise")} aria-pressed={busy === "rise"}><Icon name="music" /> Hear ground rising</button>
        <button className="btn" onClick={() => void play("sink")} aria-pressed={busy === "sink"}><Icon name="music" /> Hear ground sinking</button>
      </div>
      <p className="lp-note">Rising climbs toward {Math.round(frequencyFor(1))} Hz, sinking falls toward {Math.round(frequencyFor(-1))} Hz.</p>
      {msg && <p className="lp-note" role="status">{msg}</p>}
    </div>
  );
}
