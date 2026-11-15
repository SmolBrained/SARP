# NASA Space Apps project page: copy-paste text

Only the **Team Owner (Jose Unanue)** can submit. Deadline: **Sunday, Nov 15, 11:59 PM**. The Miami local lead recommends submitting **by 2:45 PM Sunday**. Click **Submit** again after every edit; only the last submitted version counts. Write everything in English.

---

## Project name
SARPulse: See and Hear the Earth Move with NISAR Radar

## High-level project summary
SARPulse is a free, open-source web app that turns NASA-ISRO NISAR radar into something anyone can see, scrub through time, and hear. Optical satellites are blind under clouds, at night and beneath tree canopies, and they cannot see millimetre-scale ground motion. Synthetic aperture radar can. SARPulse streams real NISAR L-band and NASA OPERA radar imagery from NASA GIBS (no login). It explains interferometry with physics-based interferograms that change as you switch between NISAR L-band, NISAR S-band, Sentinel-1 C-band and SAOCOM L-band, and it sonifies motion: sinking ground lowers the pitch, rising ground raises it, and every fringe you cross clicks. We grounded it in our home city. The app shows how radar tracks Miami's coastal high-rises (35 sank 2–8 cm from 2016 to 2023) and water moving beneath the Everglades canopy (about 15 cm per L-band fringe), with global examples from Iceland, Thwaites Glacier and the Amazon. Every value is cited, and simulated layers are clearly labeled.

## Project demo (7-slide deck)
_Upload the PDF exported from `SARPulse_Pitch.pptx` to Google Drive → Share → "Anyone with the link can view" → paste the link. Test it in a private/incognito window first._

## Final project link
_GitHub repo:_ https://github.com/SmolBrained/SARP
_Live app:_ add your Firebase or GitHub Pages URL

## Project details
**What it does.** SARPulse is an interactive radar map with three views:
1. **Miami:** construction-induced subsidence of coastal high-rises (Sunny Isles Beach to Miami Beach), slow 1–3 mm/yr settlement on reclaimed wetlands in western Miami Beach, and an honest Surfside card. InSAR detected no settlement at Champlain Towers South before the 2021 collapse, and NIST attributes the collapse to structural failure, so we present radar as a screening tool that points inspectors to the right buildings, alongside Florida's SB 4-D milestone inspections.
2. **Everglades:** water moving under sawgrass and mangroves. L-band double bounce off water and stems turns interferometric phase into water-level change, $\Delta h_{2\pi} = \lambda / (2\cos\theta) \approx 14.9$ cm per fringe. An optional split compares an optical photo (only leaves) with radar (the water below).
3. **World (3D globe):** Svartsengi volcano (Mogi source at $d = 4$ km, ~2 cm/month uplift), Thwaites Glacier grounding zone (elastic tidal flexure), and Rondônia forest loss in live NISAR imagery.

**How it works.** Live layers come from NASA GIBS WMTS: NISAR L2 GCOV, OPERA RTC-S1 and OPERA DSWx-S1. The app finds the most recent satellite pass by probing day by day. Interferograms are computed in a Web Worker from physics models ($\Delta r = \frac{\lambda}{4\pi}\,\Delta\phi$, with $\lambda = c/f$ per band; one colour cycle is $\lambda/2$), with decorrelation noise derived from band-dependent coherence. A Web Audio engine maps line-of-sight motion to pitch (55–440 Hz), coherence to hiss, and fringe crossings to clicks. An optional Python pipeline uses earthaccess to stream only the Miami window of OPERA DISP-S1 granules, chains the mini-stacks and fits measured velocities, which appear as a MEASURED layer.

**Tools.** Next.js 16, React 19, TypeScript (strict), MapLibre GL JS (WebGL globe), OpenFreeMap vector tiles, Web Workers, Web Audio API, Vitest, ESLint, Python 3.12 with uv, earthaccess, h5py, NumPy and pyproj, plus GitHub Actions CI and Firebase Hosting. The app is a fully static, installable PWA that keeps working offline (it includes a Natural Earth fallback basemap).

**Goals and impact.** Make radar Earth science understandable to residents, students, city inspectors and restoration managers; help prioritise building inspections on Miami's barrier islands; and show how NISAR's 12-day, all-weather L-band coverage can monitor wetland hydrology for the ~USD 23 billion Comprehensive Everglades Restoration Plan.

## Use of Artificial Intelligence (AI)
We used Claude (Anthropic) as a coding and research assistant. It fact-checked our claims against current sources, wrote and refactored much of the TypeScript and Python code, wrote tests, and drafted documentation and slide text. Our team chose the challenge and the Miami focus, decided what the app should show, reviewed and tested all features, and presents and explains the work. AI-assisted content is credited in the README. No NASA logos, flags or mission identifiers were generated or modified with AI.

## NASA data
- **NISAR L2 Geocoded Polarimetric Covariance (GCOV)**, streamed via NASA GIBS (`NISAR_L2_Geocoded_Polarimetric_Covariance`). NISAR availability per ASF DAAC: calibrated L-band products public since July 20, 2026.
- **NASA JPL OPERA RTC-S1** (Sentinel-1 radiometric terrain-corrected backscatter) via NASA GIBS.
- **NASA JPL OPERA DSWx-S1** (dynamic surface water extent from radar) via NASA GIBS.
- **NASA JPL OPERA DISP-S1** (InSAR surface displacement time series, North America) via ASF DAAC / earthaccess, in our Python pipeline.
- **NASA Earthdata / CMR** search (earthaccess) and **NASA GIBS** WMTS.

## Space agency partner and other data
- **ISRO:** NISAR S-band (3.2 GHz) parameters for the S-band comparison.
- **ESA:** Copernicus Sentinel-1 C-band (input to OPERA RTC, DSWx-S1 and DISP-S1; C-band comparison).
- **CONAE:** SAOCOM-1 L-band parameters for the comparison.
- Natural Earth (relief and offline basemap); © OpenStreetMap contributors via OpenFreeMap (vector basemap, no API key); Esri World Imagery (optical photo).

## References
1. ASF DAAC, NISAR Data Availability Overview. https://nisar-docs.asf.alaska.edu/availability-overview/
2. NASA, NISAR mission. https://science.nasa.gov/mission/nisar/
3. Aziz Zanjani, F., Amelung, F., et al. (2024). InSAR Observations of Construction-Induced Coastal Subsidence on Miami's Barrier Islands, Florida. *Earth and Space Science.*
4. Fiaschi, S., Wdowinski, S. (2020). Local land subsidence in Miami Beach (FL) and Norfolk (VA)… *Ocean & Coastal Management* 187, 105078.
5. Wdowinski, S., et al. (2008). Space-based detection of wetlands' surface water level changes from L-band SAR interferometry. *Remote Sensing of Environment* 112(3).
6. Kim, S.-W., Wdowinski, S., et al. (2013). Interferometric Coherence Analysis of the Everglades Wetlands. *IEEE TGRS* 51(12).
7. FIU Geodesy Lab, Wetland hydrology from space. https://geodesy.fiu.edu/wetlands.html
8. Icelandic Meteorological Office, Svartsengi updates (2026). https://en.vedur.is
9. Rignot, E., et al. (2014). Widespread, rapid grounding line retreat… *Geophysical Research Letters* 41.
10. NIST (June 22, 2026). Technical findings, Champlain Towers South partial collapse.
11. Florida Senate SB 4-D (2022), Building Safety.
12. Congressional Research Service IF11336, Everglades Restoration.
13. NASA OPERA DISP-S1 release (2025); OPERA DSWx-S1 (PO.DAAC); NASA GIBS API.
14. Mogi, K. (1958); Holdsworth, G. (1969): source and flexure models.
15. Software: Next.js, React, MapLibre GL JS, OpenFreeMap, MathJax, Lucide, qrcode-generator, earthaccess, h5py, NumPy, pyproj; Natural Earth.
