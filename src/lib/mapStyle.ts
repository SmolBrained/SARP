/**
 * SARPulse basemap: OpenFreeMap vector tiles (OpenStreetMap data, no API key) drawn in the logo's
 * palette, with Natural Earth shaded relief so the globe reads as terrain from space.
 *
 * Layer order is the design: radar data sits ABOVE land but BELOW the water polygons, so the exact
 * OpenStreetMap coastline masks every field at any zoom (radar has no signal over open water), and
 * roads and labels float above the data for context.
 */
import type { StyleSpecification, ExpressionSpecification } from "maplibre-gl";

export const OFM = "https://tiles.openfreemap.org";
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
export const IMAGERY_TILES = `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`;

/** Data layers are inserted directly below this layer id. */
export const DATA_ANCHOR = "water";

export const PALETTE = {
  space: "#04060d",
  land: "#16213d",
  landHi: "#22315a",
  water: "#091632",
  line: "#1c2742",
  road: "rgba(150, 172, 220, 0.16)",
  roadMajor: "rgba(160, 182, 230, 0.28)",
  label: "#8893b0",
  labelHi: "#c9d2ea",
  halo: "rgba(4, 6, 13, 0.9)",
} as const;

const NAME: ExpressionSpecification = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
const isLine: ExpressionSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const isPoint: ExpressionSpecification = ["match", ["geometry-type"], ["MultiPoint", "Point"], true, false];
const cls = (...c: string[]): ExpressionSpecification => ["match", ["get", "class"], c, true, false];

export function buildStyle(): StyleSpecification {
  return {
    version: 8,
    name: "SARPulse",
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    projection: { type: "globe" },
    sky: {
      "sky-color": "#071226",
      "horizon-color": "#2f6fd6",
      "fog-color": "#0b1a3a",
      "sky-horizon-blend": 0.7,
      "horizon-fog-blend": 0.6,
      "fog-ground-blend": 0.85,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0],
    },
    sources: {
      openmaptiles: { type: "vector", url: `${OFM}/planet`, attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
      relief: { type: "raster", tiles: [`${OFM}/natural_earth/ne2sr/{z}/{x}/{y}.png`], tileSize: 256, maxzoom: 6, attribution: "Natural Earth" },
      imagery: { type: "raster", tiles: [IMAGERY_TILES], tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": PALETTE.land } },
      {
        id: "relief", type: "raster", source: "relief",
        paint: {
          "raster-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.8, 6, 0.5, 9, 0.28, 12, 0.12],
          // hue-shifted into the navy palette: terrain reads as relief, not as grey paper
          "raster-saturation": -0.45, "raster-hue-rotate": 200, "raster-brightness-min": 0.03, "raster-brightness-max": 0.42, "raster-contrast": 0.2, "raster-resampling": "linear",
        },
      },
      { id: "imagery", type: "raster", source: "imagery", layout: { visibility: "none" }, paint: { "raster-fade-duration": 250, "raster-saturation": -0.12, "raster-brightness-max": 0.92 } },
      {
        id: "ice", type: "fill", source: "openmaptiles", "source-layer": "landcover",
        filter: ["match", ["get", "subclass"], ["ice_shelf", "glacier"], true, false],
        paint: { "fill-color": PALETTE.landHi, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 8, 0.8] },
      },
      {
        id: "cover-wood", type: "fill", source: "openmaptiles", "source-layer": "landcover",
        filter: cls("wood", "grass", "farmland"),
        paint: { "fill-color": "#12303a", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.25, 8, 0.55, 13, 0.4] },
      },
      {
        id: "cover-wetland", type: "fill", source: "openmaptiles", "source-layer": "landcover",
        filter: cls("wetland"),
        paint: { "fill-color": "#143a4a", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 10, 0.7] },
      },
      {
        id: "cover-sand", type: "fill", source: "openmaptiles", "source-layer": "landcover",
        filter: cls("sand"),
        paint: { "fill-color": "#2b3252", "fill-opacity": 0.55 },
      },
      {
        id: "urban", type: "fill", source: "openmaptiles", "source-layer": "landuse", minzoom: 6,
        filter: cls("residential", "suburb", "commercial", "retail", "industrial"),
        paint: { "fill-color": "#1f2b50", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.35, 12, 0.7, 15, 0.45] },
      },
      {
        id: "park", type: "fill", source: "openmaptiles", "source-layer": "landuse", minzoom: 9,
        filter: cls("park", "cemetery", "grass", "wood"),
        paint: { "fill-color": "#0f1a2c", "fill-opacity": 0.6 },
      },
      {
        id: "building", type: "fill", source: "openmaptiles", "source-layer": "building", minzoom: 13,
        paint: { "fill-color": "#131d36", "fill-outline-color": "#1d2a4a", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14.5, 0.9] },
      },
      // ↓ radar data layers are inserted here (below water) ↓
      {
        id: "water", type: "fill", source: "openmaptiles", "source-layer": "water",
        filter: ["!=", ["get", "brunnel"], "tunnel"],
        paint: { "fill-color": PALETTE.water, "fill-antialias": true },
      },
      {
        id: "coastline", type: "line", source: "openmaptiles", "source-layer": "water", minzoom: 4,
        filter: ["all", ["==", ["get", "class"], "ocean"], ["!=", ["get", "brunnel"], "tunnel"]],
        paint: { "line-color": "rgba(140, 170, 255, 0.28)", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 10, 0.8, 16, 1.2] },
      },
      {
        id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway", minzoom: 8,
        paint: { "line-color": PALETTE.water, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 2] },
      },
      {
        id: "road-minor", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 12,
        filter: ["all", isLine, cls("minor", "service")],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": PALETTE.road, "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 12, 0.4, 16, 3] },
      },
      {
        id: "road-major", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 7,
        filter: ["all", isLine, cls("primary", "secondary", "tertiary", "trunk")],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": PALETTE.road, "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 7, 0.3, 12, 1.2, 16, 5] },
      },
      {
        id: "road-motorway", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 5,
        filter: ["all", isLine, cls("motorway")],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": PALETTE.roadMajor, "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 5, 0.4, 12, 1.6, 16, 6] },
      },
      {
        id: "boundary-country", type: "line", source: "openmaptiles", "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": "#2a3a62", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 6, 1.1], "line-dasharray": [3, 2] },
      },
      {
        id: "label-water", type: "symbol", source: "openmaptiles", "source-layer": "water_name", minzoom: 3,
        filter: isPoint,
        layout: { "text-field": NAME, "text-font": ["Noto Sans Italic"], "text-size": 11, "text-letter-spacing": 0.08, "text-max-width": 8 },
        paint: { "text-color": "#4a5a82", "text-halo-color": PALETTE.halo, "text-halo-width": 1 },
      },
      {
        id: "label-place", type: "symbol", source: "openmaptiles", "source-layer": "place", minzoom: 6,
        filter: ["all", isPoint, cls("town", "village", "suburb", "city"), ["<=", ["coalesce", ["get", "rank"], 99], 14]],
        layout: {
          "symbol-sort-key": ["coalesce", ["get", "rank"], 99], "text-padding": 6,
          "text-field": NAME, "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 12, 12.5],
          "text-transform": "uppercase", "text-letter-spacing": 0.1, "text-max-width": 8,
        },
        paint: { "text-color": PALETTE.label, "text-halo-color": PALETTE.halo, "text-halo-width": 1.2 },
      },
      {
        id: "label-country", type: "symbol", source: "openmaptiles", "source-layer": "place", maxzoom: 7,
        filter: ["all", isPoint, ["==", ["get", "class"], "country"], ["<=", ["get", "rank"], 2]],
        layout: {
          "text-field": NAME, "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 1, 9, 4, 12],
          "text-transform": "uppercase", "text-letter-spacing": 0.2, "text-max-width": 7,
        },
        paint: { "text-color": "#56628a", "text-halo-color": PALETTE.halo, "text-halo-width": 1 },
      },
    ],
  };
}
