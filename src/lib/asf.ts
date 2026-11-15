/**
 * What the Alaska Satellite Facility (ASF) Data Search offers, summarised from https://search.asf.alaska.edu
 * (NASA's ASF DAAC) and written in our own words. Where the real data lives; SARPulse itself streams GIBS imagery
 * and ships its own OPERA pipeline output (see docs/AUDIT.md).
 */
export const ASF_URL = "https://search.asf.alaska.edu/";

export interface AsfDataset { readonly name: string; readonly tag?: string; readonly years: string; readonly by: string; readonly note: string; readonly searchable: boolean }

export const DATASETS: readonly AsfDataset[] = [
  { name: "NISAR", tag: "Validated", years: "2025 to present", by: "NASA/JPL", note: "L-band and S-band radar for ecosystems, moving land and ice, imaged every 12 days on ascending and descending passes.", searchable: true },
  { name: "Sentinel-1", years: "2014 to present", by: "ESA", note: "Twin C-band radar satellites: day-and-night, all-weather imagery of the whole planet.", searchable: true },
  { name: "S1 Bursts", years: "2014 to present", by: "ESA", note: "The individual radar bursts that make up each Sentinel-1 sub-swath, for finer-grained searches.", searchable: true },
  { name: "OPERA-S1", years: "2014 to present", by: "OPERA-JPL", note: "Sentinel-1 backscatter (RTC) almost everywhere, plus CSLC products over North America.", searchable: true },
  { name: "TROPO", years: "2014 to present", by: "OPERA-JPL", note: "Atmospheric radar delay maps, used to clean ground-motion measurements.", searchable: true },
  { name: "ALOS-2", years: "2014 to present", by: "JAXA/METI", note: "L-band PALSAR-2 ScanSAR: wide-swath single look complex scenes revisited about every 14 days.", searchable: true },
  { name: "ALOS PALSAR", years: "2006 to 2011", by: "JAXA/METI", note: "Mapping, regional land cover, disaster monitoring and resource surveys.", searchable: true },
  { name: "ALOS AVNIR-2", years: "2006 to 2011", by: "JAXA", note: "Visible and near-infrared images corrected for sensor distortion, ready to overlay on maps.", searchable: true },
  { name: "SIR-C", tag: "Beta", years: "1994", by: "NASA", note: "Radar flown on two Space Shuttle Endeavour missions to study large-scale environmental processes.", searchable: true },
  { name: "ARIA S1 GUNW", tag: "NISAR-format", years: "2014 to present", by: "ARIA-JPL", note: "Ready-made Sentinel-1 interferograms (level 2) from JPL's ARIA project.", searchable: true },
  { name: "SMAP", years: "2015 to present", by: "NASA", note: "Global soil moisture in roughly the top 5 cm of soil, and whether it is frozen or thawed.", searchable: true },
  { name: "UAVSAR", years: "2008 to present", by: "NASA", note: "Airborne repeat-track radar built for interferometry.", searchable: true },
  { name: "RADARSAT-1", years: "1996 to 2008", by: "CSA", note: "Canadian C-band SAR, night and day in all weather. Removed from searchable interfaces.", searchable: false },
  { name: "ERS", years: "1991 to 2011", by: "ESA", note: "SAR imagery over ASF and McMurdo station masks, suitable for interferometry. Removed from searchable interfaces.", searchable: false },
  { name: "JERS-1", years: "1992 to 1998", by: "JAXA", note: "Japanese high-resolution all-weather imaging radar for surveys, farming and forestry. Removed from searchable interfaces.", searchable: false },
  { name: "AIRSAR", years: "1990 to 2004", by: "NASA/JPL", note: "Airborne radar whose longer wavelengths reach into forest canopy. Temporarily removed from searchable interfaces.", searchable: false },
  { name: "SEASAT", years: "1978", by: "NASA", note: "NASA's first SAR, flown to watch the oceans.", searchable: true },
] as const;

/** The filters the NISAR search exposes. */
export const NISAR_FILTERS: ReadonlyArray<readonly [string, string]> = [
  ["Search type", "Geographic search by area of interest (draw a shape or paste WKT, or search for a place)"],
  ["Dates", "Start and end date, plus a seasonal search"],
  ["Science product", "Production configuration and data maturity"],
  ["Scene name patterns", "Comma-separated names with * and ? wildcards"],
  ["Polarisation", "Main band (frequency A) and side band (frequency B), 8 options each"],
  ["Flight direction", "Ascending or descending"],
  ["Instrument", "L-band or S-band"],
  ["Frame coverage", "Full or partial frames"],
  ["Range bandwidth", "7 choices"],
  ["Acquisition coverage", "2 observation types, including joint L- and S-band passes"],
  ["Track and frame", "Start and end ranges for each"],
];

/** A NISAR scene name, as listed by ASF, taken apart. */
export const SCENE_EXAMPLE = "NISAR_L2_PR_GCOV_034_047_A_015_4005_DHDH_…";
export const SCENE_PARTS: ReadonlyArray<readonly [string, string]> = [
  ["NISAR", "The mission"],
  ["L2", "Processing level: L0 raw, L1 single look complex, L2 geocoded"],
  ["PR", "Production configuration"],
  ["GCOV", "Product: geocoded polarimetric covariance (others: RRSD raw, RSLC, GSLC)"],
  ["034", "Repeat cycle, which steps up every 12 days"],
  ["047", "Track (relative orbit)"],
  ["A", "Ascending (D is descending)"],
  ["015", "Frame along the track"],
  ["4005 · DHDH", "Mode and polarisation codes"],
];

export const ASF_TOOLS: readonly string[] = [
  "Scenes list with a map footprint, zoom-to-scene and a downloads queue",
  "On-demand processing through HyP3 for supported datasets",
  "SBAS stack builder: pick a scene and get every overlapping scene",
  "Validated NISAR L-band products are flagged, with a link to their documentation",
];

/** Deep link to ASF Data Search for NISAR, centred on a place. */
export function asfUrl(lat: number, lng: number, zoom = 8): string {
  return `${ASF_URL}#/?dataset=NISAR&zoom=${zoom}&center=${lng.toFixed(3)},${lat.toFixed(3)}`;
}
