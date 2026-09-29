"use client";

import { useMemo } from "react";
import { useLoadedData } from "@/lib/dataContext";
import { useFilteredRecords } from "@/lib/filterContext";
import { speciesAbundances } from "@/lib/diversity";
import { chao1, freqTable, sampleCoverage } from "@/lib/inext";
import { FIELD } from "@/lib/types";

export function FilteredKpis({
  unfilteredTotal,
  totalCounties,
}: {
  unfilteredTotal: number;
  totalCounties: number;
}) {
  const { dictionaries } = useLoadedData();
  const filtered = useFilteredRecords();

  const stats = useMemo(() => {
    const famSeen = new Uint8Array(dictionaries.family.length);
    const countySeen = new Uint8Array(dictionaries.county.length);
    let families = 0;
    let counties = 0;
    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i]!;
      const f = r[FIELD.FAMILY];
      const c = r[FIELD.COUNTY];
      if (f !== 0 && famSeen[f] === 0) { famSeen[f] = 1; families++; }
      if (c !== 0 && countySeen[c] === 0) { countySeen[c] = 1; counties++; }
    }
    const t = freqTable(speciesAbundances(filtered, dictionaries.species.length));
    return {
      total: filtered.length,
      identified: t.n,
      species: t.S,
      chao: chao1(t),
      coverage: sampleCoverage(t),
      families,
      counties,
    };
  }, [filtered, dictionaries.species.length, dictionaries.family.length, dictionaries.county.length]);

  const pct = unfilteredTotal > 0 ? (100 * stats.total) / unfilteredTotal : 0;
  const idPct = stats.total > 0 ? (100 * stats.identified) / stats.total : 0;
  const hasSp = stats.species > 0;

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Kpi
        label="Records"
        value={stats.total.toLocaleString()}
        sublabel={`${pct.toFixed(1)}% of all · ${idPct.toFixed(0)}% ID’d to species`}
      />
      <Kpi label="Species observed" value={stats.species.toLocaleString()} />
      <Kpi
        label="Estimated species"
        title="Chao1 lower-bound estimate of total richness, with 95% CI"
        value={hasSp ? Math.round(stats.chao.estimate).toLocaleString() : "—"}
        sublabel={
          hasSp
            ? `95% CI ${Math.round(stats.chao.lower).toLocaleString()}–${Math.round(stats.chao.upper).toLocaleString()} (Chao1)`
            : undefined
        }
      />
      <Kpi
        label="Sample completeness"
        title="Sample coverage Ĉ: estimated share of all records that belong to species already detected"
        value={hasSp ? `${(100 * stats.coverage).toFixed(1)}%` : "—"}
        sublabel={
          hasSp
            ? `${Math.max(0, Math.round(stats.chao.estimate - stats.species)).toLocaleString()} species likely unseen`
            : undefined
        }
      />
      <Kpi label="Families" value={stats.families.toLocaleString()} />
      <Kpi label="Counties" value={`${stats.counties} / ${totalCounties}`} />
    </dl>
  );
}

function Kpi({
  label,
  value,
  sublabel,
  title,
}: {
  label: string;
  value: string;
  sublabel?: string;
  title?: string;
}) {
  return (
    <div className="nature-card px-3 py-2" title={title}>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-moss-600">{label}</dt>
      <dd className="mt-0.5 font-serif text-xl font-semibold tabular-nums text-forest-800">
        {value}
      </dd>
      {sublabel ? (
        <dd className="mt-0.5 text-[11px] leading-snug text-moss-600 tabular-nums">{sublabel}</dd>
      ) : null}
    </div>
  );
}
