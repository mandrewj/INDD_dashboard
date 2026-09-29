"use client";

import { useMemo, useState } from "react";
import { useLoadedData } from "@/lib/dataContext";
import { useFilteredRecords } from "@/lib/filterContext";
import { speciesAbundances } from "@/lib/diversity";
import { ChartCard, EmptyState, Toggle } from "./ChartCard";
import { LinePlot } from "./LinePlot";

type XScale = "linear" | "log";

/**
 * Whittaker rank–abundance plot: species sorted from most to least recorded,
 * log-scaled record counts. The long flat tail at 1–2 records is exactly what
 * drives the Chao1 estimate shown in the KPIs.
 */
export function RankAbundance() {
  const { dictionaries } = useLoadedData();
  const filtered = useFilteredRecords();
  const [xScale, setXScale] = useState<XScale>("linear");

  const { ranked, f1, f2 } = useMemo(() => {
    const counts = speciesAbundances(filtered, dictionaries.species.length);
    const ranked: Array<{ id: number; n: number }> = [];
    let f1 = 0;
    let f2 = 0;
    for (let id = 1; id < counts.length; id++) {
      const n = counts[id]!;
      if (n === 0) continue;
      ranked.push({ id, n });
      if (n === 1) f1++;
      if (n === 2) f2++;
    }
    ranked.sort((a, b) => b.n - a.n);
    return { ranked, f1, f2 };
  }, [filtered, dictionaries.species.length]);

  const S = ranked.length;
  const series = useMemo(
    () => [
      {
        key: "ra",
        label: "Records",
        color: "#0072B2",
        segments: [{ points: ranked.map((r, i) => ({ x: i + 1, y: r.n })) }],
      },
    ],
    [ranked],
  );

  const top = ranked[0];
  const topShare = top && filtered.length ? top.n / ranked.reduce((s, r) => s + r.n, 0) : 0;

  return (
    <ChartCard
      title="Rank–abundance"
      subtitle={
        S > 0 ? (
          <>
            {S.toLocaleString()} species ranked by record count.{" "}
            <span className="font-medium text-bark-700">{f1.toLocaleString()}</span> singletons
            ({((100 * f1) / S).toFixed(0)}%) and{" "}
            <span className="font-medium text-bark-700">{f2.toLocaleString()}</span> doubletons.
          </>
        ) : undefined
      }
      controls={
        <Toggle
          label="Rank axis"
          value={xScale}
          onChange={setXScale}
          options={[
            { value: "linear", label: "Linear rank" },
            { value: "log", label: "Log rank" },
          ]}
        />
      }
      explainer={
        <>
          <p>
            Each position on the x-axis is one species, from most recorded (rank
            1) to least. A steep curve means a few species dominate the records;
            a shallow one means records are spread evenly. The long flat tail is
            the rare species, recorded only once or twice.
          </p>
          <p>
            <strong>Why it matters:</strong> singletons (<i>f</i>₁) and
            doubletons (<i>f</i>₂) are the raw ingredients of the Chao1 richness
            estimate, <i>S</i><sub>obs</sub> + <i>f</i>₁²/(2<i>f</i>₂). Many
            singletons relative to doubletons signal that many species remain
            unrecorded.
          </p>
          <p>
            <strong>Try this:</strong> the top species here is{" "}
            {top ? <i>{dictionaries.species[top.id]}</i> : "—"} (
            {(100 * topShare).toFixed(1)}% of identified records). Is it truly
            the most abundant insect, or the easiest to photograph? Switch to
            one family and compare the shape.
          </p>
        </>
      }
    >
      {S < 2 ? (
        <EmptyState>Need at least two species to rank.</EmptyState>
      ) : (
        <LinePlot
          series={series}
          height={300}
          xLabel="Species rank"
          yLabel="Records (log scale)"
          xScale={xScale}
          yScale="log"
          xFormat={(v) => Math.round(v).toLocaleString()}
          yFormat={(v) => Math.round(v).toLocaleString()}
          yDomain={[1, Math.max(10, top?.n ?? 10)]}
          refLines={[{ axis: "y", value: 2, label: "doubletons" }]}
          ariaLabel={`Rank-abundance curve for ${S} species; most-recorded species has ${top?.n ?? 0} records; ${f1} singletons and ${f2} doubletons.`}
          tooltipExtra={(x) => {
            const r = ranked[Math.round(x) - 1];
            return r ? (
              <div className="mt-1 border-t border-moss-200 pt-1 text-[11px]">
                <i>{dictionaries.species[r.id]}</i>
                <div className="tabular-nums text-moss-600">rank {Math.round(x).toLocaleString()} · {r.n.toLocaleString()} records</div>
              </div>
            ) : null;
          }}
        />
      )}
    </ChartCard>
  );
}
