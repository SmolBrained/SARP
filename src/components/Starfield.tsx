"use client";
/**
 * ~400 twinkling stars behind the globe (the map canvas is transparent beyond the atmosphere).
 * Redraws at ~20 fps and only while the globe is zoomed out (MapView sets --stars on the root);
 * stays still under prefers-reduced-motion.
 */
import { useEffect, useRef } from "react";

export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current, g = cv?.getContext("2d");
    if (!cv || !g) return;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const stars = Array.from({ length: 420 }, () => ({ x: rnd(), y: rnd(), r: rnd() < 0.08 ? 1.3 : 0.7, base: 0.2 + rnd() * 0.6, period: 4000 + rnd() * 5000, phase: rnd() * 6.28 }));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const size = () => { const d = Math.min(2, window.devicePixelRatio || 1); cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d; };
    size();
    window.addEventListener("resize", size);
    let raf = 0, last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const visible = document.documentElement.style.getPropertyValue("--stars") !== "0"; // inline style: no layout read
      if (!visible || now - last < 50) return;
      last = now;
      g.clearRect(0, 0, cv.width, cv.height);
      const d = cv.width / cv.clientWidth;
      for (const s of stars) {
        const a = reduce ? s.base : s.base * (0.55 + 0.45 * Math.sin(now / s.period * 6.28 + s.phase));
        g.fillStyle = `rgba(220, 232, 255, ${a.toFixed(3)})`;
        g.beginPath(); g.arc(s.x * cv.width, s.y * cv.height, s.r * d, 0, 6.2832); g.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", size); };
  }, []);
  return <canvas ref={ref} className="stars" aria-hidden="true" />;
}
