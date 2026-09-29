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
import { FIELD } from "@/lib/types";
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
type SourceKey = (typeof SOURCES)[number]["key"];

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

  const { rows, noYear } = useMemo(() => {
    const sourceOf = (basisId: number): SourceKey => {
      const b = dictionaries.basisOfRecord[basisId];
      return b === "HUMAN_OBSERVATION" ? "obs" : b === "PRESERVED_SPECIMEN" ? "spec" : "other";
    };
    const byYear = new Map<number, { obs: number; spec: number; other: number; sp: Set<number> }>();
    let noYear = 0;
    for (const r of filtered) {
      const y = r[FIELD.YEAR];
      if (y === null) {
        noYear++;
        continue;
      }
      let b = byYear.get(y);
      if (!b) byYear.set(y, (b = { obs: 0, spec: 0, other: 0, sp: new Set() }));
      b[sourceOf(r[FIELD.BASIS])]++;
      if (r[FIELD.SPECIES] !== 0) b.sp.add(r[FIELD.SPECIES]);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const rows: YearRow[] = [];
    if (years.length === 0) return { rows, noYear };
    // Fill gaps so bars/lines sit on a true calendar axis.
    const seen = new Set<number>();
    for (let y = years[0]!; y <= years[years.length - 1]!; y++) {
      const b = byYear.get(y);
      let newSpecies = 0;
      if (b) for (const sp of b.sp) if (!seen.has(sp)) { seen.add(sp); newSpecies++; }
      rows.push({
        year: y,
        obs: b?.obs ?? 0,
        spec: b?.spec ?? 0,
        other: b?.other ?? 0,
        total: b ? b.obs + b.spec + b.other : 0,
        species: b?.sp.size ?? 0,
        newSpecies,
        cumulative: seen.size,
      });
    }
    return { rows, noYear };
  }, [filtered, dictionaries.basisOfRecord]);

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
