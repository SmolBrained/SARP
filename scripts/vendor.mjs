/**
 * Self-hosts MapLibre GL JS: copies its ES-module build (main + worker) and stylesheet from
 * node_modules into public/vendor/maplibre-<version>/ and src/styles/. The version comes from the
 * installed package, so the vendored copy is always the pinned dependency, served from our own
 * origin (no CDN, works offline once cached). If node_modules is missing but the vendored files
 * exist (e.g. a machine that has not run `npm install` yet), it leaves them as they are.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const pkg = new URL("node_modules/maplibre-gl/package.json", root);
const vendorRoot = new URL("public/vendor/", root);
if (!existsSync(pkg)) {
  console.log(existsSync(vendorRoot) ? "vendor: node_modules missing, keeping vendored MapLibre" : "vendor: run `npm install` first");
  process.exit(0);
}
const { version } = JSON.parse(readFileSync(pkg, "utf8"));
const dir = new URL(`maplibre-${version}/`, vendorRoot);
if (existsSync(vendorRoot)) for (const d of readdirSync(vendorRoot)) if (d.startsWith("maplibre-") && d !== `maplibre-${version}`) rmSync(new URL(d, vendorRoot), { recursive: true });
mkdirSync(dir, { recursive: true });
for (const f of ["maplibre-gl.mjs", "maplibre-gl-worker.mjs"]) copyFileSync(new URL(`node_modules/maplibre-gl/dist/${f}`, root), new URL(f, dir));
copyFileSync(new URL("node_modules/maplibre-gl/LICENSE.txt", root), new URL("LICENSE.txt", dir));
mkdirSync(new URL("src/styles/", root), { recursive: true });
copyFileSync(new URL("node_modules/maplibre-gl/dist/maplibre-gl.css", root), new URL("src/styles/maplibre.css", root));
writeFileSync(new URL("src/lib/vendor.json", root), JSON.stringify({ maplibre: `/vendor/maplibre-${version}/maplibre-gl.mjs` }, null, 2) + "\n");
console.log(`vendor: MapLibre ${version}`);
