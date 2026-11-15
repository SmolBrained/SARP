# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "earthaccess>=0.12",
#   "h5py>=3.11",
#   "numpy>=1.26",
#   "pyproj>=3.6",
# ]
# ///
"""
SARPulse real-data pipeline: measured ground motion for Miami's barrier islands from NASA OPERA DISP-S1.

What it does
  1. Logs in to NASA Earthdata (prompts on YOUR computer; optional --persist saves a .netrc).
  2. Finds OPERA L3 DISP-S1 granules (Sentinel-1 InSAR time series, 30 m) over the study box.
  3. Streams ONLY the study-box window of each granule (HTTP range reads; no 300 MB downloads).
  4. Chains mini-stacks into one cumulative line-of-sight (LOS) series per pixel and fits a velocity.
  5. Writes public/data/opera-disp-points.json, which the app shows as the gold "MEASURED" layer.

Run (Windows PowerShell, from the project folder):
    uv run pipeline/fetch_real_data.py
Options:
    --bbox W S E N         study box (default: Sunny Isles Beach to South Beach)
    --start / --end        date range (default 2016-07-01 .. today)
    --max-granules N       evenly subsample the time series to N granules (default 60)
    --spacing N            keep every Nth pixel (default 4, i.e. ~120 m)
    --min-coherence C      drop pixels with mean temporal coherence below C (default 0.6)

Nothing here needs the app to be running, and the app works without this file.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "opera-disp-points.json"
SHORT_NAME = "OPERA_L3_DISP-S1_V1"
DEFAULT_BBOX = (-80.160, 25.760, -80.110, 25.975)  # W, S, E, N

NAME_RE = re.compile(r"_F(?P<frame>\d{5})_.*?_(?P<ref>\d{8}T\d{6}Z)_(?P<sec>\d{8}T\d{6}Z)_")


# ----------------------------------------------------------------------------- pure helpers (unit-tested)

@dataclass(frozen=True)
class GranuleKey:
    frame: int
    ref: date
    sec: date


def parse_granule_name(name: str) -> GranuleKey | None:
    """Parse frame and reference/secondary dates from an OPERA DISP-S1 granule name."""
    m = NAME_RE.search(name)
    if not m:
        return None
    d = lambda s: datetime.strptime(s, "%Y%m%dT%H%M%SZ").date()  # noqa: E731
    return GranuleKey(int(m["frame"]), d(m["ref"]), d(m["sec"]))


def chain_ministacks(items: Sequence[tuple[date, date, object]]):
    """
    DISP-S1 displacement is relative to each mini-stack's reference date. Chain them into one
    cumulative series: the first reference is zero; a later stack whose reference date already
    has a cumulative value is offset by it. Stacks that cannot be connected are skipped.
    Values may be scalars or numpy arrays. Returns {date: cumulative value} sorted by date.
    """
    items = sorted(items, key=lambda x: (x[0], x[1]))
    if not items:
        return {}
    first_ref = items[0][0]
    cum: dict[date, object] = {first_ref: 0 * items[0][2]}
    for ref, sec, val in items:
        if ref in cum:
            cum[sec] = cum[ref] + val
    return dict(sorted(cum.items()))


def years_since(d: date, t0: date) -> float:
    return (d - t0).days / 365.25


def fit_velocity(dates: Sequence[date], values):
    """Least-squares linear rate (units per year) along axis 0. Works for scalars or stacked arrays.

    NaN observations are excluded *per pixel*: the time mean and the variance denominator are computed
    over that pixel's valid dates only, so gaps do not dilute the rate.
    """
    import numpy as np

    t = np.array([years_since(d, dates[0]) for d in dates], dtype="float64")
    y = np.asarray(values, dtype="float64")
    if len(t) < 2 or float(np.ptp(t)) == 0:
        raise ValueError("need at least two distinct dates")
    shape = (-1,) + (1,) * (y.ndim - 1)
    tt = np.broadcast_to(t.reshape(shape), y.shape)
    ok = np.isfinite(y)
    n = ok.sum(axis=0)
    safe_n = np.maximum(n, 1)
    t_mean = np.where(ok, tt, 0.0).sum(axis=0) / safe_n
    y_mean = np.where(ok, y, 0.0).sum(axis=0) / safe_n
    tc = np.where(ok, tt - t_mean, 0.0)
    yc = np.where(ok, y - y_mean, 0.0)
    denom = (tc**2).sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        rate = (tc * yc).sum(axis=0) / denom
    return np.where((n >= 2) & (denom > 0), rate, np.nan)


def evenly_subsample(seq: Sequence, n: int) -> list:
    if n <= 0 or len(seq) <= n:
        return list(seq)
    step = (len(seq) - 1) / (n - 1)
    return [seq[round(i * step)] for i in range(n)]


# ----------------------------------------------------------------------------- HDF5 access

def _find(h5, names: Iterable[str]):
    """Return the first dataset whose basename matches one of `names` (searches groups)."""
    wanted = set(names)
    hit = []

    def visit(path, obj):
        if not hit and hasattr(obj, "shape") and path.split("/")[-1] in wanted:
            hit.append(obj)

    h5.visititems(visit)
    return hit[0] if hit else None


def _crs(h5):
    from pyproj import CRS

    sr = _find(h5, ["spatial_ref"])
    if sr is not None:
        for key in ("crs_wkt", "spatial_ref"):
            if key in sr.attrs:
                v = sr.attrs[key]
                return CRS.from_wkt(v.decode() if isinstance(v, bytes) else str(v))
        if "epsg_code" in sr.attrs:
            return CRS.from_epsg(int(sr.attrs["epsg_code"]))
    raise RuntimeError("could not find the product's coordinate system (spatial_ref)")


def read_window(fobj, bbox):
    """Read the bbox window of displacement and coherence from one DISP-S1 file."""
    import h5py
    import numpy as np
    from pyproj import Transformer

    with h5py.File(fobj, "r") as h5:
        x, y = _find(h5, ["x"]), _find(h5, ["y"])
        disp = _find(h5, ["displacement"])
        coh = _find(h5, ["temporal_coherence"])
        if x is None or y is None or disp is None:
            raise RuntimeError("unexpected DISP-S1 layout (x / y / displacement not found)")
        crs = _crs(h5)
        tf = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
        w, s, e, n = bbox
        xs, ys = tf.transform([w, e, w, e], [s, s, n, n])
        xv, yv = x[:], y[:]
        ix = np.where((xv >= min(xs)) & (xv <= max(xs)))[0]
        iy = np.where((yv >= min(ys)) & (yv <= max(ys)))[0]
        if ix.size == 0 or iy.size == 0:
            return None
        sl = (slice(iy.min(), iy.max() + 1), slice(ix.min(), ix.max() + 1))
        block = disp[sl].astype("float32")
        cblock = coh[sl].astype("float32") if coh is not None else np.ones_like(block)
        return {"disp": block, "coh": cblock, "x": xv[sl[1]], "y": yv[sl[0]], "crs": crs}


# ----------------------------------------------------------------------------- main

def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bbox", nargs=4, type=float, default=DEFAULT_BBOX, metavar=("W", "S", "E", "N"))
    ap.add_argument("--start", default="2016-07-01")
    ap.add_argument("--end", default=date.today().isoformat())
    ap.add_argument("--max-granules", type=int, default=60)
    ap.add_argument("--spacing", type=int, default=4)
    ap.add_argument("--min-coherence", type=float, default=0.6)
    ap.add_argument("--persist", action="store_true", help="save the Earthdata login to your .netrc")
    a = ap.parse_args(argv)

    import earthaccess
    import numpy as np
    from pyproj import Transformer

    print("1/5  Logging in to NASA Earthdata (type your username and password if asked)…")
    auth = earthaccess.login(strategy="interactive", persist=a.persist)
    if not auth or not getattr(auth, "authenticated", True):
        print("Login failed. Check your Earthdata username/password at https://urs.earthdata.nasa.gov", file=sys.stderr)
        return 1

    print(f"2/5  Searching {SHORT_NAME} over {a.bbox} from {a.start} to {a.end}…")
    results = earthaccess.search_data(short_name=SHORT_NAME, bounding_box=tuple(a.bbox), temporal=(a.start, a.end))
    keyed = []
    for g in results:
        name = g["umm"]["GranuleUR"]
        k = parse_granule_name(name)
        if k:
            keyed.append((k, g))
    if not keyed:
        print("No DISP-S1 granules found for this box/period.", file=sys.stderr)
        return 2
    frames: dict[int, list] = {}
    for k, g in keyed:
        frames.setdefault(k.frame, []).append((k, g))
    frame, items = max(frames.items(), key=lambda kv: len(kv[1]))
    items.sort(key=lambda kg: (kg[0].ref, kg[0].sec))
    print(f"     {len(keyed)} granules; using frame F{frame:05d} with {len(items)} dates")

    # keep every mini-stack's chain intact: always include the last granule of each reference group
    by_ref: dict[date, list] = {}
    for kg in items:
        by_ref.setdefault(kg[0].ref, []).append(kg)
    budget = max(2, a.max_granules // max(1, len(by_ref)))
    chosen = [kg for grp in by_ref.values() for kg in evenly_subsample(grp, budget)]
    sec_dates = {kg[0].sec for kg in chosen}
    chosen += [kg for kg in items if kg[0].sec in by_ref and kg[0].sec not in sec_dates]  # link dates
    chosen = sorted(set(chosen), key=lambda kg: (kg[0].ref, kg[0].sec))
    print(f"3/5  Streaming the study window from {len(chosen)} granules (range reads, a few minutes)…")

    files = earthaccess.open([g for _, g in chosen])
    stack, meta = [], None
    for i, ((k, _), f) in enumerate(zip(chosen, files), 1):
        try:
            w = read_window(f, a.bbox)
        except Exception as exc:  # one bad granule must not kill the run
            print(f"     skip {k.sec}: {exc}")
            continue
        if w is None:
            continue
        if meta is None:
            meta = w
        elif w["disp"].shape != meta["disp"].shape:
            continue
        stack.append((k.ref, k.sec, w["disp"], w["coh"]))
        print(f"     {i:3d}/{len(chosen)}  {k.ref} → {k.sec}", end="\r")
    print()
    if not stack or meta is None:
        print("Could not read any granule windows.", file=sys.stderr)
        return 3

    print("4/5  Chaining mini-stacks and fitting velocities…")
    cum = chain_ministacks([(r, s, d) for r, s, d, _ in stack])
    dates = list(cum.keys())
    if len(dates) < 3:
        print("Too few connected dates to fit a velocity.", file=sys.stderr)
        return 4
    vel_m_yr = fit_velocity(dates, np.stack([cum[d] for d in dates]))
    coh = np.nanmean(np.stack([c for *_, c in stack]), axis=0)

    print("5/5  Writing points…")
    inv = Transformer.from_crs(meta["crs"], "EPSG:4326", always_xy=True)
    feats = []
    sp = max(1, a.spacing)
    for iy in range(0, vel_m_yr.shape[0], sp):
        for ix in range(0, vel_m_yr.shape[1], sp):
            v, c = float(vel_m_yr[iy, ix]), float(coh[iy, ix])
            if not np.isfinite(v) or not np.isfinite(c) or c < a.min_coherence:
                continue
            lon, lat = inv.transform(float(meta["x"][ix]), float(meta["y"][iy]))
            feats.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                "properties": {
                    "velocity_mm_yr": round(v * 1000, 2),
                    "coherence": round(c, 2),
                    "period": f"{dates[0]} to {dates[-1]} ({len(dates)} dates)",
                    "source": f"NASA JPL OPERA DISP-S1, frame F{frame:05d}, ASF DAAC",
                },
            })
    fc = {
        "type": "FeatureCollection",
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "product": SHORT_NAME,
        "bbox": list(a.bbox),
        "note": "LOS velocity from a linear fit to chained DISP-S1 mini-stacks; sign follows the product (see OPERA DISP-S1 product specification).",
        "features": feats,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fc, separators=(",", ":")))
    print(f"Done: {len(feats)} measured points → {OUT.relative_to(ROOT)}")
    print("Rebuild/redeploy the site (or refresh `npm run dev`) and toggle 'OPERA DISP-S1 velocities' under NASA layers.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
