"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AXIS_STROKE, GRID_STROKE } from "./ChartCard";

/**
 * Small SVG line plot for analytical curves (rarefaction/extrapolation,
 * rank–abundance). Built by hand rather than with Recharts because these
 * charts need per-series confidence bands, solid/dashed segments per series,
 * log axes, direct end-labels, and a crosshair tooltip that interpolates
 * every series at the cursor even though series have different x knots.
 */

export interface XY {
  x: number;
  y: number;
}

export interface PlotSeries {
  key: string;
  label: string;
  color: string;
  segments: Array<{ points: XY[]; dashed?: boolean }>;
  /** Optional confidence band (drawn under the line). */
  band?: Array<{ x: number; lo: number; hi: number }>;
  /** Emphasised points (e.g. the observed sample). */
  markers?: XY[];
  /** Vertical error bars (drawn with the markers). */
  errorBars?: Array<{ x: number; lo: number; hi: number }>;
  /** Draw markers hollow (e.g. estimates vs. observations). */
  hollowMarkers?: boolean;
}

type Scale = "linear" | "log";

export interface LinePlotProps {
  series: PlotSeries[];
  height?: number;
  xLabel: string;
  yLabel: string;
  xScale?: Scale;
  yScale?: Scale;
  xDomain?: [number, number];
  yDomain?: [number, number];
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  ariaLabel: string;
  /** Extra rows rendered in the hover tooltip, given the hovered x. */
  tooltipExtra?: (x: number) => ReactNode;
  /** Vertical/horizontal reference lines. */
  refLines?: Array<{ axis: "x" | "y"; value: number; label: string }>;
  showEndLabels?: boolean;
}

const M = { top: 12, right: 16, bottom: 40, left: 60 };

export function LinePlot({
  series,
  height = 340,
  xLabel,
  yLabel,
  xScale = "linear",
  yScale = "linear",
  xDomain,
  yDomain,
  xFormat = defaultFormat,
  yFormat = defaultFormat,
  ariaLabel,
  tooltipExtra,
  refLines = [],
  showEndLabels = true,
}: LinePlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const endLabels = showEndLabels && series.length > 1 && series.length <= 4;
  const right = endLabels ? 110 : M.right;

  const dom = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of series) {
      for (const seg of s.segments) for (const p of seg.points) {
        if (!valid(p.x, xScale) || !valid(p.y, yScale)) continue;
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      for (const p of s.markers ?? []) {
        if (!valid(p.x, xScale) || !valid(p.y, yScale)) continue;
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      for (const b of s.errorBars ?? []) {
        if (valid(b.hi, yScale)) y1 = Math.max(y1, b.hi);
        if (valid(b.lo, yScale)) y0 = Math.min(y0, b.lo);
      }
      for (const b of s.band ?? []) {
        if (valid(b.hi, yScale)) y1 = Math.max(y1, b.hi);
        if (valid(b.lo, yScale)) y0 = Math.min(y0, b.lo);
      }
    }
    if (!Number.isFinite(x0)) return null;
    const xd = xDomain ?? [x0, x1 === x0 ? x0 + 1 : x1];
    const yd = yDomain ?? (yScale === "log" ? [y0, y1 === y0 ? y0 * 10 : y1] : [0, y1 === 0 ? 1 : y1]);
    return { x: xd as [number, number], y: yd as [number, number] };
  }, [series, xDomain, yDomain, xScale, yScale]);

  const innerW = Math.max(10, width - M.left - right);
  const innerH = height - M.top - M.bottom;

  const sx = useMemo(() => makeScale(dom?.x ?? [0, 1], [0, innerW], xScale), [dom, innerW, xScale]);
  const sy = useMemo(() => makeScale(dom?.y ?? [0, 1], [innerH, 0], yScale), [dom, innerH, yScale]);
  const xTicks = useMemo(() => (dom ? ticks(dom.x, xScale, Math.max(3, Math.floor(innerW / 90))) : []), [dom, xScale, innerW]);
  const yTicks = useMemo(() => (dom ? ticks(dom.y, yScale, 6) : []), [dom, yScale]);

  // Path strings and label positions depend only on data, size, and scales —
  // memoized so hover re-renders (every mouse move) don't rebuild them. The
  // rank–abundance curve alone is ~9,000 points.
  const geom = useMemo(() => {
    if (!dom) return null;
    const fy = (v: number) => sy(clampY(v, dom.y, yScale)).toFixed(1);
    const path = (pts: XY[]) =>
      pts
        .filter((p) => valid(p.x, xScale) && valid(p.y, yScale))
        .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${fy(p.y)}`)
        .join("");
    const bandPath = (b: NonNullable<PlotSeries["band"]>) => {
      const ok = b.filter((p) => valid(p.x, xScale) && valid(p.hi, yScale));
      if (ok.length < 2) return "";
      const top = ok.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${fy(p.hi)}`).join("");
      const bottom = [...ok]
        .reverse()
        .map((p) => `L${sx(p.x).toFixed(1)},${fy(Math.max(p.lo, yScale === "log" ? dom.y[0] : p.lo))}`)
        .join("");
      return `${top}${bottom}Z`;
    };
    const lines = new Map(
      series.map((s) => [
        s.key,
        { segments: s.segments.map((seg) => ({ d: path(seg.points), dashed: seg.dashed })), band: s.band ? bandPath(s.band) : "" },
      ]),
    );
    // Non-overlapping end labels: sort by y, then push apart by 14px.
    const labels = endLabels
      ? series
          .map((s) => {
            const last = s.segments.flatMap((g) => g.points).filter((p) => valid(p.y, yScale)).at(-1);
            return last ? { s, y: sy(clampY(last.y, dom.y, yScale)), x: sx(last.x) } : null;
          })
          .filter((v): v is { s: PlotSeries; y: number; x: number } => v !== null)
          .sort((a, b) => a.y - b.y)
      : [];
    for (let i = 1; i < labels.length; i++) {
      if (labels[i]!.y - labels[i - 1]!.y < 14) labels[i]!.y = labels[i - 1]!.y + 14;
    }
    return { lines, labels };
  }, [dom, series, sx, sy, xScale, yScale, endLabels]);

  if (!dom || !geom) return <div ref={ref} style={{ height }} />;
  const { lines, labels } = geom;

  const hoverRows =
    hoverX === null
      ? []
      : series
          .map((s) => ({ s, y: interpolate(s, hoverX) }))
          .filter((r): r is { s: PlotSeries; y: number } => r.y !== null);

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - box.left - M.left;
          if (px < 0 || px > innerW) return setHoverX(null);
          setHoverX(sx.invert(px));
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        <g transform={`translate(${M.left},${M.top})`}>
          {yTicks.map((t) => (
            <g key={`y${t}`} transform={`translate(0,${sy(t)})`}>
              <line x2={innerW} stroke={GRID_STROKE} />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill="#5f6360">
                {yFormat(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={`x${t}`} transform={`translate(${sx(t)},${innerH})`}>
              <line y2={5} stroke={AXIS_STROKE} />
              <text y={18} textAnchor="middle" fontSize={11} fill="#5f6360">
                {xFormat(t)}
              </text>
            </g>
          ))}
          <line y1={innerH} y2={innerH} x2={innerW} stroke={AXIS_STROKE} />
          <text x={innerW / 2} y={innerH + 34} textAnchor="middle" fontSize={11} fill="#404342">
            {xLabel}
          </text>
          <text transform={`translate(${-48},${innerH / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="#404342">
            {yLabel}
          </text>

          {refLines.map((r) =>
            r.axis === "y" ? (
              <g key={`r${r.label}`} transform={`translate(0,${sy(clampY(r.value, dom.y, yScale))})`}>
                <line x2={innerW} stroke="#8A9094" strokeDasharray="2 3" />
                <text x={4} y={-4} fontSize={10} fill="#5f6360">{r.label}</text>
              </g>
            ) : (
              <g key={`r${r.label}`} transform={`translate(${sx(r.value)},0)`}>
                <line y2={innerH} stroke="#8A9094" strokeDasharray="2 3" />
                <text x={4} y={10} fontSize={10} fill="#5f6360">{r.label}</text>
              </g>
            ),
          )}

          {series.map((s) =>
            s.band ? <path key={`b${s.key}`} d={lines.get(s.key)?.band} fill={s.color} opacity={0.14} /> : null,
          )}
          {series.map((s) =>
            (lines.get(s.key)?.segments ?? []).map((seg, i) => (
              <path
                key={`${s.key}-${i}`}
                d={seg.d}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={seg.dashed ? "5 4" : undefined}
                strokeLinejoin="round"
              />
            )),
          )}
          {series.map((s) =>
            (s.errorBars ?? [])
              .filter((b) => valid(b.hi, yScale))
              .map((b, i) => (
                <g key={`${s.key}-e${i}`} stroke={s.color} strokeWidth={1.5}>
                  <line x1={sx(b.x)} x2={sx(b.x)} y1={sy(clampY(Math.max(b.lo, yScale === "log" ? dom.y[0] : b.lo), dom.y, yScale))} y2={sy(clampY(b.hi, dom.y, yScale))} />
                  <line x1={sx(b.x) - 4} x2={sx(b.x) + 4} y1={sy(clampY(b.hi, dom.y, yScale))} y2={sy(clampY(b.hi, dom.y, yScale))} />
                  <line x1={sx(b.x) - 4} x2={sx(b.x) + 4} y1={sy(clampY(Math.max(b.lo, yScale === "log" ? dom.y[0] : b.lo), dom.y, yScale))} y2={sy(clampY(Math.max(b.lo, yScale === "log" ? dom.y[0] : b.lo), dom.y, yScale))} />
                </g>
              )),
          )}
          {series.map((s) =>
            (s.markers ?? []).map((p, i) => (
              <circle
                key={`${s.key}-m${i}`}
                cx={sx(p.x)}
                cy={sy(clampY(p.y, dom.y, yScale))}
                r={4.5}
                fill={s.hollowMarkers ? "#FFFFFF" : s.color}
                stroke={s.hollowMarkers ? s.color : "#FFFFFF"}
                strokeWidth={2}
              />
            )),
          )}
          {labels.map(({ s, x, y }) => (
            <text key={`l${s.key}`} x={Math.min(x, innerW) + 8} y={y} dy="0.32em" fontSize={11} fill="#1F2222">
              {truncate(s.label, 16)}
            </text>
          ))}

          {hoverX !== null ? (
            <g pointerEvents="none">
              <line x1={sx(hoverX)} x2={sx(hoverX)} y2={innerH} stroke="#8A9094" />
              {hoverRows.map(({ s, y }) => (
                <circle
                  key={`h${s.key}`}
                  cx={sx(hoverX)}
                  cy={sy(clampY(y, dom.y, yScale))}
                  r={4}
                  fill={s.color}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
              ))}
            </g>
          ) : null}
        </g>
      </svg>

      {hoverX !== null && hoverRows.length > 0 ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-2 z-10 min-w-[160px] rounded-md border border-moss-200 bg-cream-50 px-3 py-2 text-xs text-bark-700 shadow-leaf"
          style={
            sx(hoverX) + M.left > width / 2
              ? { right: width - (sx(hoverX) + M.left) + 12 }
              : { left: sx(hoverX) + M.left + 12 }
          }
        >
          <div className="mb-1 text-[10px] uppercase tracking-wider text-moss-600">
            {xLabel}: {xFormat(hoverX)}
          </div>
          {hoverRows.map(({ s, y }) => (
            <div key={s.key} className="flex items-center justify-between gap-3 tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-medium">{yFormat(y)}</span>
            </div>
          ))}
          {tooltipExtra?.(hoverX)}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function useWidth(ref: React.RefObject<HTMLElement>): number {
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.round(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export interface ScaleFn {
  (v: number): number;
  invert: (px: number) => number;
}

export function makeScale(domain: [number, number], range: [number, number], kind: Scale): ScaleFn {
  const f = kind === "log" ? Math.log10 : (v: number) => v;
  const fi = kind === "log" ? (v: number) => 10 ** v : (v: number) => v;
  const d0 = f(domain[0]);
  const d1 = f(domain[1]);
  const k = (range[1] - range[0]) / (d1 - d0 || 1);
  const s = ((v: number) => range[0] + (f(v) - d0) * k) as ScaleFn;
  s.invert = (px: number) => fi(d0 + (px - range[0]) / k);
  return s;
}

function valid(v: number, kind: Scale): boolean {
  return Number.isFinite(v) && (kind === "linear" || v > 0);
}

function clampY(v: number, d: [number, number], kind: Scale): number {
  if (kind === "log") return Math.max(d[0], v);
  return v;
}

export function ticks(d: [number, number], kind: Scale, count: number): number[] {
  if (kind === "log") {
    // Decades only, unless the axis spans too few of them to read — then
    // add 2× and 5× steps (and 3× for very short ranges).
    const decades = Math.log10(d[1] / d[0]);
    const mults = decades >= 2.5 ? [1] : decades >= 1 ? [1, 2, 5] : [1, 2, 3, 5];
    const out: number[] = [];
    for (let e = Math.floor(Math.log10(d[0])); e <= Math.ceil(Math.log10(d[1])); e++) {
      for (const m of mults) {
        const v = m * 10 ** e;
        if (v >= d[0] * 0.999 && v <= d[1] * 1.001) out.push(v);
      }
    }
    return out;
  }
  const span = d[1] - d[0];
  if (span <= 0) return [d[0]];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(d[0] / step) * step; v <= d[1] + step * 1e-9; v += step) {
    out.push(Number(v.toPrecision(12)));
  }
  return out;
}

function interpolate(s: PlotSeries, x: number): number | null {
  for (const seg of s.segments) {
    const pts = seg.points;
    if (pts.length === 0) continue;
    if (x < pts[0]!.x || x > pts[pts.length - 1]!.x) continue;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (x >= a.x && x <= b.x) {
        const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
        return a.y + t * (b.y - a.y);
      }
    }
    if (pts.length === 1) return pts[0]!.y;
  }
  return null;
}

export function defaultFormat(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${Math.round(v / 1e3)}k`;
  if (a >= 100) return Math.round(v).toLocaleString();
  if (a >= 10) return v.toFixed(1).replace(/\.0$/, "");
  return v.toFixed(2).replace(/\.?0+$/, "");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
