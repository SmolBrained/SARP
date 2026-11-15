"use client";
/* eslint-disable @next/next/no-img-element -- static export with unoptimised images */
/** Floating capsule navigation: hidden at the very top, glides in once you scroll past the hero. */
import type { ChapterId } from "./chapters";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const LINKS: ReadonlyArray<readonly [ChapterId, string]> = [["why", "Why radar"], ["math", "The idea"], ["miami", "Places"], ["hear", "Hear it"], ["act", "Act"], ["guide", "How to use it"]];

export function CapsuleNav({ shown, active }: { shown: boolean; active: ChapterId }) {
  const group = (id: ChapterId) => (id === "everglades" || id === "iceland" || id === "world" ? "miami" : id);
  return (
    <nav className={`lp-nav glass${shown ? " shown" : ""}`} aria-label="Site" aria-hidden={!shown} inert={!shown}>
      <a className="lp-nav-brand" href="#top" aria-label="SARPulse, back to the top"><img src={`${BASE}/icons/logo-mark.svg`} alt="" width={28} height={28} /><span>SARPulse</span></a>
      <ul>
        {LINKS.map(([id, label]) => (
          <li key={id}><a href={`#${id}`} className={group(active) === id ? "on" : ""} aria-current={group(active) === id ? "true" : undefined}>{label}</a></li>
        ))}
      </ul>
      <a className="btn primary sm" href={`${BASE}/explore/`}>Open the viewer</a>
    </nav>
  );
}
