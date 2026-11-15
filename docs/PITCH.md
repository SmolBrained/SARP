# 5-minute pitch + 3-minute Q&A: MCP Lead

**Presenters:** Adrian Gomez (A) and Jose Unanue (J). If only one can present, Adrian takes every line.
**Format:** the organisers run all decks from one computer (your emailed PDF). Bring a laptop with the live app open as a backup, plus a phone hotspot.
**Slides due:** Sunday 11:00 AM to `lyanjimenezfer@gmail.com`, subject **`NASA SLIDES - MCP Lead`**, as a PDF or a "anyone with the link can view" Google Slides link.

## Timing

| Time | Slide | Who | What to say (short version; say it in your own words) |
| --- | --- | --- | --- |
| 0:00–0:35 | 1 Team | A | "We're MCP Lead from Miami Coral Park. Our challenge is *Dancing with the SARs*. The ground under Miami moves, but you can't see it from space with a camera. We built SARPulse so you can see it, and hear it." |
| 0:35–1:20 | 2 Problem | A | "Optical satellites are blind at night, under clouds, and under trees, and they can't see millimetres. In Miami that matters: 35 coastal high-rises sank 2 to 8 centimetres between 2016 and 2023, and the Everglades' water moves under sawgrass where cameras only see leaves." |
| 1:20–1:50 | 3 Solution | J | "SARPulse in one sentence: a free web app that turns NISAR radar into a map you can scrub through time and a sound you can hear. No login, any phone." |
| 1:50–2:40 | 4 How it works | J | "Radar measures distance changes with the phase of its echo: one colour cycle is half a wavelength ($d_{2\pi} = \lambda/2$). That's $11.9$ cm for NISAR's L-band, $4.7$ for S-band, $2.8$ for Sentinel-1's C-band. We stream real NISAR and OPERA imagery from NASA GIBS, and we simulate interferograms with physics models calibrated to published studies, labeled MODEL so you always know what's real." |
| 2:40–3:50 | 5 Demo | A drives, J narrates | 1) **Global → Iceland**, press **Play**: rings appear as magma refills. 2) Switch **L → C-band**: rings get $\approx 4\times$ denser and noisy. 3) Turn **Sound on**, drag across the volcano: clicks are fringes. 4) **Everglades → Compare with photo**: drag the divider, photo vs radar water. 5) **Miami**: the high-rises sink, then the Surfside card. (If Wi-Fi fails, show the slide's screenshots and keep talking.) |
| 3:50–4:30 | 6 Impact | J | "Inspectors on the barrier islands get a map of which buildings to check first; radar is a screening tool, and the Surfside card explains why it's not a collapse predictor. For the USD 23 billion Everglades restoration, L-band shows water flow under the canopy every 12 days." |
| 4:30–5:00 | 7 Next steps | A | "Next: ingest NISAR's own interferograms, which went public in July, and add measured OPERA velocities for every Miami building. Earth has a pulse. Thank you!" |

**Practice rule:** run it with a timer three times. If you're over 5:00, cut demo step 5 first.

## Likely judge questions (honest answers)

**"Is this real NISAR data?"**
The LIVE layers are real NISAR L-band imagery and NASA OPERA radar products, streamed from NASA GIBS. The coloured fringes are physics simulations labeled MODEL, calibrated to published measurements. Our Python pipeline pulls *measured* OPERA DISP-S1 velocities for Miami Beach with an Earthdata login.

**"Why simulate instead of using real interferograms?"**
NISAR's GUNW interferograms are 12-day pairs. Miami moves millimetres per year, so a single pair shows mostly atmosphere, and you need a time series, which is exactly what OPERA DISP-S1 provides. The simulations let anyone change the wavelength and *see* why L-band works over wetlands. That's the teaching goal.

**"Did subsidence cause the Surfside collapse?"**
No. A 2024 InSAR study found no settlement at Champlain Towers South before it collapsed, and NIST's 2026 findings point to a structural punching-shear failure under the pool deck. That's why we frame radar as a screening tool next to Florida's mandatory inspections.

**"How do you know 1 fringe $\approx$ 15 cm of water?"**
In wetlands the radar bounces off the water then the stems, so a water-level change $\Delta h$ changes the path by $\Delta h\cos\theta$. With $\lambda = 23.8\ \text{cm}$ and $\theta \approx 37^\circ$:

$$\Delta h_{2\pi} = \frac{\lambda}{2\cos\theta} = \frac{11.9\ \text{cm}}{0.80} \approx 14.9\ \text{cm},$$

which matches FIU's published 15 cm. Our unit test checks it.

**"Why does C-band look noisy over the Everglades?"**
Shorter waves bounce off the top of the vegetation, which changes between passes, so the phase decorrelates. L-band reaches the water and trunks, which stay stable. Coherence values follow Kim et al. (2013).

**"What's the sound mapping?"**
Line-of-sight motion maps to pitch: away from the satellite (sinking) glides down to $55\ \text{Hz}$, toward it rises to $440\ \text{Hz}$ (pitch $f = 110\cdot 2^{s}$ or $110\cdot 2^{2s}$ Hz for normalised motion $s \in [-1, 1]$). Each $2\pi$ fringe you cross is a click, and low coherence adds hiss.

**"What did AI do?"**
We used Claude as a coding and research assistant. It fact-checked, wrote much of the code and the tests, and drafted text. We chose the problem and the Miami focus, decided the features, tested everything, and we can explain the physics. It's disclosed in the README and the submission.

**"What would you build next?"**
Ingest NISAR GUNW and DISP-NI time series directly, add building-level alerts from measured velocities, and validate Everglades water levels against USGS EDEN gauges.

## Day-of checklist
- [ ] PDF emailed by 11:00 AM (subject `NASA SLIDES - MCP Lead`)
- [ ] Live app opened once on the backup laptop and phone *on Wi-Fi beforehand*, so the map tiles are cached for offline use
- [ ] Sound tested on the presentation computer (volume up)
- [ ] Jose submits on spaceappschallenge.org by 2:45 PM, then clicks **Submit** again after any edit
- [ ] Drive/Slides link tested in an incognito window
