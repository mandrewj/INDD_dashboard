"use client";

import { useMemo, useState } from "react";
import {
  useLoadedData,
  type CountyFeature,
} from "@/lib/dataContext";
import { useFilteredRecordsExceptCounty, useFilters } from "@/lib/filterContext";
import { countyRow, countySpeciesMatrix } from "@/lib/aggregates";
import { expectedNewSpecies, freqTable, sampleCoverage } from "@/lib/inext";
import { viridis } from "@/lib/colorscale";
import { FIELD } from "@/lib/types";
import { ChartCard, Toggle } from "./ChartCard";

type Metric = "species" | "observations" | "coverage" | "gaps";

/** Survey-gap grid: ~11 × 11 km cells in Indiana (0.1° lat × 0.125° lon). */
const CELL_LAT = 0.1;
const CELL_LON = 0.125;
/** Cells need this many identified records before estimating coverage. */
const MIN_CELL_RECORDS = 20;

interface GapCell {
  key: string;
  lat0: number;
  lon0: number;
  records: number;
  species: number;
  coverage: number;
  /**
   * Chance the next record in this cell is a species not yet recorded there
   * (1 − sample coverage; Good–Turing). Null if too few records to estimate.
   */
  gap: number | null;
  /** Expected new species if the cell's records were doubled (iNEXT ≤ 2n). */
  newIfDoubled: number;
  /** County holding most of the cell's records. */
  countyId: number;
}

interface CountyStats {
  /** county name (from geojson, matches dictionary label) */
  name: string;
  observations: number;
  species: number;
  /** Sample coverage Ĉ of the county's records (0–1). */
  coverage: number;
}

const VIEWBOX_W = 480;
const VIEWBOX_H = 540;
const VIEWBOX_PAD = 16;

export function CountyChoropleth() {
  const { counties, dictionaries } = useLoadedData();
  // All filters except county, so every county stays shaded (and
  // comparable) while one is selected.
  const filtered = useFilteredRecordsExceptCounty();
  const { filters, setCounty } = useFilters();
  const [metric, setMetric] = useState<Metric>("species");
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<GapCell | null>(null);

  // ---- Survey-gap grid (only computed when that view is on) ----
  const gaps = useMemo(() => {
    if (metric !== "gaps") return null;
    const byCell = new Map<string, { lat0: number; lon0: number; sp: Map<number, number>; counties: Map<number, number> }>();
    for (const r of filtered) {
      const lat = r[FIELD.LAT];
      const lon = r[FIELD.LON];
      const sp = r[FIELD.SPECIES];
      const c = r[FIELD.COUNTY];
      if (lat === null || lon === null || sp === 0 || c === 0) continue;
      const i = Math.floor(lat / CELL_LAT);
      const j = Math.floor(lon / CELL_LON);
      const key = `${i}:${j}`;
      let cell = byCell.get(key);
      if (!cell) byCell.set(key, (cell = { lat0: i * CELL_LAT, lon0: j * CELL_LON, sp: new Map(), counties: new Map() }));
      cell.sp.set(sp, (cell.sp.get(sp) ?? 0) + 1);
      cell.counties.set(c, (cell.counties.get(c) ?? 0) + 1);
    }
    const cells: GapCell[] = [];
    let max = 0;
    for (const [key, c] of byCell) {
      const t = freqTable([...c.sp.values()]);
      const gap = t.n >= MIN_CELL_RECORDS ? 1 - sampleCoverage(t) : null;
      if (gap !== null && gap > max) max = gap;
      let countyId = 0;
      let best = -1;
      for (const [cid, k] of c.counties) if (k > best) { best = k; countyId = cid; }
      cells.push({
        key,
        lat0: c.lat0,
        lon0: c.lon0,
        records: t.n,
        species: t.S,
        coverage: sampleCoverage(t),
        gap,
        newIfDoubled: gap === null ? 0 : expectedNewSpecies(t, t.n),
        countyId,
      });
    }
    return { cells, max };
  }, [metric, filtered]);

  // ---- Aggregate filtered records by county (shared, cached matrix) ----
  const { statsByName, unmappedObs, unmappedSpecies } = useMemo(() => {
    const m = countySpeciesMatrix(filtered, dictionaries.county.length, dictionaries.species.length);
    const stats = new Map<string, CountyStats>();
    for (let c = 1; c < m.nCounty; c++) {
      if (m.records[c] === 0) continue;
      const t = freqTable(countyRow(m, c));
      const name = dictionaries.county[c] ?? "(unknown)";
      stats.set(name, { name, observations: m.records[c]!, species: t.S, coverage: sampleCoverage(t) });
    }
    return { statsByName: stats, unmappedObs: m.records[0] ?? 0, unmappedSpecies: m.unmappedSpecies };
  }, [filtered, dictionaries.county, dictionaries.species.length]);

  const { minValue, maxValue } = useMemo(() => {
    let max = 0;
    let min = Infinity;
    for (const st of statsByName.values()) {
      const v = metricValue(st, metric);
      if (v > max) max = v;
      if (v < min) min = v;
    }
    // Coverage is shown relative to its observed range (it clusters near
    // 100%); counts are shown from zero.
    return { minValue: metric === "coverage" && Number.isFinite(min) ? min : 0, maxValue: max };
  }, [statsByName, metric]);

  // ---- Project geojson into the viewBox (Indiana-tight) ----
  const projection = useMemo(() => buildProjection(counties.features), [counties]);

  const paths = useMemo(() => {
    return counties.features.map((f) => ({
      name: f.properties.name,
      d: featureToPath(f, projection),
    }));
  }, [counties, projection]);

  return (
    <ChartCard
      title="Species by county"
      ignoreCounty
      subtitle={METRIC_SUBTITLE[metric]}
      controls={
        <Toggle
          label="Map metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "species", label: "Species" },
            { value: "observations", label: "Records" },
            { value: "coverage", label: "Completeness", title: "Inventory completeness (sample coverage)" },
            { value: "gaps", label: "Survey gaps", title: "Where would new surveys add the most species?" },
          ]}
        />
      }
      explainer={
        <>
          <p>
            <strong>Species</strong> and <strong>Records</strong> maps usually
            look alike: counties with more records have more species. That is
            mostly a map of where people collect (universities, parks, cities),
            not of where insects are most diverse.
          </p>
          <p>
            <strong>Completeness</strong> shades each county by sample coverage
            (Ĉ = 1 − f₁/n, adjusted): the estimated share of that county’s
            insect records belonging to species already found there. Dark
            counties are the least complete inventories, where one more survey
            would most likely add new species.
          </p>
          <p>
            <strong>Survey gaps</strong> divides the state into ~11 km grid
            cells and asks, for each cell with at least {MIN_CELL_RECORDS}{" "}
            records: what is the chance that the <em>next</em> record there is a
            species not yet recorded in that cell? That is 1 − sample coverage
            (the Good–Turing estimate: roughly the share of the cell’s records
            that are singletons). Bright cells are where a survey would most
            likely add new species; the tooltip also extrapolates how many new
            species doubling the cell’s records would add. Hatched cells have too
            few records to estimate. They are gaps too, just unmeasured ones.
            Blank areas have no records at all.
          </p>
        </>
      }
      caveat={
        unmappedObs > 0 ? (
          <>
            {unmappedObs.toLocaleString()} record{unmappedObs === 1 ? "" : "s"}{" "}
            ({unmappedSpecies.toLocaleString()} unique species) couldn’t be placed
            in a county and aren’t shown on the map. Filter to{" "}
            <button
              type="button"
              onClick={() => setCounty(0)}
              className="underline underline-offset-2 hover:text-forest-700"
            >
              Unknown / unmapped
            </button>{" "}
            to inspect them.
          </>
        ) : (
          "All records placed in counties."
        )
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
        <div className="relative">
          <svg
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            role="img"
            aria-label={`Choropleth map of Indiana counties shaded by ${METRIC_LABEL[metric].toLowerCase()}.`}
            className="w-full"
          >
            <title>Indiana county map · {METRIC_LABEL[metric]}</title>
            <g>
              {paths.map((p) => {
                const stats = statsByName.get(p.name);
                const value = stats ? metricValue(stats, metric) : 0;
                const span = maxValue - minValue;
                const t = span > 0 ? (value - minValue) / span : 1;
                const fill =
                  metric === "gaps" ? "#F8F9FA" : !stats || value === 0 ? "#F1F3F5" : viridis(t);
                const isHovered = hovered === p.name;
                const isSelected =
                  filters.countyId !== null &&
                  filters.countyId !== 0 &&
                  dictionaries.county[filters.countyId] === p.name;
                return (
                  <path
                    key={p.name}
                    d={p.d}
                    fill={fill}
                    stroke={
                      isSelected
                        ? "#1F95B8"
                        : isHovered
                          ? "#080808"
                          : "#080808"
                    }
                    strokeWidth={isSelected ? 2 : isHovered ? 1.4 : metric === "gaps" ? 0.3 : 0.5}
                    onMouseEnter={() => setHovered(p.name)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(p.name)}
                    onBlur={() => setHovered(null)}
                    onClick={() => {
                      // Map county-name → dictionary id
                      const id = dictionaries.county.indexOf(p.name);
                      if (id <= 0) return;
                      setCounty(filters.countyId === id ? null : id);
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${p.name} County: ${stats ? `${stats.species.toLocaleString()} species, ${stats.observations.toLocaleString()} records, ${(100 * stats.coverage).toFixed(1)}% complete` : "no records under current filters"}`}
                    className="cursor-pointer outline-none transition-colors"
                  />
                );
              })}
            </g>
            {gaps ? (
              <g>
                <defs>
                  <pattern id="gap-sparse" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="4" height="4" fill="#EEF1F2" />
                    <line x1="0" y1="0" x2="0" y2="4" stroke="#B7BDC0" strokeWidth="1.2" />
                  </pattern>
                </defs>
                {gaps.cells.map((c) => {
                  const [x0, y0] = projection.project(c.lon0, c.lat0 + CELL_LAT);
                  const [x1, y1] = projection.project(c.lon0 + CELL_LON, c.lat0);
                  const fill =
                    c.gap === null ? "url(#gap-sparse)" : viridis(gaps.max > 0 ? c.gap / gaps.max : 0);
                  const hov = hoveredCell?.key === c.key;
                  return (
                    <rect
                      key={c.key}
                      x={x0}
                      y={y0}
                      width={Math.max(0.5, x1 - x0)}
                      height={Math.max(0.5, y1 - y0)}
                      fill={fill}
                      stroke={hov ? "#080808" : "#FFFFFF"}
                      strokeWidth={hov ? 1.2 : 0.3}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredCell(c)}
                      onMouseLeave={() => setHoveredCell(null)}
                      onClick={() => setCounty(filters.countyId === c.countyId ? null : c.countyId)}
                    >
                      <title>{`Near ${dictionaries.county[c.countyId]} Co.: ${c.records} records, ${c.species} species`}</title>
                    </rect>
                  );
                })}
              </g>
            ) : null}
          </svg>

          {hoveredCell ? (
            <CellTip cell={hoveredCell} county={dictionaries.county[hoveredCell.countyId] ?? ""} />
          ) : hovered ? (
            <HoverTip
              name={hovered}
              stats={statsByName.get(hovered) ?? null}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          {gaps ? (
            <GapPanel
              cells={gaps.cells}
              max={gaps.max}
              countyName={(id) => dictionaries.county[id] ?? ""}
              onPick={(id) => setCounty(id)}
            />
          ) : (
            <>
              <Legend min={minValue} max={maxValue} metric={metric} />
              <Summary
                statsByName={statsByName}
                metric={metric}
                countyCount={counties.features.length}
              />
            </>
          )}
        </div>
      </div>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------

const METRIC_LABEL: Record<Metric, string> = {
  species: "Species",
  observations: "Records",
  coverage: "Completeness",
  gaps: "Survey gaps",
};

const METRIC_SUBTITLE: Record<Metric, string> = {
  species: "Distinct species recorded in each county under the active filters. Click a county to filter.",
  observations: "Number of occurrence records per county — a map of sampling effort. Click a county to filter.",
  coverage: "Estimated inventory completeness (sample coverage) per county. Darker = more species likely still unrecorded.",
  gaps: "Chance the next record in each ~11 km cell is a species new to that cell. Brighter = better place to survey next.",
};

function metricValue(s: CountyStats, m: Metric): number {
  return m === "observations" ? s.observations : m === "coverage" ? s.coverage : s.species;
}

function formatMetric(v: number, m: Metric): string {
  return m === "coverage" ? `${(100 * v).toFixed(1)}%` : Math.round(v).toLocaleString();
}

function HoverTip({
  name,
  stats,
}: {
  name: string;
  stats: CountyStats | null;
}) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute right-2 top-2 max-w-[220px] rounded-md border border-forest-200 bg-cream-50/95 p-3 text-xs text-bark-700 shadow-leaf"
    >
      <div className="font-serif text-sm font-semibold text-forest-800">{name}</div>
      {stats ? (
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
          <dt className="text-moss-600">Species</dt>
          <dd className="text-right">{stats.species.toLocaleString()}</dd>
          <dt className="text-moss-600">Records</dt>
          <dd className="text-right">{stats.observations.toLocaleString()}</dd>
          <dt className="text-moss-600">Completeness</dt>
          <dd className="text-right">{formatMetric(stats.coverage, "coverage")}</dd>
        </dl>
      ) : (
        <div className="mt-1.5 text-moss-700">No records under current filters.</div>
      )}
      <div className="mt-1.5 text-[10px] text-moss-500">Click to filter to this county</div>
    </div>
  );
}

function Legend({ min, max, metric }: { min: number; max: number; metric: Metric }) {
  const stops = 9;
  const ticks = max <= min ? [max] : [min, (min + max) / 2, max];
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-moss-600">
        {METRIC_LABEL[metric]}
      </div>
      <div
        className="h-3 w-full rounded"
        style={{
          background: `linear-gradient(to right, ${Array.from(
            { length: stops },
            (_, i) => viridis(i / (stops - 1)),
          ).join(", ")})`,
        }}
      />
      <div className="mt-1 flex justify-between text-[10px] text-moss-700 tabular-nums">
        {ticks.map((t, i) => (
          <span key={i}>{formatMetric(t, metric)}</span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-moss-700">
        <span
          aria-hidden
          className="inline-block h-3 w-4 rounded-sm border border-forest-200 bg-cream-100"
        />
        No records
      </div>
    </div>
  );
}

function Summary({
  statsByName,
  metric,
  countyCount,
}: {
  statsByName: Map<string, CountyStats>;
  metric: Metric;
  countyCount: number;
}) {
  // For completeness, list the *least* complete counties — the survey gaps.
  const ascending = metric === "coverage";
  const top = useMemo(() => {
    return [...statsByName.values()]
      .sort((a, b) =>
        ascending
          ? metricValue(a, metric) - metricValue(b, metric)
          : metricValue(b, metric) - metricValue(a, metric),
      )
      .slice(0, 5);
  }, [statsByName, metric, ascending]);

  const observed = statsByName.size;
  return (
    <div className="rounded-md border border-forest-100 bg-cream-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-moss-600">
        {ascending ? "Least complete" : "Top counties"}
      </div>
      <div className="mt-1 text-[11px] text-bark-600">
        {observed.toLocaleString()} of {countyCount} counties have records
      </div>
      {top.length === 0 ? (
        <div className="mt-2 text-xs text-moss-700">No data.</div>
      ) : (
        <ol className="mt-2 space-y-1 text-xs text-bark-700">
          {top.map((s, i) => (
            <li key={s.name} className="flex items-baseline justify-between gap-2">
              <span className="truncate">
                <span className="text-moss-600 tabular-nums">{i + 1}. </span>
                {s.name}
              </span>
              <span className="font-serif tabular-nums text-forest-700">
                {formatMetric(metricValue(s, metric), metric)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function CellTip({ cell, county }: { cell: GapCell; county: string }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute right-2 top-2 max-w-[220px] rounded-md border border-forest-200 bg-cream-50/95 p-3 text-xs text-bark-700 shadow-leaf"
    >
      <div className="font-serif text-sm font-semibold text-forest-800">Cell near {county} Co.</div>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-moss-600">Records</dt>
        <dd className="text-right">{cell.records.toLocaleString()}</dd>
        <dt className="text-moss-600">Species</dt>
        <dd className="text-right">{cell.species.toLocaleString()}</dd>
        <dt className="text-moss-600">Completeness</dt>
        <dd className="text-right">{(100 * cell.coverage).toFixed(0)}%</dd>
        <dt className="text-moss-600">Next record new</dt>
        <dd className="text-right font-semibold">
          {cell.gap === null ? "too few" : `${(100 * cell.gap).toFixed(0)}%`}
        </dd>
        <dt className="text-moss-600">Double effort →</dt>
        <dd className="text-right">{cell.gap === null ? "—" : `+${cell.newIfDoubled.toFixed(0)} spp.`}</dd>
      </dl>
    </div>
  );
}

function GapPanel({
  cells,
  max,
  countyName,
  onPick,
}: {
  cells: GapCell[];
  max: number;
  countyName: (id: number) => string;
  onPick: (countyId: number) => void;
}) {
  const ranked = useMemo(
    () =>
      cells
        .filter((c): c is GapCell & { gap: number } => c.gap !== null)
        .sort((a, b) => b.gap - a.gap || b.records - a.records)
        .slice(0, 6),
    [cells],
  );
  const sparse = cells.filter((c) => c.gap === null).length;
  const stops = 9;
  return (
    <>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-moss-600">
          Chance next record is a new species
        </div>
        <div
          className="h-3 w-full rounded"
          style={{
            background: `linear-gradient(to right, ${Array.from({ length: stops }, (_, i) => viridis(i / (stops - 1))).join(", ")})`,
          }}
        />
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-moss-700">
          <span>0%</span>
          <span>{(100 * max).toFixed(0)}%</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-moss-700">
          <svg aria-hidden width="16" height="12">
            <defs>
              <pattern id="gap-legend" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="4" height="4" fill="#EEF1F2" />
                <line x1="0" y1="0" x2="0" y2="4" stroke="#B7BDC0" strokeWidth="1.2" />
              </pattern>
            </defs>
            <rect width="16" height="12" fill="url(#gap-legend)" stroke="#D9DDDF" />
          </svg>
          &lt;{MIN_CELL_RECORDS} records ({sparse} cells)
        </div>
      </div>
      <div className="rounded-md border border-forest-100 bg-cream-50 p-2.5">
        <div className="text-[10px] uppercase tracking-wider text-moss-600">Where to survey next</div>
        <ol className="mt-1.5 space-y-1 text-xs text-bark-700">
          {ranked.map((c, i) => {
            // Several cells can sit in the same county: number the repeats.
            const nth = ranked.slice(0, i + 1).filter((o) => o.countyId === c.countyId).length;
            const center = `${(c.lat0 + CELL_LAT / 2).toFixed(2)}°N, ${Math.abs(c.lon0 + CELL_LON / 2).toFixed(2)}°W`;
            return (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => onPick(c.countyId)}
                className="flex w-full items-baseline justify-between gap-2 text-left hover:text-forest-700"
                title={`Cell centred ${center}: ${c.records} records, ${c.species} species; doubling effort would add ~${c.newIfDoubled.toFixed(0)} species. Click to filter to ${countyName(c.countyId)} Co.`}
              >
                <span className="truncate">
                  <span className="tabular-nums text-moss-600">{i + 1}. </span>
                  near {countyName(c.countyId)}
                  {nth > 1 ? <span className="text-moss-600"> ({nth})</span> : null}
                </span>
                <span className="font-serif tabular-nums text-forest-700">{(100 * c.gap).toFixed(0)}%</span>
              </button>
            </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Projection: compute lat/lon → SVG x/y for the Indiana counties geojson.
// Aspect-corrected at the data centroid so counties don't look squished.

interface Projection {
  project: (lon: number, lat: number) => [number, number];
}

function buildProjection(features: readonly CountyFeature[]): Projection {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const f of features) {
    const rings =
      f.geometry.type === "Polygon"
        ? f.geometry.coordinates
        : f.geometry.coordinates.flat();
    for (const ring of rings) {
      for (const [lon, lat] of ring) {
        if (lon! < minLon) minLon = lon!;
        if (lon! > maxLon) maxLon = lon!;
        if (lat! < minLat) minLat = lat!;
        if (lat! > maxLat) maxLat = lat!;
      }
    }
  }
  const meanLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((meanLat * Math.PI) / 180);
  // Effective dimensions in "scaled lon × lat" units
  const dxRaw = (maxLon - minLon) * lonScale;
  const dyRaw = maxLat - minLat;
  const usableW = VIEWBOX_W - 2 * VIEWBOX_PAD;
  const usableH = VIEWBOX_H - 2 * VIEWBOX_PAD;
  const k = Math.min(usableW / dxRaw, usableH / dyRaw);
  const offsetX = (usableW - dxRaw * k) / 2 + VIEWBOX_PAD;
  const offsetY = (usableH - dyRaw * k) / 2 + VIEWBOX_PAD;

  return {
    project(lon: number, lat: number): [number, number] {
      const x = (lon - minLon) * lonScale * k + offsetX;
      const y = (maxLat - lat) * k + offsetY; // flip y for SVG
      return [x, y];
    },
  };
}

function ringToPath(ring: number[][], proj: Projection): string {
  let d = "";
  for (let i = 0; i < ring.length; i++) {
    const pt = ring[i];
    if (!pt) continue;
    const [lon, lat] = pt;
    if (typeof lon !== "number" || typeof lat !== "number") continue;
    const [x, y] = proj.project(lon, lat);
    d += i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d + "Z";
}

function featureToPath(f: CountyFeature, proj: Projection): string {
  if (f.geometry.type === "Polygon") {
    return f.geometry.coordinates.map((r) => ringToPath(r, proj)).join(" ");
  }
  return f.geometry.coordinates
    .flatMap((poly) => poly.map((r) => ringToPath(r, proj)))
    .join(" ");
}

