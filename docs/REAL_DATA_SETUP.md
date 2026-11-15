# Getting measured NASA data (OPERA DISP-S1) into the app

1. **Earthdata account:** https://urs.earthdata.nasa.gov/users/new (free).
2. **Authorize ASF once:** log in at https://search.asf.alaska.edu with that account and accept the data-use agreement if asked.
3. **Run:** double-click `setup-windows.cmd` and answer `y` at step 6, or from a terminal in the `sarpulse` folder:
   ```
   uv run pipeline/fetch_real_data.py
   ```
   Type your Earthdata username/password when asked (in your own terminal; never share them). Add `--persist` to remember the login in your `.netrc`.
4. The script streams only the Miami Beach window of each granule (HTTP range reads), chains the mini-stacks, fits velocities, and writes `public/data/opera-disp-points.json`.
5. Rebuild or redeploy (`npm run deploy`), open **NASA layers**, and switch on **OPERA DISP-S1 velocities (MEASURED)**.

Options: `--bbox W S E N`, `--start 2016-07-01`, `--end 2026-11-01`, `--max-granules 60`, `--spacing 4`, `--min-coherence 0.6`.

Troubleshooting: "401/403" means log in at search.asf.alaska.edu once and accept the agreement. "No granules" means try a wider `--bbox` or date range. It's slow: lower `--max-granules` to 30.
