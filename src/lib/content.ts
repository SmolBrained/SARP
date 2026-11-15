/**
 * Content registry: places, live NASA layers and references.
 * Status labels: LIVE = real NASA imagery streamed from GIBS at view time; MODEL = physics simulation
 * (scenes.ts) calibrated to the cited studies; INFO = context only.
 */
import type { LatLng } from "./physics";
import type { SceneId } from "./scenes";

export type RefId = "azizZanjani2024" | "fiaschi2020" | "nist2026" | "sb4d" | "wdowinski2008" | "fiuWetland" | "kim2013" | "cerp" | "imo" | "rignot2014" | "nisarData" | "nisarMission" | "operaDisp" | "operaDswx" | "gibs";
export interface Reference { readonly short: string; readonly text: string; readonly url: string }
export const REFS: Readonly<Record<RefId, Reference>> = {
  "azizZanjani2024": {
    "short": "Aziz Zanjani et al. 2024",
    "text": "Aziz Zanjani, F., Amelung, F., et al. (2024). InSAR Observations of Construction-Induced Coastal Subsidence on Miami's Barrier Islands, Florida. Earth and Space Science (AGU), published Dec. 13, 2024.",
    "url": "https://news.miami.edu/coe/stories/2024/12/new-study-finds-subsidence-hotspots-impacting-buildings-in-south-florida.html"
  },
  "fiaschi2020": {
    "short": "Fiaschi & Wdowinski 2020",
    "text": "Fiaschi, S., Wdowinski, S. (2020). Local land subsidence in Miami Beach (FL) and Norfolk (VA) and its contribution to flooding hazard in coastal communities along the U.S. Atlantic coast. Ocean & Coastal Management 187, 105078.",
    "url": "https://faculty.fiu.edu/~swdowins/publications/Fiaschi-Wdowinski-OCM-2020.pdf"
  },
  "nist2026": {
    "short": "NIST 2026",
    "text": "NIST National Construction Safety Team (June 22, 2026). Technical findings on the partial collapse of Champlain Towers South: punching shear failure of slab-column connections beneath the pool deck.",
    "url": "https://www.nist.gov/disaster-and-failure-studies/champlain-towers-south-collapse"
  },
  "sb4d": {
    "short": "Florida SB 4-D (2022)",
    "text": "Florida Senate Bill 4-D (2022), Building Safety: milestone structural inspections for condo/co-op buildings 3+ stories at 30 years, or 25 years within 3 miles of the coast, then every 10 years.",
    "url": "https://www.flsenate.gov/Committees/BillSummaries/2022D/html/4"
  },
  "wdowinski2008": {
    "short": "Wdowinski et al. 2008",
    "text": "Wdowinski, S., Kim, S.-W., Amelung, F., et al. (2008). Space-based detection of wetlands' surface water level changes from L-band SAR interferometry. Remote Sensing of Environment 112(3), 681-696.",
    "url": "https://discovery.fiu.edu/display/pub112826"
  },
  "fiuWetland": {
    "short": "FIU Wetland InSAR",
    "text": "FIU Geodesy Lab, Wetland hydrology from space: L-band fringe = 15 cm, C-band = 4 cm, X-band = 2 cm of water-level change; accuracy ~5 cm, precision 1-2 cm.",
    "url": "https://geodesy.fiu.edu/wetlands.html"
  },
  "kim2013": {
    "short": "Kim et al. 2013",
    "text": "Kim, S.-W., Wdowinski, S., Amelung, F., Dixon, T. H., Won, J.-S. (2013). Interferometric Coherence Analysis of the Everglades Wetlands, South Florida. IEEE TGRS 51(12), 5210-5224.",
    "url": "https://faculty.fiu.edu/~swdowins/publications/Kim-et-al-TGRS-2013.pdf"
  },
  "cerp": {
    "short": "CRS: CERP",
    "text": "Congressional Research Service, Everglades Restoration (IF11336): CERP projected at ~$23.2 billion (FY2020 dollars; ~$26.9B in FY2023 dollars), ~50 years to implement.",
    "url": "https://www.congress.gov/crs_external_products/IF/PDF/IF11336/IF11336.16.pdf"
  },
  "imo": {
    "short": "Icelandic Met Office",
    "text": "Icelandic Meteorological Office updates (2026): steady ground uplift and magma accumulation beneath Svartsengi; ~2 cm/month uplift; accumulation zone ~4 km deep.",
    "url": "https://en.vedur.is/about-imo/news/ground-uplift-and-magma-accumulation-continue-beneath-svartsengi"
  },
  "rignot2014": {
    "short": "Rignot et al. 2014",
    "text": "Rignot, E., Mouginot, J., Morlighem, M., Seroussi, H., Scheuchl, B. (2014). Widespread, rapid grounding line retreat of Pine Island, Thwaites, Smith, and Kohler glaciers, West Antarctica, from 1992 to 2011. Geophysical Research Letters 41, 3502-3509.",
    "url": "https://doi.org/10.1002/2014GL060140"
  },
  "nisarData": {
    "short": "ASF: NISAR data availability",
    "text": "NISAR launched July 30, 2025. Calibrated (PROVISIONAL) L-band products public since July 20, 2026 for acquisitions from June 17, 2026; full science record expected by end of 2026.",
    "url": "https://nisar-docs.asf.alaska.edu/availability-overview/"
  },
  "nisarMission": {
    "short": "NASA: NISAR",
    "text": "NASA-ISRO SAR mission: L-band (~24 cm, NASA/JPL) and S-band (~9.4 cm, ISRO), 12 m reflector on a 9 m boom, 242 km swath, 747 km orbit, 12-day repeat; ~80 TB of data products per day.",
    "url": "https://science.nasa.gov/mission/nisar/"
  },
  "operaDisp": {
    "short": "NASA OPERA DISP-S1",
    "text": "OPERA Surface Displacement from Sentinel-1 (DISP-S1): first open InSAR time-series displacement product over North America, 30 m posting, from mid-2016; distributed by ASF DAAC.",
    "url": "https://www.earthdata.nasa.gov/news/opera-project-releases-level-3-displacement-products"
  },
  "operaDswx": {
    "short": "NASA OPERA DSWx-S1",
    "text": "OPERA Dynamic Surface Water Extent from Sentinel-1: 30 m radar water maps (open water and inundated vegetation), forward production since Sept 2024; PO.DAAC.",
    "url": "https://podaac.jpl.nasa.gov/dataset/OPERA_L3_DSWX-S1_V1"
  },
  "gibs": {
    "short": "NASA GIBS",
    "text": "NASA Global Imagery Browse Services (GIBS), WMTS EPSG:3857 'best' endpoint. Layers used: NISAR_L2_Geocoded_Polarimetric_Covariance, OPERA_L2_Radiometric_Terrain_Corrected_SAR_Sentinel-1, OPERA_L3_Dynamic_Surface_Water_Extent-Sentinel-1.",
    "url": "https://nasa-gibs.github.io/gibs-api-docs/"
  }
};

export const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
export type LiveLayerId = "nisar" | "rtc" | "water";
export interface LiveLayer {
  readonly id: LiveLayerId;
  readonly title: string;
  readonly agency: string;
  /** GIBS layer identifier */
  readonly gibs: string;
  /** GoogleMapsCompatible_Level{level} tile matrix set */
  readonly level: number;
  /** highest zoom GIBS serves reliably; the map upsamples beyond */
  readonly maxNative: number;
  readonly searchDays: number;
  readonly note: string;
  readonly refs: readonly RefId[];
}
export const LIVE_LAYERS: Readonly<Record<LiveLayerId, LiveLayer>> = {
  "nisar": {
    "id": "nisar",
    "title": "NISAR L-band radar (GCOV)",
    "agency": "NASA-ISRO",
    "gibs": "NISAR_L2_Geocoded_Polarimetric_Covariance",
    "level": 13,
    "maxNative": 10,
    "searchDays": 40,
    "note": "False colour: co-pol HH in red/blue, cross-pol HV in green. Green = vegetation volume scattering; magenta/bright = buildings & flooded forest (double bounce); dark = open water.",
    "refs": ["nisarData", "gibs"]
  },
  "rtc": {
    "id": "rtc",
    "title": "Sentinel-1 C-band radar (OPERA RTC)",
    "agency": "NASA OPERA / ESA",
    "gibs": "OPERA_L2_Radiometric_Terrain_Corrected_SAR_Sentinel-1",
    "level": 12,
    "maxNative": 12,
    "searchDays": 24,
    "note": "Terrain-corrected C-band backscatter; R/B = VV, G = VH. Compare with NISAR: C-band sees canopy tops, L-band reaches the ground.",
    "refs": ["gibs"]
  },
  "water": {
    "id": "water",
    "title": "Radar water map (OPERA DSWx-S1)",
    "agency": "NASA OPERA",
    "gibs": "OPERA_L3_Dynamic_Surface_Water_Extent-Sentinel-1",
    "level": 12,
    "maxNative": 12,
    "searchDays": 24,
    "note": "Blue = open water, green = inundated vegetation (water under plants, found through clouds by radar).",
    "refs": ["operaDswx", "gibs"]
  }
};
export const LIVE_LAYER_IDS = Object.keys(LIVE_LAYERS) as LiveLayerId[];

export type Status = "LIVE" | "MODEL" | "INFO";
export type Group = "miami" | "everglades" | "world";
export type IconName = "building2" | "info" | "waves" | "trees" | "mountain" | "snowflake";
export interface Probe { readonly at: LatLng; readonly label: string }
export interface Hotspot {
  readonly id: string;
  readonly group: Group;
  readonly status: Status;
  readonly scene: SceneId | null;
  readonly t?: number;
  readonly liveDefault?: LiveLayerId;
  readonly title: string;
  readonly place: string;
  readonly center: LatLng;
  readonly zoom: number;
  readonly alert?: boolean;
  readonly memorial?: boolean;
  readonly icon: IconName;
  readonly probe?: Probe;
  readonly probe2?: Probe;
  readonly headline: string;
  readonly body: string;
  readonly radarNote: string;
  readonly refs: readonly RefId[];
}
export const HOTSPOTS: readonly Hotspot[] = [
  {
    "id": "miami-coast",
    "group": "miami",
    "status": "MODEL",
    "scene": "miami",
    "t": 7.5,
    "title": "Miami's coastal high-rises",
    "place": "Sunny Isles Beach to Miami Beach, FL",
    "center": [25.945, -80.1215],
    "zoom": 15.4,
    "alert": true,
    "icon": "building2",
    "probe": {
      "at": [25.9528, -80.1201],
      "label": "Sunny Isles Beach high-rise"
    },
    "headline": "35 coastal high-rises sank 2-8 cm between 2016 and 2023.",
    "body": "Sentinel-1 InSAR found subsidence concentrated at new high-rises (built after 2014), most widespread in northern Sunny Isles Beach. At most buildings the sinking slowed over time, consistent with creep of sandy layers inside the limestone after construction. Our simulation reproduces that pattern (2-8 cm, slowing) so you can scrub through 2016-2026.",
    "radarNote": "Millimetre-per-year motion never makes a full fringe (11.9 cm at L-band), so this view shows cumulative displacement from a time-series stack, the same approach as NASA's OPERA DISP-S1 product.",
    "refs": ["azizZanjani2024", "operaDisp"]
  },
  {
    "id": "surfside",
    "group": "miami",
    "status": "INFO",
    "scene": "miami",
    "t": 5.45,
    "title": "Surfside: what radar did and did not show",
    "place": "Champlain Towers South site, Surfside, FL",
    "center": [25.8814, -80.1219],
    "zoom": 16.4,
    "memorial": true,
    "icon": "info",
    "probe": {
      "at": [25.8814, -80.1219],
      "label": "Champlain Towers South site"
    },
    "probe2": {
      "at": [25.8797, -80.1214],
      "label": "New high-rise next door (~200 m)"
    },
    "headline": "In memory of the 98 people lost on June 24, 2021.",
    "body": "InSAR analysis of 2016-2021 Sentinel-1 data detected no settlement at Champlain Towers South before the collapse (Aziz Zanjani et al. 2024). NIST's June 2026 technical findings point to punching-shear failure of slab-column connections under the pool deck. Florida's SB 4-D now requires milestone inspections at 25 years for buildings within 3 miles of the coast.",
    "radarNote": "Lesson for SARPulse: satellite radar is a screening tool that tells inspectors where to look first. It is not a collapse predictor and never replaces structural inspection.",
    "refs": ["azizZanjani2024", "nist2026", "sb4d"]
  },
  {
    "id": "miami-beach-west",
    "group": "miami",
    "status": "MODEL",
    "scene": "miami",
    "t": 7.5,
    "title": "Miami Beach west: reclaimed wetlands",
    "place": "West side of Miami Beach, FL",
    "center": [25.8, -80.14],
    "zoom": 15.2,
    "alert": true,
    "icon": "waves",
    "probe": {
      "at": [25.8085, -80.1372],
      "label": "Reclaimed-wetland pocket"
    },
    "headline": "Pockets sinking 1-3 mm/yr where the island was built on filled wetlands.",
    "body": "ERS radar data from the 1990s showed most of Miami Beach is stable, with subsidence pockets of 1-3 mm/yr mainly on the western side, built on reclaimed wetlands. Small rates matter here: they add directly to sea-level rise and sunny-day flooding.",
    "radarNote": "Rates this small need many repeat passes. NISAR's 12-day cadence over years, or OPERA DISP-S1 today, provides the stack.",
    "refs": ["fiaschi2020", "operaDisp"]
  },
  {
    "id": "everglades",
    "group": "everglades",
    "status": "MODEL",
    "scene": "everglades",
    "t": 150,
    "title": "Everglades: water under the canopy",
    "place": "Shark River Slough & WCA-3A, FL",
    "center": [25.62, -80.78],
    "zoom": 10,
    "icon": "trees",
    "probe": {
      "at": [25.66, -80.68],
      "label": "Shark River Slough (upstream)"
    },
    "probe2": {
      "at": [25.45, -80.95],
      "label": "Shark River Slough (downstream, near mangroves)"
    },
    "headline": "L-band radar measures water-level change beneath sawgrass and mangroves.",
    "body": "Radar bounces off the water surface, then off stems and trunks, and back to the satellite (double bounce). Between two passes, the phase change maps how much the water rose or fell, about 15 cm per fringe at L-band versus 4 cm at C-band. That is sheet-flow information that optical satellites, which only see leaves, cannot provide. It matters for the ~$23 billion Comprehensive Everglades Restoration Plan (CERP).",
    "radarNote": "Try the band switch: C-band loses coherence over the marsh (noisy fringes) while L-band stays clean, the result reported by FIU's Everglades studies.",
    "refs": ["wdowinski2008", "fiuWetland", "kim2013", "cerp", "operaDswx"]
  },
  {
    "id": "iceland",
    "group": "world",
    "status": "MODEL",
    "scene": "iceland",
    "t": 12,
    "title": "Svartsengi volcano, Iceland",
    "place": "Reykjanes Peninsula, Iceland",
    "center": [63.875, -22.445],
    "zoom": 10.2,
    "alert": true,
    "icon": "mountain",
    "probe": {
      "at": [63.875, -22.445],
      "label": "Uplift centre"
    },
    "probe2": {
      "at": [63.84, -22.37],
      "label": "~5 km south-east"
    },
    "headline": "Magma refilling ~4 km down lifts the ground ~2 cm per month.",
    "body": "A Mogi point-source model at 4 km depth, calibrated to the Icelandic Met Office's reported ~2 cm/month uplift, produces the classic bull's-eye of concentric fringes. Press Play and watch new rings appear as magma accumulates, one ring per 11.9 cm of line-of-sight uplift at L-band.",
    "radarNote": "Same physics, different band: S-band rings are 2.5x denser and C-band 4.3x denser, which is why short wavelengths alias fast deformation.",
    "refs": ["imo"]
  },
  {
    "id": "thwaites",
    "group": "world",
    "status": "MODEL",
    "scene": "thwaites",
    "t": 3.7,
    "title": "Thwaites Glacier grounding zone",
    "place": "Amundsen Sea Embayment, Antarctica",
    "center": [-75.35, -106.3],
    "zoom": 8,
    "icon": "snowflake",
    "probe": {
      "at": [-75.12, -106.6],
      "label": "Floating ice shelf"
    },
    "probe2": {
      "at": [-75.42, -106.1],
      "label": "Grounded ice (pinned to bed)"
    },
    "headline": "Ocean tides flex the floating ice; fringes pinpoint where it lifts off the bed.",
    "body": "Seaward of the grounding line, the ice shelf rises and falls with the tide; landward it is pinned to the bed. An elastic-beam flexure model across a schematic grounding line produces the dense fringe belt glaciologists use to map grounding-line retreat (Rignot et al. 2014).",
    "radarNote": "Ice flow itself (hundreds of metres to kilometres per year) is measured by pixel-offset tracking, the NISAR GOFF product, not by fringes.",
    "refs": ["rignot2014", "nisarMission"]
  },
  {
    "id": "amazon",
    "group": "world",
    "status": "LIVE",
    "scene": null,
    "liveDefault": "nisar",
    "title": "Rondônia forest frontier, Brazil",
    "place": "Southern Amazon, Brazil",
    "center": [-10.5, -62.8],
    "zoom": 9,
    "icon": "trees",
    "headline": "L-band cross-polarised (HV) backscatter drops where forest is cleared.",
    "body": "This view streams real NISAR imagery from NASA GIBS. Intact forest scatters strongly in HV (green in the composite); cleared plots go dark. That makes L-band a biomass and deforestation monitor that works through the region's frequent cloud cover.",
    "radarNote": "No simulation here: everything you see is NISAR data.",
    "refs": ["nisarMission", "gibs"]
  }
];
export const HOTSPOT_BY_ID: Readonly<Record<string, Hotspot>> = Object.fromEntries(HOTSPOTS.map((h) => [h.id, h]));
