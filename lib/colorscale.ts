/**
 * Viridis color scale (colorblind-safe, perceptually uniform).
 * Stops are approximate to matplotlib's 'viridis' at 9 evenly-spaced positions.
 * `viridis(0)` is the dark-purple end; `viridis(1)` is the bright-yellow end.
 */
const VIRIDIS_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [68, 1, 84],     // 0.000
  [72, 35, 116],   // 0.125
  [64, 67, 135],   // 0.250
  [52, 94, 141],   // 0.375
  [41, 120, 142],  // 0.500
  [32, 144, 140],  // 0.625
  [34, 167, 132],  // 0.750
  [68, 190, 112],  // 0.875
  [253, 231, 37],  // 1.000
];

export function viridis(t: number): string {
  const u = clamp01(t);
  const segment = u * (VIRIDIS_STOPS.length - 1);
  const i = Math.min(Math.floor(segment), VIRIDIS_STOPS.length - 2);
  const frac = segment - i;
  const a = VIRIDIS_STOPS[i]!;
  const b = VIRIDIS_STOPS[i + 1]!;
  const r = Math.round(a[0] + (b[0] - a[0]) * frac);
  const g = Math.round(a[1] + (b[1] - a[1]) * frac);
  const bl = Math.round(a[2] + (b[2] - a[2]) * frac);
  return `rgb(${r}, ${g}, ${bl})`;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Choose the right luminance for a label drawn on top of `viridis(t)`.
 * Viridis is dark for low t and bright for high t; flip the label color
 * around the midpoint.
 */
export function viridisLabelColor(t: number): string {
  return t > 0.55 ? "#1B331C" : "#FBF8F1";
}
