"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import qrcode from "qrcode-generator";
import { REFS } from "@/lib/content";
import { BANDS, BAND_IDS, LOS } from "@/lib/physics";
import { Tag } from "./Panel";
import { Icon } from "./Icon";
import EQUATIONS from "@/lib/equations.json";
import SVG_RAW from "@/data/equations.svg.json";

const SVG = SVG_RAW as Readonly<Record<string, string>>;

function Modal({ id, title, narrow, onClose, children }: { id: string; title: string; narrow?: boolean; onClose: () => void; children: ReactNode }) {
  const close = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  /* Runs once per opening: focus moves in, Tab is trapped, Esc closes, focus returns on close. */
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const f = box.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      const first = f[0], last = f[f.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); prev?.focus(); };
  }, []);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className={`modal-box glass${narrow ? " narrow" : ""}`}>
        <div className="modal-head"><h2 id={`${id}-title`}>{title}</h2><button ref={close} className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className={`modal-body${narrow ? " center" : ""}`}>{children}</div>
      </div>
    </div>
  );
}

export function ShareModal({ onClose }: { onClose: () => void }) {
  const [url] = useState(() => (typeof window === "undefined" ? "" : (window.location.href.split("#")[0] ?? "")));
  const local = /^file:|\/\/(localhost|127\.0\.0\.1)/.test(url);
  let svg = "";
  if (url && !local) { const q = qrcode(0, "M"); q.addData(url); q.make(); svg = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); }
  return (
    <Modal id="share" title="Open SARPulse on a phone" narrow onClose={onClose}>
      {/* the SVG is generated locally from this page's own URL */}
      <div className="qr" {...(svg ? { dangerouslySetInnerHTML: { __html: svg } } : {})}>{!svg && <p>Deploy the site and this QR code will point to its public link.</p>}</div>
      <p className="mono" style={{ wordBreak: "break-all", fontSize: 12.5 }}><a href={url}>{url}</a></p>
      <p>No login and no install.</p>
    </Modal>
  );
}

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal id="about" title="About SARPulse" onClose={onClose}>
      <p style={{ color: "var(--text)", fontSize: 15 }}>SARPulse lets anyone see, scrub through time and hear how the ground and water move, using NASA-ISRO NISAR radar. Radar works at night, through clouds and through leaves, and it measures millimetres.</p>
      <h3>What is real and what is simulated</h3>
      <ul>
        <li><Tag status="LIVE" /> Real NASA radar imagery streamed from NASA GIBS: NISAR L-band GCOV, OPERA Sentinel-1 backscatter, OPERA radar water maps.</li>
        <li><Tag status="MODEL" /> Interferograms computed in your browser from physics models (volcanic source, tidal flexure, building creep, wetland double bounce), calibrated to the studies below. They explain InSAR; they are not processed NISAR interferograms.</li>
        <li><Tag status="MEASURED" /> Optional OPERA DISP-S1 velocities from our Python pipeline (NASA Earthdata login).</li>
        <li><Tag status="INFO" /> Context with sources, no data layer.</li>
      </ul>
      <h3>The math</h3>
      <div className="eq-grid">
        {EQUATIONS.map((e) => (
          <div className="eq" key={e.id}>
            <span className="kicker">{e.title}</span>
            {/* typeset at build time by MathJax (scripts/build-math.mjs) from src/lib/equations.json */}
            <div className="tex" dangerouslySetInnerHTML={{ __html: SVG[e.id] ?? "" }} />
            <p>{e.note}</p>
          </div>
        ))}
      </div>
      <table className="tbl"><thead><tr><th>Band</th><th>λ</th><th>Cycle (motion)</th><th>Cycle (water)</th></tr></thead>
        <tbody>{BAND_IDS.map((id) => { const b = BANDS[id]; return <tr key={id}><td>{b.label}</td><td className="num">{(b.lambda * 100).toFixed(1)} cm</td><td className="num">{(b.fringe * 100).toFixed(1)} cm</td><td className="num">{((b.fringe / LOS[2]) * 100).toFixed(1)} cm</td></tr>; })}</tbody></table>
      <h3>The sound</h3>
      <p>Turn on sound and move over the map: sinking ground lowers the pitch toward 55 Hz, rising ground raises it toward 440 Hz, every fringe you cross clicks, and low coherence adds hiss.</p>
      <h3>Team</h3>
      <p>MCP Lead (Miami Coral Park): Adrian Gomez and Jose Unanue. NASA Space Apps Challenge 2026, Miami. Challenge: Dancing with the SARs. MIT License. Basemap © OpenFreeMap and © OpenStreetMap contributors; satellite photo © Esri; radar imagery NASA GIBS / ESDIS, OPERA, ESA Copernicus Sentinel-1; Natural Earth.</p>
      <h3>Sources</h3>
      <ol style={{ paddingLeft: 18, display: "grid", gap: 6, fontSize: 13 }}>{Object.entries(REFS).map(([k, r]) => <li key={k}><a href={r.url} target="_blank" rel="noopener noreferrer">{r.short}</a>: {r.text}</li>)}</ol>
    </Modal>
  );
}
