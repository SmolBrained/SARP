/** Story mode chapters and per-place presentation metadata (verbs, kickers, timeline events). */
import type { SceneId } from "./scenes";

export interface Chapter {
  readonly place: string;
  readonly label: string;
  readonly title: string;
  readonly text: string;
}

/** Five chapters, ~18 s each: a 90-second guided story through the app. */
export const CHAPTERS: readonly Chapter[] = [
  {
    place: "miami-coast", label: "Miami",
    title: "Miami's skyline is sinking, slowly.",
    text: "Radar satellites measured 35 coastal high-rises settling 2–8 cm between 2016 and 2023: fastest right after construction, then slowing. Watch the red bowls deepen.",
  },
  {
    place: "everglades", label: "Everglades",
    title: "Radar sees the water under the trees.",
    text: "A photo shows only leaves. L-band radar bounces off the water and the stems, so every colour cycle is about 15 cm of water rising. Tap Compare with photo, then drag the divider.",
  },
  {
    place: "iceland", label: "Iceland",
    title: "A volcano breathing in.",
    text: "Magma refilling 4 km below Svartsengi lifts the ground about 2 cm a month. Each new ring of colour is another 11.9 cm of motion toward the satellite.",
  },
  {
    place: "thwaites", label: "Antarctica",
    title: "A glacier that rises and falls with the tide.",
    text: "Where Thwaites' ice starts to float, the ocean tide bends it up and down. The tight band of fringes marks the grounding line, a key number for future sea-level rise.",
  },
  {
    place: "amazon", label: "Amazon",
    title: "And this one is real NISAR data.",
    text: "Live L-band radar from NASA-ISRO NISAR, streamed from NASA. Intact forest scatters brightly; cleared land goes dark, even under clouds and at night.",
  },
];

/** Short action word shown on place cards in the picker. */
export const VERB: Readonly<Record<string, string>> = {
  "miami-coast": "Sinking",
  surfside: "In memory",
  "miami-beach-west": "Settling",
  everglades: "Water rising",
  iceland: "Inflating",
  thwaites: "Breathing with tides",
  amazon: "Live NISAR",
};

export interface TimeEvent { readonly t: number; readonly label: string }

/** Moments marked on the timeline track (amber diamonds). */
export const EVENTS: Readonly<Record<SceneId, readonly TimeEvent[]>> = {
  miami: [{ t: 5.45, label: "Jun 2021: Surfside collapse" }],
  everglades: [{ t: 0, label: "Dry-season low (reference pass)" }, { t: 182, label: "Wet-season peak" }],
  iceland: [{ t: 0, label: "Jul 2025: eruption ends, refilling begins" }],
  thwaites: [{ t: 3.7, label: "Spring tide" }, { t: 18.5, label: "Spring tide" }],
};
