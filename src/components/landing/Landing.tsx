"use client";
/* eslint-disable @next/next/no-img-element -- static export with unoptimised images */
/** SARPulse home: a scroll-driven story over a live 3D globe, ending at the viewer (/explore). */
import { useEffect, useRef, useState } from "react";
import "@/styles/landing.css";
import eq from "@/data/equations.svg.json";
import { ACTIONS, STEPS, TIERS } from "@/lib/triad";
import { prefetchTourTiles } from "@/lib/prefetch";
import { Icon } from "../Icon";
import { Tag } from "../Panel";
import { viewerHref, type ChapterId } from "./chapters";
import { CapsuleNav } from "./CapsuleNav";
import { FringeDemo } from "./FringeDemo";
import { AsfPanel } from "../AsfPanel";
import { HearButtons } from "./HearButtons";
import { Starfield } from "../Starfield";
import { GlobeStage } from "./GlobeStage";
import { FrameStage } from "./FrameStage";
import type { Manifest } from "@/lib/framePath";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const REPO = "https://github.com/SmolBrained/SARP";

function Go({ id, children }: { id: string; children: React.ReactNode }) {
  return <a className="btn primary" href={viewerHref(BASE, id)}>{children} <Icon name="arrow-right" /></a>;
}

export default function Landing() {
  const [active, setActive] = useState<ChapterId>("top");
  // Pre-rendered pictures when they exist (npm run frames), the live 3D globe when they do not
  const [stage, setStage] = useState<{ mode: "probing" } | { mode: "live" } | { mode: "frames"; manifest: Manifest; variant: "desktop" | "mobile" }>({ mode: "probing" });
  useEffect(() => {
    const variant = window.innerWidth < 961 ? "mobile" : "desktop";
    const capture = new URLSearchParams(window.location.search).has("capture"); // the capture script needs the live map
    let dead = false;
    (capture ? Promise.reject(new Error("capture")) : fetch(`${BASE}/frames/${variant}/manifest.json`))
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : Promise.reject(new Error("no frames"))))
      .then((manifest) => { if (!dead && manifest.v === 1 && manifest.count > 0) setStage({ mode: "frames", manifest, variant }); else if (!dead) setStage({ mode: "live" }); })
      .catch(() => { if (!dead) setStage({ mode: "live" }); });
    return () => { dead = true; };
  }, []);
  const [scrolled, setScrolled] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-chapter]") ?? []);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.chapter as ChapterId);
    }, { rootMargin: "-45% 0px -50% 0px" });
    els.forEach((el) => io.observe(el));
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.55);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    void prefetchTourTiles();
    void navigator.storage?.persist?.().catch(() => undefined); // ask the browser not to evict the cached map
    if ("serviceWorker" in navigator && window.location.protocol === "https:") void navigator.serviceWorker.register(`${BASE}/sw.js`).catch(() => undefined);
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);

  const phaseEq = (eq as Record<string, string>).phase ?? "";

  return (
    <div ref={root} className="lp" id="top">
      {stage.mode === "live" && <Starfield />}
      {stage.mode === "live" && <GlobeStage chapter={active} />}
      {stage.mode === "frames" && <FrameStage chapter={active} manifest={stage.manifest} variant={stage.variant} />}
      <div className="lp-shade" aria-hidden="true" />
      <CapsuleNav shown={scrolled} active={active} />

      <header className="lp-sec lp-hero" data-chapter="top">
        <div className="lp-hero-in">
          <img className="lp-hero-logo" src={`${BASE}/icons/logo-mark.svg`} alt="" width={76} height={84} />
          <p className="kicker">NASA Space Apps 2026 · Dancing with the SARs · Miami</p>
          <h1>Hear the Earth <em>move</em>.</h1>
          <p className="lp-lede">NASA-ISRO&apos;s NISAR radar measures millimetres of ground motion through clouds, at night and under forest. SARPulse lets you see it, scrub through time, and hear it.</p>
          <div className="lp-cta">
            <a className="btn primary lg" href={`${BASE}/explore/`}>Open the viewer <Icon name="arrow-right" /></a>
            <a className="btn lg" href="#why">Scroll the story</a>
          </div>
          <dl className="lp-orbit" aria-label="The NISAR satellite">
            <div><dt>Orbit</dt><dd>747 km</dd></div>
            <div><dt>Swath</dt><dd>242 km</dd></div>
            <div><dt>Repeat</dt><dd>12 days</dd></div>
            <div><dt>L-band</dt><dd>24 cm</dd></div>
            <div><dt>S-band</dt><dd>9.4 cm</dd></div>
          </dl>
        </div>
        <a className="lp-scroll" href="#why" aria-label="Scroll to the story"><span /></a>
      </header>

      <section id="why" className="lp-sec" data-chapter="why" aria-labelledby="why-h">
        <div className="lp-card glass">
          <p className="kicker">Why radar</p>
          <h2 id="why-h">A camera needs daylight. Radar brings its own.</h2>
          <p>Synthetic aperture radar sends microwaves down and listens to the echo. It works at night, sees through clouds, and, at L-band, reaches the trunks and water under a forest canopy.</p>
          <ul className="lp-facts">
            <li><b>Night and cloud</b><span>Optical satellites go blind. Radar does not.</span></li>
            <li><b>Under the trees</b><span>The 23.8 cm L-band wave slips past leaves to the water below.</span></li>
            <li><b>Millimetres</b><span>Comparing the phase of two passes reveals motion far smaller than a pixel.</span></li>
          </ul>
        </div>
      </section>

      <section id="math" className="lp-sec lp-wide" data-chapter="math" aria-labelledby="math-h">
        <div className="lp-card glass">
          <p className="kicker">The idea</p>
          <h2 id="math-h">Phase becomes motion.</h2>
          <p>Two passes over the same ground differ in phase by Δφ. That phase is a ruler: it turns directly into motion along the line of sight, and one full colour cycle is half a wavelength.</p>
          <div className="lp-eq" role="img" aria-label="d sub LOS equals lambda over 4 pi times delta phi" dangerouslySetInnerHTML={{ __html: phaseEq }} />
        </div>
        <FringeDemo />
      </section>

      <section id="miami" className="lp-sec" data-chapter="miami" aria-labelledby="miami-h">
        <div className="lp-card glass">
          <Tag status="MODEL" />
          <h2 id="miami-h">Miami is sinking in places you can name.</h2>
          <p className="lp-big">2–8 cm</p>
          <p>35 coastal high-rises between Sunny Isles Beach and Miami Beach sank this much between 2016 and 2023, mostly while they were being built (Aziz Zanjani et al., 2024). In SARPulse each radar reflection glows by how far it sank, and at street zoom the real buildings rise in 3D.</p>
          <Go id="miami-coast">See Miami in the viewer</Go>
          <img className="lp-peek" src={`${BASE}/img/miami.jpg`} alt="The viewer showing Miami's coastal high-rises coloured by how far each has sunk since 2016" width={1200} height={750} loading="lazy" />
        </div>
      </section>

      <section id="everglades" className="lp-sec lp-right" data-chapter="everglades" aria-labelledby="eg-h">
        <div className="lp-card glass">
          <Tag status="MODEL" />
          <h2 id="eg-h">Water moves under the sawgrass.</h2>
          <p className="lp-big">14.9 cm</p>
          <p>In wetlands the radar bounces off the water and then the stems, so a change in water level shortens the path. One L-band fringe is about 15 cm of water, the same number FIU measured, for a restoration plan worth roughly USD 23 billion.</p>
          <Go id="everglades">Open the Everglades</Go>
          <img className="lp-peek" src={`${BASE}/img/everglades.jpg`} alt="The viewer showing the Everglades water-level interferogram in the Shark River Slough" width={1200} height={750} loading="lazy" />
        </div>
      </section>

      <section id="iceland" className="lp-sec" data-chapter="iceland" aria-labelledby="ice-h">
        <div className="lp-card glass">
          <Tag status="MODEL" />
          <h2 id="ice-h">A volcano breathes in.</h2>
          <p className="lp-big">~2 cm / month</p>
          <p>Magma refilling about 4 km beneath Svartsengi, Iceland, lifts the ground in rings. Switch the band and the rings tighten four times over: that is the trade-off between L, S and C waves in one gesture.</p>
          <Go id="iceland">Watch it rise</Go>
          <img className="lp-peek" src={`${BASE}/img/iceland.jpg`} alt="The viewer showing the Svartsengi volcano interferogram with magenta, yellow and green fringes" width={1200} height={750} loading="lazy" />
        </div>
      </section>

      <section id="world" className="lp-sec lp-right" data-chapter="world" aria-labelledby="world-h">
        <div className="lp-card glass">
          <h2 id="world-h">And the rest of the planet.</h2>
          <p>Tides flex the floating ice of Thwaites Glacier in Antarctica. In Rondônia, Brazil, live NISAR imagery streamed from NASA shows forest turning to pasture. The viewer starts on the globe and flies you to each one.</p>
          <div className="lp-row"><Tag status="LIVE" /><Tag status="MODEL" /><Tag status="MEASURED" /></div>
        </div>
      </section>

      <section id="hear" className="lp-sec lp-right" data-chapter="hear" aria-labelledby="hear-h">
        <div className="lp-card glass">
          <p className="kicker">Hear it</p>
          <h2 id="hear-h">Listen to the ground.</h2>
          <p>Motion away from the satellite lowers the pitch to 55 Hz, motion toward it raises it to 440 Hz, every fringe you cross clicks, and noisy phase adds hiss. Move across a volcano and you can hear where it lifts.</p>
          <div className="lp-pitch" aria-hidden="true"><i style={{ height: "28%" }} /><i style={{ height: "44%" }} /><i style={{ height: "60%" }} /><i style={{ height: "78%" }} /><i style={{ height: "100%" }} /></div>
          <HearButtons />
          <p className="lp-note">Or turn on <b>Sound</b> in the viewer. On a phone, tap the map to hear that spot.</p>
        </div>
      </section>

      <section id="act" className="lp-sec lp-wide" data-chapter="act" aria-labelledby="act-h">
        <div className="lp-card glass">
          <p className="kicker">Beyond the map</p>
          <h2 id="act-h">Detect, predict, act.</h2>
          <p>A map of where the ground already moved is only the start. The goal is to find the places that are moving now and get them to the people who can fix them.</p>
          <ol className="lp-triad">
            {STEPS.map((s, i) => <li key={s.id}><span>{i + 1}</span><div><b>{s.title}</b><p>{s.text}</p></div></li>)}
          </ol>
          <h3 className="lp-sub">Triage tiers <Tag status="INFO" /></h3>
          <ul className="lp-tiers">
            {TIERS.map((t) => <li key={t.id} data-tier={t.id}><b>{t.name}</b><em>{t.range}</em><p>{t.response}</p></li>)}
          </ul>
          <h3 className="lp-sub">What people could do</h3>
          <ul className="lp-acts">
            {ACTIONS.map((a) => <li key={a.id}><small>{a.where}</small><b>{a.title}</b><p>{a.text}</p></li>)}
          </ul>
          <p className="lp-note">The tiers are a proposal for discussion, not an engineering standard. At Surfside, radar saw no settlement before the 2021 collapse, so SARPulse is a screening aid for inspectors, never a substitute for them.</p>
        </div>
      </section>

      <section id="data" className="lp-sec lp-wide" data-chapter="data" aria-labelledby="data-h">
        <div className="lp-card glass">
          <p className="kicker">Get the data</p>
          <h2 id="data-h">Where the radar lives.</h2>
          <AsfPanel />
        </div>
      </section>

      <section id="guide" className="lp-sec lp-wide" data-chapter="guide" aria-labelledby="guide-h">
        <div className="lp-card glass">
          <p className="kicker">Your first minute</p>
          <h2 id="guide-h">How to use the viewer.</h2>
          <ol className="lp-steps">
            <li><span>1</span><div><b>Take the 90-second tour</b><p>The Tour button flies through five places with captions. Swipe or use the arrow keys.</p></div></li>
            <li><span>2</span><div><b>Pick a place</b><p>The place menu lists every site. Each shows a live thumbnail of its radar field.</p></div></li>
            <li><span>3</span><div><b>Play and scrub</b><p>Drag the timeline. Rings multiply as the ground moves. Orange markers flag real events.</p></div></li>
            <li><span>4</span><div><b>Change the radar</b><p>Layers switches band (L, S, C), basemap and NASA live layers. Compare with photo splits optical against radar.</p></div></li>
            <li><span>5</span><div><b>Turn Sound on</b><p>On a computer, hover across the map. On a phone, tap any spot to hear it.</p></div></li>
          </ol>
          <div className="lp-cta"><a className="btn primary lg" href={`${BASE}/explore/`}>Open the viewer <Icon name="arrow-right" /></a></div>
        </div>
        <img className="lp-phone" src={`${BASE}/img/phone.jpg`} alt="SARPulse on a phone: Miami high-rises with a draggable bottom sheet" width={390} height={844} loading="lazy" />
      </section>

      <section id="honest" className="lp-sec" data-chapter="honest" aria-labelledby="honest-h">
        <div className="lp-card glass">
          <p className="kicker">Honest by design</p>
          <h2 id="honest-h">Every layer says what it is.</h2>
          <dl className="lp-tags">
            <div><dt><Tag status="LIVE" /></dt><dd>Real NASA imagery streamed from GIBS: NISAR L-band, OPERA Sentinel-1 backscatter and water maps.</dd></div>
            <div><dt><Tag status="MODEL" /></dt><dd>Interferograms computed in your browser from physics, calibrated to published studies. They teach; they are not processed NISAR pairs.</dd></div>
            <div><dt><Tag status="MEASURED" /></dt><dd>OPERA DISP-S1 velocities extracted by our Python pipeline.</dd></div>
            <div><dt><Tag status="INFO" /></dt><dd>Context with sources. At Surfside, radar saw no settlement before the 2021 collapse, so we present it as a screening tool for inspectors, never a predictor.</dd></div>
          </dl>
        </div>
      </section>

      <footer className="lp-foot">
        <div>
          <b>SARPulse</b> · Team MCP Lead (Miami Coral Park): Adrian Gomez, Jose Unanue · NASA Space Apps 2026 · Dancing with the SARs
        </div>
        <div className="lp-foot-links">
          <a href={`${BASE}/explore/`}>Viewer</a>
          <a href={REPO} target="_blank" rel="noopener noreferrer">Source on GitHub</a>
          <a href="https://www.earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA Earthdata</a>
        </div>
        <p>Data: NASA GIBS, NASA JPL OPERA, ASF DAAC, ISRO, ESA, CONAE. Basemap © OpenStreetMap contributors via OpenFreeMap; Natural Earth. Built with the help of Claude (Anthropic); the team directed, tested and can explain every part. MIT licence.</p>
      </footer>
    </div>
  );
}
