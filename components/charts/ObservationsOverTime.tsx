"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLoadedData } from "@/lib/dataContext";
import { useFilteredRecords } from "@/lib/filterContext";
import { FIELD, type RecordTuple } from "@/lib/types";
import {
  AXIS_STROKE,
  AXIS_TICK,
  ChartCard,
  EmptyState,
  GRID_STROKE,
  SERIES_COLORS,
  TOOLTIP_STYLE,
  Toggle,
} from "./ChartCard";

type Metric = "records" | "species" | "cumulative";

const SOURCES = [
  { key: "obs", label: "Human observations", color: SERIES_COLORS[0] },
  { key: "spec", label: "Museum specimens", color: SERIES_COLORS[1] },
  { key: "other", label: "Other sources", color: SERIES_COLORS[2] },
] as const;

interface YearRow {
  year: number;
  obs: number;
  spec: number;
  other: number;
  total: number;
  species: number;
  newSpecies: number;
  cumulative: number;
}

export function ObservationsOverTime() {
  const { dictionaries } = useLoadedData();
  const filtered = useFilteredRecords();
  const [metric, setMetric] = useState<Metric>("records");

  const { rows, noYear } = useMemo(
    () => aggregateByYear(filtered, dictionaries.basisOfRecord, dictionaries.species.length),
    [filtered, dictionaries.basisOfRecord, dictionaries.species.length],
  );

  const totalPlaced = rows.reduce((s, r) => s + r.total, 0);
  const obsShare = totalPlaced ? rows.reduce((s, r) => s + r.obs, 0) / totalPlaced : 0;
  const last = rows[rows.length - 1];

  return (
    <ChartCard
      title="Records through time"
      subtitle={
        metric === "records" ? (
          <>
            {totalPlaced.toLocaleString()} dated records by year and data source.{" "}
            {(100 * obsShare).toFixed(0)}% are human observations (mostly iNaturalist).
          </>
        ) : metric === "species" ? (
          <>Distinct species recorded in each year.</>
        ) : (
          <>
            Cumulative species recorded in Indiana by year of first record:{" "}
            {last ? last.cumulative.toLocaleString() : 0} species by {last?.year ?? "—"}.
          </>
        )
      }
      controls={
        <Toggle
          label="Time-series metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "records", label: "Records" },
            { value: "species", label: "Species / year" },
            { value: "cumulative", label: "Discovery curve" },
          ]}
        />
      }
      caveat={
        noYear > 0
          ? `${noYear.toLocaleString()} record${noYear === 1 ? "" : "s"} without a year are not shown.`
          : "All filtered records are dated."
      }
      explainer={
        <>
          <p>
            <strong>Records</strong> shows how the <em>way</em> insects are
            documented has changed: museum specimens dominate the 20th century,
            while smartphone observations dominate since the 2010s. A trend in
            records is therefore mostly a trend in people, not insects.
          </p>
          <p>
            <strong>Discovery curve</strong> counts each species once, in the
            year it was first recorded. A curve still climbing steeply means the
            state list is far from complete; a levelling curve suggests the
            common fauna is known. Compare the discovery curve for a well-known
            group (butterflies: Lepidoptera → Nymphalidae) with a poorly known
            one (e.g. Diptera).
          </p>
          <p>
            <strong>Caution:</strong> a species’ last record is not evidence of
            decline or extinction. Test that with effort-corrected methods
            (e.g. occupancy models or list-length analysis).
          </p>
        </>
      }
    >
      <div
        className="h-[320px] w-full"
        role="img"
        aria-label={`Chart of ${metric === "records" ? "records per year by data source" : metric === "species" ? "species per year" : "cumulative species by year of first record"}, ${rows[0]?.year ?? ""} to ${last?.year ?? ""}.`}
      >
        {rows.length === 0 ? (
          <EmptyState>No dated records match the current filters.</EmptyState>
        ) : metric === "records" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} barCategoryGap={0}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="year" tick={AXIS_TICK} stroke={AXIS_STROKE} minTickGap={28} />
              <YAxis tick={AXIS_TICK} stroke={AXIS_STROKE} tickFormatter={(v: number) => v.toLocaleString()} width={52} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: "rgba(17,109,255,0.06)" }}
                formatter={(v: number, name: string) => [v.toLocaleString(), SOURCES.find((s) => s.key === name)?.label ?? name]}
              />
              {SOURCES.map((s) => (
                <Bar key={s.key} dataKey={s.key} stackId="src" fill={s.color} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="year" type="number" domain={["dataMin", "dataMax"]} tick={AXIS_TICK} stroke={AXIS_STROKE} minTickGap={28} />
              <YAxis tick={AXIS_TICK} stroke={AXIS_STROKE} tickFormatter={(v: number) => v.toLocaleString()} width={52} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(y: number) => String(y)}
                formatter={(v: number, _n: string, item: { payload?: YearRow }) =>
                  metric === "cumulative"
                    ? [`${v.toLocaleString()} (+${(item.payload?.newSpecies ?? 0).toLocaleString()} new)`, "Species so far"]
                    : [v.toLocaleString(), "Species"]
                }
              />
              <Line
                type="linear"
                dataKey={metric === "cumulative" ? "cumulative" : "species"}
                stroke={SERIES_COLORS[0]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: SERIES_COLORS[0], stroke: "#FFFFFF", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {metric === "records" ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-bark-700">
          {SOURCES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </ChartCard>
  );
}

/**
 * One pass with typed arrays: per-year counts by source, distinct species
 * per year (year × species bitmap), and each species' first year (for the
 * discovery curve). ~10× faster than Map/Set-per-year on the full dataset.
 */
function aggregateByYear(
  records: readonly RecordTuple[],
  basis: readonly string[],
  nSpecies: number,
): { rows: YearRow[]; noYear: number } {
  let y0 = Infinity;
  let y1 = -Infinity;
  let noYear = 0;
  for (let i = 0; i < records.length; i++) {
    const y = records[i]![FIELD.YEAR];
    if (y === null) noYear++;
    else {
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!Number.isFinite(y0)) return { rows: [], noYear };
  const nY = y1 - y0 + 1;
  const obsId = basis.indexOf("HUMAN_OBSERVATION");
  const specId = basis.indexOf("PRESERVED_SPECIMEN");
  const obs = new Int32Array(nY);
  const spec = new Int32Array(nY);
  const other = new Int32Array(nY);
  const perYear = new Int32Array(nY);
  const seen = new Uint8Array(nY * nSpecies);
  const first = new Int32Array(nSpecies).fill(nY);
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    const y = r[FIELD.YEAR];
    if (y === null) continue;
    const k = y - y0;
    const b = r[FIELD.BASIS];
    if (b === obsId) obs[k]!++;
    else if (b === specId) spec[k]!++;
    else other[k]!++;
    const s = r[FIELD.SPECIES];
    if (s === 0) continue;
    const cell = k * nSpecies + s;
    if (seen[cell] === 0) {
      seen[cell] = 1;
      perYear[k]!++;
    }
    if (k < first[s]!) first[s] = k;
  }
  const newByYear = new Int32Array(nY);
  for (let s = 1; s < nSpecies; s++) if (first[s]! < nY) newByYear[first[s]!]!++;
  const rows: YearRow[] = [];
  let cumulative = 0;
  for (let k = 0; k < nY; k++) {
    cumulative += newByYear[k]!;
    rows.push({
      year: y0 + k,
      obs: obs[k]!,
      spec: spec[k]!,
      other: other[k]!,
      total: obs[k]! + spec[k]! + other[k]!,
      species: perYear[k]!,
      newSpecies: newByYear[k]!,
      cumulative,
    });
  }
  return { rows, noYear };
}
