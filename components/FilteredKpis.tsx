"use client";

import { useMemo } from "react";
import { Boxes, Bug, Calendar, Map, Search, Sigma } from "lucide-react";
import { useFilteredRecords } from "@/lib/filterContext";
import { shannonForRecords } from "@/lib/diversity";
import { FIELD } from "@/lib/types";

export function FilteredKpis({
  unfilteredTotal,
  totalCounties,
}: {
  unfilteredTotal: number;
  totalCounties: number;
}) {
  const filtered = useFilteredRecords();

  const stats = useMemo(() => {
    const speciesSet = new Set<number>();
    const familySet = new Set<number>();
    const countySet = new Set<number>();
    let yearMin = Infinity;
    let yearMax = -Infinity;
    let withYear = 0;
    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i]!;
      if (r[FIELD.SPECIES] !== 0) speciesSet.add(r[FIELD.SPECIES]);
      if (r[FIELD.FAMILY] !== 0) familySet.add(r[FIELD.FAMILY]);
      if (r[FIELD.COUNTY] !== 0) countySet.add(r[FIELD.COUNTY]);
      const y = r[FIELD.YEAR];
      if (y !== null) {
        withYear++;
        if (y < yearMin) yearMin = y;
        if (y > yearMax) yearMax = y;
      }
    }
    return {
      total: filtered.length,
      species: speciesSet.size,
      families: familySet.size,
      counties: countySet.size,
      yearLabel: withYear === 0 ? "—" : `${yearMin}–${yearMax}`,
      shannon: shannonForRecords(filtered),
    };
  }, [filtered]);

  const pct = unfilteredTotal > 0 ? (100 * stats.total) / unfilteredTotal : 0;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <Kpi
        icon={<Search className="h-4 w-4" />}
        label="Observations"
        value={stats.total.toLocaleString()}
        sublabel={`${pct.toFixed(1)}% of total`}
      />
      <Kpi
        icon={<Bug className="h-4 w-4" />}
        label="Species"
        value={stats.species.toLocaleString()}
      />
      <Kpi
        icon={<Boxes className="h-4 w-4" />}
        label="Families"
        value={stats.families.toLocaleString()}
      />
      <Kpi
        icon={<Map className="h-4 w-4" />}
        label="Counties"
        value={`${stats.counties} / ${totalCounties}`}
      />
      <Kpi
        icon={<Calendar className="h-4 w-4" />}
        label="Year range"
        value={stats.yearLabel}
      />
      <Kpi
        icon={<Sigma className="h-4 w-4" />}
        label="Shannon (H′)"
        value={stats.shannon === 0 ? "—" : stats.shannon.toFixed(3)}
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="nature-card nature-card-accent p-4">
      <div className="flex items-center gap-2 text-moss-600">
        <span aria-hidden>{icon}</span>
        <span className="text-[10px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      <div className="mt-2 font-serif text-2xl font-semibold tabular-nums text-forest-800">
        {value}
      </div>
      {sublabel ? (
        <div className="mt-0.5 text-[11px] text-moss-600 tabular-nums">{sublabel}</div>
      ) : null}
    </div>
  );
}
