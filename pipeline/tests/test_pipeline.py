"""Unit tests for the pure parts of the real-data pipeline (no network, no credentials)."""
import importlib.util
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pytest

spec = importlib.util.spec_from_file_location("pipe", Path(__file__).resolve().parents[1] / "fetch_real_data.py")
pipe = importlib.util.module_from_spec(spec)
sys.modules["pipe"] = pipe  # dataclasses resolve their module through sys.modules
spec.loader.exec_module(pipe)


def test_parse_granule_name():
    k = pipe.parse_granule_name("OPERA_L3_DISP-S1_IW_F08882_VV_20160705T232319Z_20160903T232323Z_v1.0_20250408T163512Z")
    assert k == pipe.GranuleKey(8882, date(2016, 7, 5), date(2016, 9, 3))
    assert pipe.parse_granule_name("not a granule") is None


def test_chain_ministacks_offsets_later_reference():
    a, b, c, d = date(2020, 1, 1), date(2020, 2, 1), date(2020, 3, 1), date(2020, 4, 1)
    orphan_ref, orphan_sec = date(2021, 6, 1), date(2021, 7, 1)
    cum = pipe.chain_ministacks([(c, d, -0.5), (a, b, -1.0), (a, c, -2.0), (orphan_ref, orphan_sec, 9.0)])
    assert cum[a] == 0 and cum[b] == -1.0 and cum[c] == -2.0 and cum[d] == -2.5
    assert orphan_sec not in cum  # a stack whose reference never appeared cannot be connected


def test_fit_velocity_recovers_linear_rate_for_arrays():
    t0 = date(2017, 1, 1)
    dates = [date(2017 + i, 1, 1) for i in range(6)]
    yrs = np.array([pipe.years_since(d, t0) for d in dates])
    vals = np.stack([np.full((2, 3), -0.004 * y) for y in yrs])
    v = pipe.fit_velocity(dates, vals)
    assert v.shape == (2, 3)
    assert np.allclose(v, -0.004, atol=1e-6)


def test_fit_velocity_needs_two_dates():
    with pytest.raises(ValueError):
        pipe.fit_velocity([date(2020, 1, 1)], [1.0])


def test_evenly_subsample_keeps_ends():
    s = list(range(100))
    out = pipe.evenly_subsample(s, 5)
    assert out[0] == 0 and out[-1] == 99 and len(out) == 5
    assert pipe.evenly_subsample(s[:3], 5) == [0, 1, 2]


def test_fit_velocity_ignores_gaps():
    """A NaN date must not dilute the rate: the line y = 5 t is recovered exactly from the valid dates."""
    dates = [date(2020, 1, 1), date(2021, 1, 1), date(2022, 1, 1), date(2023, 1, 1), date(2024, 1, 1)]
    t = np.array([pipe.years_since(d, dates[0]) for d in dates])
    y = 5.0 * t
    y[2] = np.nan
    assert pipe.fit_velocity(dates, y) == pytest.approx(5.0, rel=1e-9)
    stacked = np.stack([y, 2.0 * t], axis=1)  # second pixel has no gap
    out = pipe.fit_velocity(dates, stacked)
    assert out == pytest.approx([5.0, 2.0], rel=1e-9)
