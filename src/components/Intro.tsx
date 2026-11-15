"use client";
/** First-visit cinematic intro: the logo draws itself, then two clear choices. Any key or click outside skips. */
import { useEffect, useRef, useState } from "react";

export function Intro({ onTour, onExplore }: { onTour: () => void; onExplore: () => void }) {
  const [leaving, setLeaving] = useState<null | "tour" | "explore">(null);
  const primary = useRef<HTMLButtonElement>(null);
  const done = useRef({ onTour, onExplore });
  useEffect(() => { done.current = { onTour, onExplore }; }, [onTour, onExplore]);

  useEffect(() => {
    const id = window.setTimeout(() => primary.current?.focus({ preventScroll: true }), 1500);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key === "Enter" || e.key === " ") return; // let the buttons work normally
      setLeaving((l) => l ?? "explore");
    };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(id); window.removeEventListener("keydown", onKey); };
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => (leaving === "tour" ? done.current.onTour() : done.current.onExplore()), 480);
    return () => window.clearTimeout(id);
  }, [leaving]);

  return (
    <div className={`intro${leaving ? " leaving" : ""}`} onClick={(e) => { if (!(e.target as Element).closest("button, .intro-inner")) setLeaving((l) => l ?? "explore"); }} role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="intro-inner">
        <svg className="intro-logo" viewBox="190 190 620 620" aria-hidden="true">
          <g fill="none" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round">
            <path pathLength={1} d="M 500 203 A 238 238 0 0 1 733.2 393.5" stroke="#ffffff" />
            <path pathLength={1} className="a2" d="M 500 797 A 238 238 0 0 1 266.8 606.5" stroke="#ffffff" />
            <path pathLength={1} className="s" d="M 370.1 447 A 130 130 0 0 1 624.6 404 L 689.4 404 A 193 193 0 1 0 316.2 500 L 446 500 L 473 391 L 527 609 L 554 500 L 683.8 500 A 193 193 0 1 1 310.6 596 L 375.4 596 A 130 130 0 0 0 629.9 553" stroke="#00e8ff" />
          </g>
        </svg>
        <p className="kicker intro-kicker">NASA Space Apps 2026 · Dancing with the SARs</p>
        <h1 className="intro-title" id="intro-title">Satellites can <em>feel</em> the ground move.</h1>
        <p className="intro-sub">NASA-ISRO&apos;s NISAR radar measures millimetres of motion through clouds, at night and under forest. See it, scrub through time, and hear it.</p>
        <div className="intro-actions">
          <button ref={primary} className="btn primary" onClick={() => setLeaving("tour")}>Start the 90-second tour</button>
          <button className="btn" onClick={() => setLeaving("explore")}>Explore on my own</button>
        </div>
        <p className="intro-foot">Team MCP Lead · Miami · Press any key to skip</p>
      </div>
    </div>
  );
}
