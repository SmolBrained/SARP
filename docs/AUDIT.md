# Fact-check and change log (Nov 14, 2026)

What the original project claimed, what we found, and what changed. Keep this for judge Q&A.

| Original claim / issue | Finding | Fix |
| --- | --- | --- |
| Map did not appear | `index.html` used Tailwind classes but Tailwind was never loaded; map height was 0 px | Rebuilt UI in Next.js with real CSS; tested in a browser |
| Canopy X-Ray, band switch | Did nothing (a line over the same map; band only changed a label) | X-Ray clips optical vs radar layers; band changes the physics (fringe size, coherence) |
| "Upcoming NISAR mission", "ready upon launch" | NISAR launched July 30, 2025; calibrated L-band data public since July 20, 2026 (ASF DAAC) | Updated everywhere; app streams live NISAR GCOV |
| Red subsidence alert on Champlain Towers South; slide implied subsidence → collapse | 2024 InSAR study found no pre-collapse settlement; NIST (June 2026) cites punching-shear failure | Respectful INFO card; radar framed as screening tool; model shows no signal at the site |
| "Detected 1.5–3.2 mm/yr at Surfside" | Not our measurement; Fiaschi & Wdowinski (2020) found 1–3 mm/yr pockets mainly in *western* Miami Beach (1993–99) | Cited correctly; MODEL label |
| Brickell −1.2 mm/yr | No source found | Removed |
| "USD 21 B CERP" | CRS: ~USD 23.2 B (FY2020 dollars), ~USD 26.9 B (FY2023 dollars) | "~USD 23 billion" |
| "Measures sub-canopy water depth" | Wetland InSAR measures water-level *change* (relative), ~5 cm accuracy | Reworded |
| Svartsengi "+18.4 mm/month" | IMO 2026: ~2 cm/month, source ~4 km deep | Mogi model calibrated to 20 mm/month |
| Thwaites "−3.8 km/yr" | Velocity isn't negative; ice flow is measured by offset tracking, not fringes | Tidal-flexure model; GOFF noted |
| Deck.gl, TypeScript, WebGL shaders, Rasterio/GDAL, phase unwrapping | Not in the code | Removed claims; what is built is documented |
| "100% offline", "<800 ms" | CDN tiles and Google Fonts needed internet; no measurement | Self-hosted fonts, offline basemap, service worker; no unmeasured speed claims |
| Fake granule names in fetch script | Fabricated identifiers | Real earthaccess search of OPERA DISP-S1 |
| "Super Intelligence (SI)" disclosure, "Section 6 of guide" | Not the official term/citation | Honest "Use of AI" text |
| "2 global nominees announced Sunday" | Local guide: nominees sent to NASA by Nov 22, not announced Sunday | Corrected |
| Pitch deck structure | Local lead suggests: Team, Problem, Solution, How it works + NASA data, Demo, Impact, Next steps | Deck follows it |
| "Embedded 90-second video" loophole on slides | Risks looking like a rules workaround | Dropped; QR goes to the live app instead |

| "Dark UI uses a mono font for numbers" (design tell) | Common AI-template signature | Replaced by Source Serif 4 / Source Sans 3; guardrail test added |
| Equation sign convention mixed phase and displacement | d_LOS = −ΔR = (λ/4π)Δφ, positive toward the satellite | One convention everywhere, tests added |
