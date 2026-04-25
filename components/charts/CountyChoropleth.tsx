"use client";

import { useMemo, useState } from "react";
import {
  useLoadedData,
  type CountyFeature,
} from "@/lib/dataContext";
import { useFilteredRecords, useFilters } from "@/lib/filterContext";
import { viridis } from "@/lib/colorscale";
import { FIELD } from "@/lib/types";
import { ChartCard } from "./ChartCard";

type Metric = "species" | "observations";

interface CountyStats {
  /** county name (from geojson, matches dictionary label) */
  name: string;
  observations: number;
  species: number;
}

const VIEWBOX_W = 480;
const VIEWBOX_H = 540;
const VIEWBOX_PAD = 16;

export function CountyChoropleth() {
  const { counties, dictionaries } = useLoadedData();
  const filtered = useFilteredRecords();
  const { filters, setCounty } = useFilters();
  const [metric, setMetric] = useState<Metric>("species");
  const [hovered, setHovered] = useState<string | null>(null);

  // ---- Aggregate filtered records by county name ----
  const { statsByName, unmappedObs, unmappedSpecies, maxValue } = useMemo(() => {
    const byName = new Map<string, { obs: number; species: Set<number> }>();
    let unmappedObsCount = 0;
    const unmappedSp = new Set<number>();
    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i]!;
      const cId = r[FIELD.COUNTY];
      const sp = r[FIELD.SPECIES];
      if (cId === 0) {
        unmappedObsCount++;
        if (sp !== 0) unmappedSp.add(sp);
        continue;
      }
      const name = dictionaries.county[cId] ?? "(unknown)";
      let bucket = byName.get(name);
      if (!bucket) {
        bucket = { obs: 0, species: new Set<number>() };
        byName.set(name, bucket);
      }
      bucket.obs++;
      if (sp !== 0) bucket.species.add(sp);
    }
    const stats = new Map<string, CountyStats>();
    let max = 0;
    for (const [name, b] of byName) {
      const s: CountyStats = {
        name,
        observations: b.obs,
        species: b.species.size,
      };
      stats.set(name, s);
      const v = metric === "species" ? s.species : s.observations;
      if (v > max) max = v;
    }
    return {
      statsByName: stats,
      unmappedObs: unmappedObsCount,
      unmappedSpecies: unmappedSp.size,
      maxValue: max,
    };
  }, [filtered, dictionaries.county, metric]);

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
      title="County species richness"
      subtitle={
        metric === "species"
          ? "Each county shaded by the number of distinct species observed under the active filters."
          : "Each county shaded by the number of observation records under the active filters."
      }
      controls={<MetricToggle value={metric} onChange={setMetric} />}
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative">
          <svg
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            role="img"
            aria-label={`Choropleth map of Indiana counties shaded by ${metric === "species" ? "unique species count" : "observation count"}.`}
            className="w-full"
          >
            <title>Indiana county map · {metric === "species" ? "species richness" : "observation count"}</title>
            <g>
              {paths.map((p) => {
                const stats = statsByName.get(p.name);
                const value = stats
                  ? metric === "species"
                    ? stats.species
                    : stats.observations
                  : 0;
                const t = maxValue > 0 ? value / maxValue : 0;
                const fill = value === 0 ? "#F5EFE2" : viridis(t);
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
                        ? "#D9A441"
                        : isHovered
                          ? "#1B331C"
                          : "#244126"
                    }
                    strokeWidth={isSelected ? 2 : isHovered ? 1.4 : 0.5}
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
                    aria-label={`${p.name} County: ${stats ? `${stats.species.toLocaleString()} species, ${stats.observations.toLocaleString()} observations` : "no records under current filters"}`}
                    className="cursor-pointer outline-none transition-colors"
                  />
                );
              })}
            </g>
          </svg>

          {hovered ? (
            <HoverTip
              name={hovered}
              stats={statsByName.get(hovered) ?? null}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Legend max={maxValue} metric={metric} />
          <Summary
            statsByName={statsByName}
            metric={metric}
            countyCount={counties.features.length}
          />
        </div>
      </div>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------

function MetricToggle({
  value,
  onChange,
}: {
  value: Metric;
  onChange: (m: Metric) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Map metric"
      className="inline-flex overflow-hidden rounded-md border border-forest-200 bg-cream-50 text-xs"
    >
      {(["species", "observations"] as const).map((m) => {
        const active = m === value;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={active}
            className={
              active
                ? "bg-forest-600 px-3 py-1.5 font-medium text-cream-50"
                : "bg-transparent px-3 py-1.5 text-forest-700 hover:bg-cream-200"
            }
          >
            {m === "species" ? "Species" : "Observations"}
          </button>
        );
      })}
    </div>
  );
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
          <dt className="text-moss-600">Observations</dt>
          <dd className="text-right">{stats.observations.toLocaleString()}</dd>
        </dl>
      ) : (
        <div className="mt-1.5 text-moss-700">No records under current filters.</div>
      )}
      <div className="mt-1.5 text-[10px] text-moss-500">Click to filter to this county</div>
    </div>
  );
}

function Legend({ max, metric }: { max: number; metric: Metric }) {
  const stops = 9;
  const ticks = useMemo(() => {
    if (max === 0) return [0];
    return [0, Math.round(max / 2), max];
  }, [max]);
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-moss-600">
        {metric === "species" ? "Unique species" : "Observations"}
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
          <span key={i}>{t.toLocaleString()}</span>
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
  const top = useMemo(() => {
    return [...statsByName.values()]
      .sort((a, b) => {
        const av = metric === "species" ? a.species : a.observations;
        const bv = metric === "species" ? b.species : b.observations;
        return bv - av;
      })
      .slice(0, 5);
  }, [statsByName, metric]);

  const observed = statsByName.size;
  return (
    <div className="rounded-md border border-forest-100 bg-cream-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-moss-600">
        Top counties
      </div>
      <div className="mt-1 text-[11px] text-bark-600">
        {observed.toLocaleString()} of {countyCount} counties have records
      </div>
      {top.length === 0 ? (
        <div className="mt-2 text-xs text-moss-700">No data.</div>
      ) : (
        <ol className="mt-2 space-y-1 text-xs text-bark-700">
          {top.map((s, i) => {
            const v = metric === "species" ? s.species : s.observations;
            return (
              <li key={s.name} className="flex items-baseline justify-between gap-2">
                <span className="truncate">
                  <span className="text-moss-600 tabular-nums">{i + 1}. </span>
                  {s.name}
                </span>
                <span className="font-serif tabular-nums text-forest-700">
                  {v.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
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

