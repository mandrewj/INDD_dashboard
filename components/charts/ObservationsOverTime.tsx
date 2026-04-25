"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFilteredRecords } from "@/lib/filterContext";
import { FIELD } from "@/lib/types";
import { ChartCard } from "./ChartCard";

type Granularity = "year" | "month";

interface Point {
  /** Numeric x for axis ordering: year (e.g. 2014) or YYYYMM*0.01 = 201406 → 2014.5 */
  x: number;
  /** Display label */
  label: string;
  count: number;
}

export function ObservationsOverTime() {
  const filtered = useFilteredRecords();
  const [granularity, setGranularity] = useState<Granularity>("year");

  const { points, noYear, noMonth } = useMemo(() => {
    let nY = 0;
    let nM = 0;
    if (granularity === "year") {
      const counts = new Map<number, number>();
      for (let i = 0; i < filtered.length; i++) {
        const r = filtered[i]!;
        const y = r[FIELD.YEAR];
        if (y === null) {
          nY++;
          continue;
        }
        counts.set(y, (counts.get(y) ?? 0) + 1);
      }
      const arr: Point[] = [];
      for (const [y, c] of counts) {
        arr.push({ x: y, label: String(y), count: c });
      }
      arr.sort((a, b) => a.x - b.x);
      return { points: arr, noYear: nY, noMonth: 0 };
    }

    // Month granularity → bucket by year-month
    const counts = new Map<number, number>(); // key = year*100 + month
    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i]!;
      const y = r[FIELD.YEAR];
      const m = r[FIELD.MONTH];
      if (y === null) {
        nY++;
        continue;
      }
      if (m === null) {
        nM++;
        continue;
      }
      const key = y * 100 + m;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const arr: Point[] = [];
    for (const [key, c] of counts) {
      const y = Math.floor(key / 100);
      const m = key % 100;
      arr.push({
        x: y + (m - 1) / 12,
        label: `${y}-${String(m).padStart(2, "0")}`,
        count: c,
      });
    }
    arr.sort((a, b) => a.x - b.x);
    return { points: arr, noYear: nY, noMonth: nM };
  }, [filtered, granularity]);

  const total = points.reduce((s, p) => s + p.count, 0);

  return (
    <ChartCard
      title="Observations over time"
      subtitle={
        <>
          {total.toLocaleString()} records placed on the timeline
          {points.length > 0 ? (
            <>
              {" "}
              · spanning <span className="tabular-nums">{points[0]!.label}</span>
              {" – "}
              <span className="tabular-nums">{points[points.length - 1]!.label}</span>
            </>
          ) : null}
        </>
      }
      controls={
        <GranularityToggle value={granularity} onChange={setGranularity} />
      }
      caveat={
        <>
          {noYear > 0
            ? `${noYear.toLocaleString()} record${noYear === 1 ? "" : "s"} without a year omitted from this chart.`
            : null}
          {noMonth > 0 ? (
            <>
              {noYear > 0 ? " " : ""}
              {noMonth.toLocaleString()} record{noMonth === 1 ? "" : "s"} with a year
              but no month omitted from the monthly view.
            </>
          ) : null}
          {noYear === 0 && noMonth === 0 ? "All filtered records included." : null}
        </>
      }
    >
      <div
        className="h-[320px] w-full"
        role="img"
        aria-label={`Line chart of insect observation counts by ${granularity === "year" ? "calendar year" : "year and month"}, showing ${points.length} ${granularity === "year" ? "years" : "months"} with data, totalling ${total.toLocaleString()} records.`}
      >
        {points.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="forest-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#116dff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#116dff" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 4" vertical={false} />
              <XAxis
                dataKey="x"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v: number) =>
                  granularity === "year"
                    ? String(Math.round(v))
                    : (() => {
                        const y = Math.floor(v);
                        const m = Math.round((v - y) * 12) + 1;
                        return `${y}-${String(m).padStart(2, "0")}`;
                      })()
                }
                tick={{ fill: "#5f6360", fontSize: 11 }}
                stroke="#D9DDDF"
                minTickGap={28}
              />
              <YAxis
                tick={{ fill: "#5f6360", fontSize: 11 }}
                stroke="#D9DDDF"
                tickFormatter={(v: number) => v.toLocaleString()}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "#FFFFFF",
                  border: "1px solid #D9DDDF",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#080808",
                }}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as Point | undefined;
                  return p?.label ?? "";
                }}
                formatter={(v: number) => [v.toLocaleString(), "Observations"]}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="none"
                fill="url(#forest-gradient)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#116dff"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#116dff", stroke: "#FFFFFF", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity;
  onChange: (v: Granularity) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Time granularity"
      className="inline-flex overflow-hidden rounded-md border border-forest-200 bg-cream-50 text-xs"
    >
      {(["year", "month"] as const).map((g) => {
        const active = g === value;
        return (
          <button
            key={g}
            type="button"
            onClick={() => onChange(g)}
            aria-pressed={active}
            className={
              active
                ? "bg-forest-600 px-3 py-1.5 font-medium text-cream-50"
                : "bg-transparent px-3 py-1.5 text-forest-700 hover:bg-cream-200"
            }
          >
            {g === "year" ? "Year" : "Month"}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-forest-200 bg-cream-50 text-sm text-moss-700">
      No records match the current filters at this granularity.
    </div>
  );
}
