/** Human-friendly length: picks m / cm / mm. Uses a true minus sign for negatives when `signed`. */
export function formatLength(m: number, digits?: number): string {
  const a = Math.abs(m);
  if (a >= 1) return `${m.toFixed(digits ?? 2)} m`;
  if (a >= 0.1) return `${(m * 100).toFixed(digits ?? 1)} cm`;
  return `${(m * 1000).toFixed(digits ?? 1)} mm`;
}
/** Prefix a formatted length with +/− (true minus sign). "-0.0 mm" is negative zero: drop the sign. */
export function signed(text: string): string {
  const m = /^-?\d+(?:\.\d+)?/.exec(text);
  const n = m ? Number(m[0]) : NaN;
  if (Number.isFinite(n) && n === 0 && text.startsWith("-")) return text.slice(1); // negative zero is just zero
  return text.startsWith("-") ? `−${text.slice(1)}` : `+${text}`;
}
export const formatSigned = (m: number, digits?: number): string => signed(formatLength(m, digits));
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
