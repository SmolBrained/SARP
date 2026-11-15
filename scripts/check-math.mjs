/** Typesets every $…$ / $$…$$ formula in the Markdown docs with MathJax and fails on any TeX error. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
const a = liteAdaptor(); RegisterHTMLHandler(a);
const doc = mathjax.document("", { InputJax: new TeX({ packages: AllPackages, formatError: (_, e) => { throw e; } }), OutputJax: new SVG() });
let n = 0, bad = 0;
/** cmd.exe does not expand globs, so directories and a trailing "*.md" are expanded here (same result on every OS). */
function expand(arg) {
  const dir = arg.endsWith("*.md") ? arg.slice(0, -4).replace(/[\\/]$/, "") || "." : arg;
  if (arg === dir && !statSync(arg).isDirectory()) return [arg];
  return readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => join(dir, f));
}
for (const f of process.argv.slice(2).flatMap(expand)) {
  const s = readFileSync(f, "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let m;
  while ((m = re.exec(s))) {
    const tex = m[1] ?? m[2]; n++;
    try { const node = doc.convert(tex, { display: !!m[1] }); if (a.innerHTML(node).includes("merror")) throw new Error("merror"); }
    catch (e) { bad++; console.log(`${f}: ${tex.slice(0, 60)} -> ${e.message}`); }
  }
}
console.log(`math: checked ${n} formulas in the docs, ${bad} errors`);
if (bad) process.exit(1);
