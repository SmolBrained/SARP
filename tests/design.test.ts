import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Design guardrails: the defaults that make an interface read as machine-generated (overused typefaces,
 * monospace numerals, neon halos, purple, gradient text) are banned in the stylesheet, so they cannot creep back.
 */
const css = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");

describe("design guardrails", () => {
  it("uses no overused AI-default typefaces", () => {
    for (const f of ["Inter", "Space Grotesk", "JetBrains Mono", "Plus Jakarta", "Geist", "Syne", "Roboto"]) {
      expect(css.includes(f) || layout.includes(f), f).toBe(false);
    }
  });
  it("sets figures as figures: no monospace family anywhere", () => {
    expect(css).not.toMatch(/monospace|--mono|ui-monospace/);
    expect(layout).not.toMatch(/mono/i);
  });
  it("has no glow halos, gradient text or violet", () => {
    expect(css).not.toMatch(/text-shadow/);
    expect(css).not.toMatch(/background-clip:\s*text/);
    expect(css).not.toMatch(/violet|purple|#b69cff/i);
    expect(css).not.toMatch(/box-shadow:[^;]*0 0 (1[0-9]|[2-9][0-9])px[^;]*(cyan|rgba\(0, 232, 255)/);
  });
});
