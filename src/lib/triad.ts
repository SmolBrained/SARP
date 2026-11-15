/**
 * Detect → Predict → Act. A proposal for turning a velocity map into decisions.
 * The tiers are an illustrative triage scheme, not a validated engineering standard, and the actions are
 * options for the people who own the asset. SARPulse itself measures nothing in these tiers: it shows the
 * mechanism (see docs/AUDIT.md for what is measured, modelled or live).
 */
export interface Tier { readonly id: "t1" | "t2" | "t3"; readonly name: string; readonly range: string; readonly maxMmYr: number; readonly meaning: string; readonly response: string }

export const TIERS: readonly Tier[] = [
  { id: "t1", name: "Stable", range: "below 1 mm per year", maxMmYr: 1, meaning: "Within normal seasonal wobble.", response: "Keep watching. Normal inspection schedule." },
  { id: "t2", name: "Elevated", range: "1 to 2.5 mm per year", maxMmYr: 2.5, meaning: "A steady trend worth a closer look.", response: "Add a site visit and ground-penetrating radar to check for voids." },
  { id: "t3", name: "Critical", range: "above 2.5 mm per year", maxMmYr: Infinity, meaning: "Settling fast enough to threaten a foundation over years.", response: "Engineering review now; consider pressure grouting before cracks open." },
];

export function tierFor(mmPerYear: number): Tier {
  const v = Math.abs(mmPerYear);
  return TIERS.find((t) => v < t.maxMmYr) ?? TIERS[2]!;
}

export const STEPS = [
  { id: "detect", title: "Detect", text: "NISAR's L-band radar, 24 cm wavelength, sees ground motion through trees and asphalt, day or night. Repeat passes build a time series, so slow trends show up where a single image cannot." },
  { id: "predict", title: "Predict", text: "Rank every area by how fast it moves. A steady fall is a warning sign, which is why the tiers below use speed, not a single snapshot." },
  { id: "act", title: "Act", text: "Hand the ranked list to the people who can do something about it, before a failure, not after." },
] as const;

export const ACTIONS = [
  { id: "grout", where: "Miami high-rises", title: "Check and strengthen foundations", text: "Flag buildings that keep settling for inspection. If ground-penetrating radar finds voids in the limestone, engineers can pressure-grout them. After Surfside, recertification can start from radar instead of a clipboard." },
  { id: "wells", where: "Biscayne Aquifer", title: "Adjust pumping", text: "If subsidence tracks groundwater pumping, well-field operators could ease withdrawals, which also helps hold back saltwater." },
  { id: "fire", where: "Everglades", title: "Watch for dry-out", text: "Falling water under the canopy, seen by radar, is an early sign of dry peat. Water managers could use it when deciding how to run culverts and gates." },
] as const;
