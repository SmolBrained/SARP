/**
 * Typesets src/lib/equations.json with MathJax (TeX → SVG) at build time, so the app ships finished
 * vector equations: no MathJax runtime, no network, no layout shift. Output: src/data/equations.svg.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
let mj;
try {
  mj = {
    ...(await import("mathjax-full/js/mathjax.js")), ...(await import("mathjax-full/js/input/tex.js")), ...(await import("mathjax-full/js/output/svg.js")),
    ...(await import("mathjax-full/js/adaptors/liteAdaptor.js")), ...(await import("mathjax-full/js/handlers/html.js")), ...(await import("mathjax-full/js/input/tex/AllPackages.js")),
  };
} catch {
  // a machine without `npm install` keeps the committed, already-typeset equations
  console.log(existsSync(new URL("src/data/equations.svg.json", root)) ? "math: MathJax not installed, keeping typeset equations" : "math: run `npm install` first");
  process.exit(0);
}
const { mathjax, TeX, SVG, liteAdaptor, RegisterHTMLHandler, AllPackages } = mj;
const eqs = JSON.parse(readFileSync(new URL("src/lib/equations.json", root), "utf8"));
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document("", { InputJax: new TeX({ packages: AllPackages }), OutputJax: new SVG({ fontCache: "none" }) });

const out = {};
for (const e of eqs) {
  const node = doc.convert(e.tex, { display: true });
  const svg = adaptor.innerHTML(node).replace(/<svg /, `<svg aria-label="${e.title}" `);
  out[e.id] = svg;
}
writeFileSync(new URL("src/data/equations.svg.json", root), JSON.stringify(out));
console.log(`math: typeset ${eqs.length} equations`);
