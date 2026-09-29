"use client";

import { useMemo, useRef, useState } from "react";
import { useLoadedData } from "@/lib/dataContext";
import { useFilteredRecordsExceptCounty, useFilters } from "@/lib/filterContext";
import { makeEstimator, sampleCoverage, freqTable } from "@/lib/inext";
import { FIELD } from "@/lib/types";
import { AXIS_STROKE, ChartCard, EmptyState, GRID_STROKE } from "./ChartCard";
import { defaultFormat, makeScale, ticks, useWidth } from "./LinePlot";

interface CountyPoint {
  id: number;
  name: string;
  records: number;
  species: number;
  coverage: number;
  /** Species expected from a random draw of `records` from the statewide pool. */
  expected: number;
}

const H = 340;
const M = { top: 12, right: 16, bottom: 40, left: 56 };

/**
 * Effort vs. richness per county, on log–log axes, against the statewide
 * rarefaction curve. Separates "this county is species-rich" from "this
 * county has been sampled a lot" — the two are confounded on the map.
 */
export function CountyEffort() {
  const { dictionaries } = useLoadedData();
  const records = useFilteredRecordsExceptCounty();
  const { filters, setCounty } = useFilters();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const [hover, setHover] = useState<CountyPoint | null>(null);

  const { points, curve } = useMemo(() => {
    const nSp = dictionaries.species.length;
    const byCounty = new Map<number, Int32Array>();
    const pooled = new Int32Array(nSp);
    for (const r of records) {
      const c = r[FIELD.COUNTY];
      const sp = r[FIELD.SPECIES];
      if (c === 0 || sp === 0) continue;
      let v = byCounty.get(c);
      if (!v) byCounty.set(c, (v = new Int32Array(nSp)));
      v[sp] = v[sp]! + 1;
      pooled[sp] = pooled[sp]! + 1;
    }
    const est = makeEstimator(pooled);
    const pts: CountyPoint[] = [];
    for (const [id, v] of byCounty) {
      const t = freqTable(v);
      if (t.n === 0) continue;
      pts.push({
        id,
        name: dictionaries.county[id] ?? "(unknown)",
        records: t.n,
        species: t.S,
        coverage: sampleCoverage(t),
        expected: est.hillAt(t.n, 0),
      });
    }
    const N = est.t.n;
    const curve: Array<{ x: number; y: number }> = [];
    if (N > 0) {
      for (let k = 0; k <= 60; k++) {
        const m = Math.max(1, Math.round(10 ** ((Math.log10(N) * k) / 60)));
        curve.push({ x: m, y: est.hillAt(m, 0) });
      }
    }
    return { points: pts, curve };
  }, [records, dictionaries.county, dictionaries.species.length]);

  const above = points.filter((p) => p.species > p.expected).length;
  const innerW = Math.max(10, width - M.left - M.right);
  const innerH = H - M.top - M.bottom;
  const maxX = Math.max(10, ...points.map((p) => p.records));
  const maxY = Math.max(10, ...points.map((p) => p.species));
  const sx = makeScale([1, maxX * 1.2], [0, innerW], "log");
  const sy = makeScale([1, maxY * 1.3], [innerH, 0], "log");
  const xt = ticks([1, maxX * 1.2], "log", 5);
  const yt = ticks([1, maxY * 1.3], "log", 5);
  const selected = filters.countyId;

  const linePath = curve
    .filter((p) => p.x <= maxX * 1.2)
    .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(Math.max(1, p.y)).toFixed(1)}`)
    .join("");

  return (
    <ChartCard
      title="Sampling effort vs. species per county"
      subtitle={
        points.length > 0 ? (
          <>
            Each dot is a county. The line is the species count expected if a
            county’s records were a random draw from the whole state.{" "}
            {above} of {points.length} counties sit above it. Click a dot to
            filter.
          </>
        ) : undefined
      }
      explainer={
        <>
          <p>
            Species counts on the map rise with the number of records, so a
            “rich” county may just be a well-studied one. Log–log axes make the
            relationship close to a straight line. A county’s position{" "}
            <em>along</em> the line tells you about effort; its distance{" "}
            <em>above or below</em> it tells you about diversity once effort is
            accounted for.
          </p>
          <p>
            The reference line is the statewide rarefaction curve (iNEXT,
            <i> q</i>=0). Most counties fall below it because any one county
            holds only part of the state’s fauna (β-diversity) and because
            collectors in a county often target particular groups.
          </p>
          <p>
            <strong>Try this:</strong> which counties have fewer than ~500
            records? Where would a new survey add the most? Compare Tippecanoe
            (home of Purdue) with its neighbours.
          </p>
        </>
      }
    >
      {points.length === 0 ? (
        <EmptyState>No county-placed records under the current filters.</EmptyState>
      ) : (
        <div ref={ref} className="relative">
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`Scatter plot of records versus species for ${points.length} Indiana counties, log scales, with a statewide rarefaction reference curve.`}
          >
            <g transform={`translate(${M.left},${M.top})`}>
              {yt.map((t) => (
                <g key={`y${t}`} transform={`translate(0,${sy(t)})`}>
                  <line x2={innerW} stroke={GRID_STROKE} />
                  <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill="#5f6360">{defaultFormat(t)}</text>
                </g>
              ))}
              {xt.map((t) => (
                <g key={`x${t}`} transform={`translate(${sx(t)},${innerH})`}>
                  <line y2={5} stroke={AXIS_STROKE} />
                  <text y={18} textAnchor="middle" fontSize={11} fill="#5f6360">{defaultFormat(t)}</text>
                </g>
              ))}
              <line y1={innerH} y2={innerH} x2={innerW} stroke={AXIS_STROKE} />
              <text x={innerW / 2} y={innerH + 34} textAnchor="middle" fontSize={11} fill="#404342">
                Records identified to species (log scale)
              </text>
              <text transform={`translate(-42,${innerH / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="#404342">
                Species (log scale)
              </text>
              <path d={linePath} fill="none" stroke="#8A9094" strokeWidth={2} strokeDasharray="5 4" />
              {points.map((p) => {
                const isSel = p.id === selected;
                const isHov = hover?.id === p.id;
                return (
                  <g key={p.id}>
                    <circle
                      cx={sx(p.records)}
                      cy={sy(p.species)}
                      r={isSel || isHov ? 6 : 4.5}
                      fill={isSel ? "#E69F00" : "#0072B2"}
                      fillOpacity={isSel ? 1 : 0.75}
                      stroke="#FFFFFF"
                      strokeWidth={1.5}
                    />
                    {/* Larger invisible hit target */}
                    <circle
                      cx={sx(p.records)}
                      cy={sy(p.species)}
                      r={10}
                      fill="transparent"
                      className="cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-label={`${p.name} County: ${p.records.toLocaleString()} records, ${p.species.toLocaleString()} species`}
                      onMouseEnter={() => setHover(p)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(p)}
                      onBlur={() => setHover(null)}
                      onClick={() => setCounty(selected === p.id ? null : p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setCounty(selected === p.id ? null : p.id);
                        }
                      }}
                    />
                    {isSel ? (
                      <text x={sx(p.records) + 9} y={sy(p.species)} dy="0.32em" fontSize={11} fill="#1F2222">
                        {p.name}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>
          {hover ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 rounded-md border border-moss-200 bg-cream-50 px-3 py-2 text-xs text-bark-700 shadow-leaf"
              style={{
                top: Math.max(0, sy(hover.species) + M.top - 70),
                ...(sx(hover.records) > innerW / 2
                  ? { right: width - (sx(hover.records) + M.left) + 14 }
                  : { left: sx(hover.records) + M.left + 14 }),
              }}
            >
              <div className="font-serif text-sm font-semibold text-forest-800">{hover.name} County</div>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 tabular-nums">
                <dt className="text-moss-600">Records</dt>
                <dd className="text-right">{hover.records.toLocaleString()}</dd>
                <dt className="text-moss-600">Species</dt>
                <dd className="text-right">{hover.species.toLocaleString()}</dd>
                <dt className="text-moss-600">Expected*</dt>
                <dd className="text-right">{Math.round(hover.expected).toLocaleString()}</dd>
                <dt className="text-moss-600">Coverage</dt>
                <dd className="text-right">{(100 * hover.coverage).toFixed(1)}%</dd>
              </dl>
              <div className="mt-1 text-[10px] text-moss-500">*random draw of same size from statewide pool</div>
            </div>
          ) : null}
        </div>
      )}
    </ChartCard>
  );
}
