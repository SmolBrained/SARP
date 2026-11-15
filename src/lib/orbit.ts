/**
 * NISAR-like ground track for the intro: a sun-synchronous orbit (inclination 98.4°, ~97 min period)
 * traced over a rotating Earth. Earth turns ~24.3° westward under the satellite each orbit, which
 * is why successive passes march west.
 */
const DEG = Math.PI / 180;
const INCLINATION = 98.4 * DEG;
const EARTH_TURN_PER_ORBIT = 360 * (97 / 1436); // degrees of Earth rotation during one 97-minute orbit

export interface Track { readonly coords: [number, number][]; readonly progress: number[] }

/** One ascending half-orbit (south polar region → north polar region) whose equator crossing is at lng0. */
export function nisarTrack(lng0: number, samples = 220): Track {
  const coords: [number, number][] = [];
  for (let k = 0; k <= samples; k++) {
    const u = -0.5 * Math.PI + (Math.PI * k) / samples; // argument of latitude, −90° … +90°
    const lat = Math.asin(Math.sin(INCLINATION) * Math.sin(u)) / DEG;
    const dl = Math.atan2(Math.cos(INCLINATION) * Math.sin(u), Math.cos(u)) / DEG;
    const lng = lng0 + dl - (EARTH_TURN_PER_ORBIT * (u / (2 * Math.PI)));
    coords.push([lng, lat]);
  }
  // cumulative great-circle-ish length → 0…1, so animation progress matches MapLibre's line-progress
  const d = [0];
  for (let k = 1; k < coords.length; k++) {
    const [a, b] = [coords[k - 1]!, coords[k]!];
    d.push(d[k - 1]! + Math.hypot((b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * DEG), b[1] - a[1]));
  }
  const total = d[d.length - 1] || 1;
  return { coords, progress: d.map((x) => x / total) };
}

/** Track progress (0–1) at which the swath passes closest to a point. */
export function closestProgress(track: Track, lat: number, lng: number): number {
  let best = Infinity, at = 0;
  track.coords.forEach(([x, y], k) => {
    const dd = Math.hypot((x - lng) * Math.cos(lat * DEG), y - lat);
    if (dd < best) { best = dd; at = track.progress[k]!; }
  });
  return at;
}
