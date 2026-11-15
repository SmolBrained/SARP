# Interface design (v3)

The first version tried to show everything at once: several floating panels, wrapping chips, controls in three places. v2 was rebuilt from scratch around patterns that shipped products already use for "a map plus a list of places plus a time control". Each move below cites the product screens on Mobbin that it follows. Only the layout and interaction structure were borrowed; the skin (dark radar palette, Manrope and Source Serif 4, cyan accent) is SARPulse's own.

| # | Problem in v1 | Move in v2 | Precedent (Mobbin) |
| --- | --- | --- | --- |
| 1 | Panels everywhere, no hierarchy | One floating left panel with two tabs, **Places** and **Layers**; everything else sits on the map edges | [Felt](https://mobbin.com/screens/3b67bdb3-a4b3-41b3-8861-0fd8d19fe206) |
| 2 | Places were a row of wrapping chips | Vertical list with a live thumbnail of each place's radar field; selecting drills into details in the same panel, with a back arrow | [GetYourGuide](https://mobbin.com/screens/7d8762de-2deb-4393-8667-dd8751d3b206), [Sweatpals](https://mobbin.com/screens/713f58ac-dd3b-4935-aebc-0317cb3e747c) |
| 3 | Time controls buried in a panel, legend elsewhere | Timeline docked at the bottom of the map: play, scrubber, date, with the colour legend on the same card so colours are never unexplained | [Navan live map](https://mobbin.com/screens/4c2b8f2d-ee9b-44da-9e53-1ec3f2e12301) |
| 4 | Satellite photo hidden in a layer list | Map / Satellite segmented control in the top-right corner | Navan (same screen), [H&M store map](https://mobbin.com/screens/8c2cda9c-12dd-4cc2-8e9b-83acda6fb1cf) |
| 5 | On phones, panels stacked over the map | Bottom sheet: the peek state holds the place name, timeline and the tapped value; expanding shows the full panel | [Airbnb iOS](https://mobbin.com/screens/3273b096-22c7-4be5-bd1b-4628fa1a7053), [Snapchat place sheet](https://mobbin.com/screens/282e248e-9b30-4740-9e7b-d814d0cc0e42) |

Rules kept throughout: metrics are key/value rows with hairline dividers rather than boxed cards; icons appear only on controls; every layer carries one status tag (MODEL, LIVE, MEASURED or INFO) so a judge can always tell real data from simulation.

## What v3 changed

v3 keeps the v2 structure and rebuilds the visuals around one idea: the data should look like it is *on the planet*.

- **Globe first.** The app opens on a rotating MapLibre globe with atmosphere and stars. NISAR's sun-synchronous ground tracks sweep across it (98.4° inclination, the Earth turning about 24.3° per orbit), then the camera descends to the first place. The HUD stays hidden until the first landing so nothing competes with the opening.
- **Coastline-exact masking.** Radar layers are drawn between the land and the water fill, so the coast cuts the field exactly and nothing spills into the ocean. Fringe edges are organic (noise-warped), not polygons.
- **Calmer fringes.** Colours use the perceptually uniform cyclic map CET-C2 instead of HSV, and the display is multilooked to tame speckle. Each frame is painted in a worker and revealed with a "develop" wipe after every flight.
- **Miami as a city.** Persistent-scatterer points glow by how far they sank; at street zoom the real OpenStreetMap buildings extrude in 3D and take the same colour.
- **One number at a time.** The card leads with a single hero metric; the "why it matters" text folds away; callouts sit on the map at the probe points.
- **Compare is opt-in.** The photo/radar split only appears when asked for, so the map never looks cut in half by accident.
- **Brand.** The pulse-S logo is used for the favicon, app icons and top bar; all equations are typeset with MathJax (SVG at build time in the app, `$...$` in the docs).

## Basemap

Keyless and self-hosted wherever possible: OpenFreeMap vector tiles (OpenStreetMap data) for roads, water and labels, Natural Earth shaded relief, and Esri World Imagery for the Satellite view. MapLibre GL JS is vendored under `public/vendor/` and loaded at runtime, so there is no API key or account anywhere. If tiles cannot load at all, a built-in Natural Earth basemap is drawn instead.

## Typography and "does it look machine-made?" guardrails

Web research on what makes an interface read as AI-generated turned up a consistent list of tells: a monospace face for every number, an Inter / Space Grotesk / Plus Jakarta default stack, gradient headlines, neon glows, frosted glass on every surface, a decorative icon next to every label, and cards inside cards. SARPulse had several of these, so they were removed at the root rather than patched:

| Tell | What replaced it |
| --- | --- |
| Monospace for numbers; a different font in every corner | Exactly two families, both SIL OFL and self-hosted in Latin plus Greek (needed for λ, φ, Δ, θ): Manrope for all interface text and Source Serif 4 for headlines and the one large number on a card. A test fails the build if a third family appears. Numbers use the fonts' tabular figures. |
| Gradient headline text, glowing rings | Solid colour only. Marker ring animation runs on the selected marker only. |
| Heavy translucent glass everywhere | A single flat, mostly opaque surface token; blur is kept only over the map where it helps legibility. |
| Cards around every metric | Key/value rows with hairline dividers (kept from v2). |

These are enforced by `tests/design.test.ts`, which fails the build if a monospace stack, gradient-clipped text or a glow shadow reappears in the stylesheet.

## v4: home page and viewer

- **Two routes.** `/` is the story (scroll chapters over a fixed MapLibre globe: hero with the NISAR ground track, why radar, phase becomes motion with a live fringe demo, Miami, Everglades, Iceland, the world, sound, a five-step viewer tutorial, and what each tag means). `/explore/` is the viewer. A capsule navigation bar glides in once the hero has scrolled away.
- **Camera per chapter.** Each chapter names which side its text card sits on; the globe is padded so the place it flies to stays centred in the free half (below the card on phones).
- **Map reliability.** Basemap water and land are two distinguishable navy tones (the old near-black ocean read as missing map), with land cover, wetland and urban fills so no region is an empty fill. The service worker caches tiles and glyphs cache-first but TileJSON network-first (so a tile-version change is never served stale), and `lib/prefetch.ts` warms the globe tiles and the tour places on idle.
- **Text that cannot overflow.** The card's hero value switches to a wrapping smaller style when it is words (for example a dataset name) instead of a number.
