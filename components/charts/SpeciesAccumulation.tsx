"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useLoadedData } from "@/lib/dataContext";
import { useFilteredRecords, useFilteredRecordsExceptCounty, useFilters } from "@/lib/filterContext";
import { nonZero, speciesAbundances } from "@/lib/diversity";
import { useInext } from "@/lib/useInext";
import type { InextGroupInput, InextGroupResult } from "@/lib/inext.worker";
import type { CurveWithCI, Q } from "@/lib/inext";
import { FIELD, type RecordTuple } from "@/lib/types";
import { ChartCard, EmptyState, SERIES_COLORS, Toggle } from "./ChartCard";
import { LinePlot, defaultFormat, type PlotSeries } from "./LinePlot";

type View = "size" | "coverage" | "completeness";
type Compare = "none" | "source" | "era" | "county";

const Q_LABEL: Record<Q, string> = {
  0: "Species richness",
  1: "Shannon diversity",
  2: "Simpson diversity",
};

const ERAS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: "Before 1970", min: -Infinity, max: 1969 },
  { label: "1970–1999", min: 1970, max: 1999 },
  { label: "2000–2014", min: 2000, max: 2014 },
  { label: "2015–present", min: 2015, max: Infinity },
];

export function SpeciesAccumulation() {
  const { dictionaries } = useLoadedData();
  const filtered = useFilteredRecords();
  const exceptCounty = useFilteredRecordsExceptCounty();
  const { filters } = useFilters();
  const [view, setView] = useState<View>("size");
  const [q, setQ] = useState<Q>(0);
  const [compareRaw, setCompare] = useState<Compare>("none");
  const compare: Compare =
    compareRaw === "county" && (filters.countyId === null || filters.countyId === 0) ? "none" : compareRaw;

  const nSpecies = dictionaries.species.length;
  const groups = useMemo<InextGroupInput[]>(
    () => buildGroups(compare, filtered, exceptCounty, nSpecies, dictionaries, filters.countyId),
    [compare, filtered, exceptCounty, nSpecies, dictionaries, filters.countyId],
  );
  const { groups: results, bandsPending } = useInext(groups);

  const usable = useMemo(() => (results ?? []).filter((g) => g.n >= 2), [results]);
  const series = useMemo(() => toSeries(usable, view, q), [usable, view, q]);

  const countyName =
    filters.countyId !== null && filters.countyId !== 0 ? dictionaries.county[filters.countyId] : null;

  return (
    <ChartCard
      title="Species accumulation (rarefaction & extrapolation)"
      subtitle={
        <>
          How many species would we expect with fewer — or more — records? Solid
          lines interpolate down from the actual sample (●); dashed lines
          extrapolate to twice its size. Shaded bands are 95% bootstrap intervals
          {bandsPending ? " (computing…)" : ""}.
        </>
      }
      controls={
        <>
          <Toggle
            label="Curve type"
            value={view}
            onChange={setView}
            options={[
              { value: "size", label: "By sample size" },
              { value: "coverage", label: "By coverage" },
              { value: "completeness", label: "Completeness" },
            ]}
          />
          {view !== "completeness" ? (
            <Toggle
              label="Diversity order q"
              value={q}
              onChange={setQ}
              options={[
                { value: 0, label: "q=0", title: "Species richness" },
                { value: 1, label: "q=1", title: "Shannon diversity (exp H′)" },
                { value: 2, label: "q=2", title: "Simpson diversity (1/Σp²)" },
              ]}
            />
          ) : null}
          <label className="inline-flex items-center gap-1.5 text-xs text-moss-700">
            Compare
            <select
              value={compare}
              onChange={(e) => setCompare(e.target.value as Compare)}
              className="rounded-md border border-forest-200 bg-cream-50 py-1.5 pl-2 pr-7 text-xs text-bark-700"
            >
              <option value="none">Nothing</option>
              <option value="source">Data source</option>
              <option value="era">Time period</option>
              {countyName ? <option value="county">{countyName} vs. rest of state</option> : null}
            </select>
          </label>
        </>
      }
      caveat={
        <>
          Records identified to species are treated as individuals
          (abundance data). GBIF records are not independent random draws —
          collectors revisit sites and target taxa — so read these as estimates
          of how complete the <em>database</em> is, not the fauna.
          {compare === "era" ? " Records without a year are excluded from the time-period comparison." : ""}
        </>
      }
      explainer={<Explainer />}
    >
      {results === null ? (
        <div className="h-[340px] animate-pulse rounded-md bg-cream-100" />
      ) : usable.length === 0 ? (
        <EmptyState>Too few identified records to draw a curve.</EmptyState>
      ) : (
        <>
          {usable.length > 1 ? <Legend groups={usable} /> : null}
          <LinePlot
            series={series}
            xLabel={
              view === "coverage" ? "Sample coverage" : "Number of records (sample size)"
            }
            yLabel={view === "completeness" ? "Sample coverage" : Q_LABEL[q]}
            xFormat={view === "coverage" ? pct : defaultFormat}
            yFormat={view === "completeness" ? pct : defaultFormat}
            yDomain={view === "completeness" ? [0, 1] : undefined}
            ariaLabel={ariaFor(usable, view, q)}
          />
          <SummaryTable groups={usable} />
          <Downloads groups={usable} bandsPending={bandsPending} />
        </>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------

function buildGroups(
  compare: Compare,
  filtered: readonly RecordTuple[],
  exceptCounty: readonly RecordTuple[],
  nSpecies: number,
  dictionaries: { basisOfRecord: readonly string[]; county: readonly string[] },
  countyId: number | null,
): InextGroupInput[] {
  if (compare === "none") {
    return [{ key: "all", label: "All filtered records", counts: speciesAbundances(filtered, nSpecies) }];
  }
  if (compare === "county" && countyId !== null) {
    const inCounty: RecordTuple[] = [];
    const rest: RecordTuple[] = [];
    for (const r of exceptCounty) (r[FIELD.COUNTY] === countyId ? inCounty : rest).push(r);
    return [
      { key: "county", label: `${dictionaries.county[countyId]} Co.`, counts: speciesAbundances(inCounty, nSpecies) },
      { key: "rest", label: "Rest of Indiana", counts: speciesAbundances(rest, nSpecies) },
    ];
  }
  if (compare === "era") {
    const buckets = ERAS.map(() => new Int32Array(nSpecies));
    for (const r of filtered) {
      const y = r[FIELD.YEAR];
      const sp = r[FIELD.SPECIES];
      if (y === null || sp === 0) continue;
      const k = ERAS.findIndex((e) => y >= e.min && y <= e.max);
      if (k >= 0) buckets[k]![sp] = buckets[k]![sp]! + 1;
    }
    return ERAS.map((e, k) => ({ key: `era${k}`, label: e.label, counts: buckets[k]! }));
  }
  // Data source: the two big basisOfRecord classes, everything else pooled.
  const label = (id: number): [string, string] => {
    const b = dictionaries.basisOfRecord[id];
    if (b === "HUMAN_OBSERVATION") return ["obs", "Human observations"];
    if (b === "PRESERVED_SPECIMEN") return ["spec", "Museum specimens"];
    return ["other", "Other sources"];
  };
  const order = ["obs", "spec", "other"];
  const buckets = new Map<string, { label: string; counts: Int32Array }>();
  for (const r of filtered) {
    const sp = r[FIELD.SPECIES];
    if (sp === 0) continue;
    const [key, lab] = label(r[FIELD.BASIS]);
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { label: lab, counts: new Int32Array(nSpecies) }));
    b.counts[sp] = b.counts[sp]! + 1;
  }
  return order.filter((k) => buckets.has(k)).map((k) => ({ key: k, ...buckets.get(k)! }));
}

function toSeries(groups: InextGroupResult[], view: View, q: Q): PlotSeries[] {
  return groups.map((g, k) => {
    const color = SERIES_COLORS[k % SERIES_COLORS.length]!;
    const x = (p: InextGroupResult["curve"][number]) => (view === "coverage" ? p.SC : p.m);
    const y = (p: InextGroupResult["curve"][number]) => (view === "completeness" ? p.SC : p.qD[q]);
    const rare = g.curve.filter((p) => p.m <= g.n);
    const extra = g.curve.filter((p) => p.m >= g.n);
    const obs = g.curve.find((p) => p.method === "Observed");
    const hasCi = (p: InextGroupResult["curve"][number]): p is CurveWithCI => "lo" in p;
    const band = g.curve.every(hasCi)
      ? (g.curve as CurveWithCI[]).map((p) => ({
          x: x(p),
          lo: view === "completeness" ? p.scLo : p.lo[q],
          hi: view === "completeness" ? p.scHi : p.hi[q],
        }))
      : undefined;
    return {
      key: g.key,
      label: g.label,
      color,
      segments: [
        { points: rare.map((p) => ({ x: x(p), y: y(p) })) },
        { points: extra.map((p) => ({ x: x(p), y: y(p) })), dashed: true },
      ],
      band,
      markers: obs ? [{ x: x(obs), y: y(obs) }] : [],
    };
  });
}

function Legend({ groups }: { groups: InextGroupResult[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-bark-700">
      {groups.map((g, k) => (
        <span key={g.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: SERIES_COLORS[k % SERIES_COLORS.length] }} />
          {g.label}
          <span className="text-moss-600 tabular-nums">n={g.n.toLocaleString()}</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-moss-600">
        <svg aria-hidden width="18" height="4"><line x1="0" x2="18" y1="2" y2="2" stroke="currentColor" strokeWidth="2" /></svg>
        rarefied
        <svg aria-hidden width="18" height="4"><line x1="0" x2="18" y1="2" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" /></svg>
        extrapolated
      </span>
    </div>
  );
}

function SummaryTable({ groups }: { groups: InextGroupResult[] }) {
  const fmt = (v: number) => (Number.isFinite(v) ? (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1)) : "∞");
  const se = (g: InextGroupResult, q: Q) => (g.asySe ? ` ± ${fmt(1.96 * g.asySe[q])}` : "");
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-xs tabular-nums">
        <caption className="mb-1 text-left text-[11px] text-moss-700">
          Hill numbers: observed → estimated asymptote (± 95% bootstrap interval)
        </caption>
        <thead>
          <tr className="border-b border-forest-200 text-left text-[11px] text-moss-700">
            <th className="px-2 py-1.5 font-medium">Group</th>
            <th className="px-2 py-1.5 text-right font-medium" title="Records identified to species">n</th>
            <th className="px-2 py-1.5 text-right font-medium" title="Singletons / doubletons">f₁ / f₂</th>
            <th className="px-2 py-1.5 text-right font-medium" title="Sample coverage">Coverage</th>
            <th className="px-2 py-1.5 text-right font-medium">Richness (q=0)</th>
            <th className="px-2 py-1.5 text-right font-medium">Shannon (q=1)</th>
            <th className="px-2 py-1.5 text-right font-medium">Simpson (q=2)</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, k) => (
            <tr key={g.key} className="border-b border-forest-100/60 last:border-0">
              <td className="px-2 py-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[k % SERIES_COLORS.length] }} />
                  {g.label}
                </span>
              </td>
              <td className="px-2 py-1.5 text-right">{g.n.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right">{g.f1.toLocaleString()} / {g.f2.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right">{pct(g.coverage)}</td>
              {([0, 1, 2] as const).map((q) => (
                <td key={q} className="px-2 py-1.5 text-right">
                  {fmt(g.observed[q])} → <span className="font-semibold text-forest-800">{fmt(g.asymptotic[q])}</span>
                  <span className="text-moss-600">{se(g, q)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Downloads({ groups, bandsPending }: { groups: InextGroupResult[]; bandsPending: boolean }) {
  const curveCsv = () => {
    const rows = ["group,m,method,qD_q0,qD_q1,qD_q2,SC,q0_lo,q0_hi,q1_lo,q1_hi,q2_lo,q2_hi,SC_lo,SC_hi"];
    for (const g of groups) {
      for (const p of g.curve) {
        const ci = "lo" in p ? [p.lo[0], p.hi[0], p.lo[1], p.hi[1], p.lo[2], p.hi[2], p.scLo, p.scHi] : Array(8).fill("");
        rows.push([csvQuote(g.label), p.m, p.method, ...p.qD.map(r6), r6(p.SC), ...ci.map((v) => (v === "" ? "" : r6(v as number)))].join(","));
      }
    }
    return rows.join("\n");
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
      <DownloadButton filename="inext-curves.csv" build={curveCsv} disabled={bandsPending}>
        Curve data (CSV)
      </DownloadButton>
      <GroupsVectorDownload groups={groups} />
    </div>
  );
}

/** Abundance vectors + an R script that reproduces this chart with iNEXT. */
function GroupsVectorDownload({ groups }: { groups: InextGroupResult[] }) {
  const { dictionaries } = useLoadedData();
  const filtered = useFilteredRecords();
  const build = () => {
    const v = nonZero(speciesAbundances(filtered, dictionaries.species.length));
    return [
      "# Abundance vector (records per species) for the current dashboard filters.",
      "# Reproduce the rarefaction/extrapolation curve in R:",
      "#   install.packages('iNEXT'); library(iNEXT)",
      "#   x <- scan('abundance.txt', comment.char = '#')",
      "#   out <- iNEXT(x, q = c(0, 1, 2), datatype = 'abundance')",
      "#   ggiNEXT(out, type = 1, facet.var = 'Order.q')",
      `# Groups shown on the dashboard: ${groups.map((g) => g.label).join("; ")}`,
      ...v.map(String),
    ].join("\n");
  };
  return (
    <DownloadButton filename="abundance.txt" build={build}>
      Abundance vector for R/iNEXT
    </DownloadButton>
  );
}

export function DownloadButton({
  filename,
  build,
  disabled,
  children,
}: {
  filename: string;
  build: () => string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        const blob = new Blob([build()], { type: filename.endsWith(".csv") ? "text/csv" : "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-forest-200 bg-cream-50 px-2.5 py-1 text-forest-700 hover:bg-cream-100 disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      {children}
    </button>
  );
}

function Explainer() {
  return (
    <>
      <p>
        <strong>Why not just count species?</strong> Observed richness depends on
        effort: more records always turn up more species. Rarefaction asks how
        many species a smaller sample would contain, so groups with different
        effort can be compared at the same sample size. Extrapolation (dashed)
        predicts what more sampling would add, using the number of species seen
        once (<i>f</i>₁, singletons) and twice (<i>f</i>₂, doubletons).
      </p>
      <p>
        <strong>Hill numbers</strong> put richness and evenness on one scale, in
        units of “effective number of species”. <i>q</i>=0 counts every species
        equally (richness). <i>q</i>=1 (exp Shannon) weights species by
        abundance, so it reads as the number of “common” species. <i>q</i>=2
        (inverse Simpson) counts the “dominant” species. A steep, still-rising
        <i> q</i>=0 curve next to flat <i>q</i>=1/2 curves means many rare
        species remain undiscovered while the common ones are well known.
      </p>
      <p>
        <strong>Coverage</strong> is the estimated share of all records that
        belong to species already detected. Comparing groups at equal coverage
        rather than equal sample size compares them at equal completeness
        (Chao &amp; Jost 2012). The <em>Completeness</em> view shows how fast
        coverage approaches 100%.
      </p>
      <p>
        <strong>Try this:</strong> compare <em>Data source</em>. Do museum
        specimens and community observations saturate at different richness?
        What does that tell you about which insects each method finds? Then
        filter to one order (say Lepidoptera vs. Diptera) and compare how
        complete each group’s inventory is.
      </p>
      <p className="text-moss-600">
        Methods follow the R package iNEXT (Hsieh, Ma &amp; Chao 2016); this port
        reproduces its estimates to 6 significant figures. Bands come from 50
        bootstrap replicates (iNEXT’s default is 50).
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------

function pct(v: number): string {
  return `${(100 * v).toFixed(v > 0.99 ? 2 : 1)}%`;
}

function r6(v: number): string {
  return Number.isFinite(v) ? String(Number(v.toPrecision(8))) : "";
}

function csvQuote(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function ariaFor(groups: InextGroupResult[], view: View, q: Q): string {
  const what = view === "completeness" ? "sample coverage" : Q_LABEL[q].toLowerCase();
  const parts = groups.map(
    (g) => `${g.label}: ${g.n.toLocaleString()} records, ${Math.round(g.observed[q]).toLocaleString()} observed, ${Math.round(g.asymptotic[q]).toLocaleString()} estimated`,
  );
  return `Rarefaction and extrapolation curves of ${what}. ${parts.join("; ")}.`;
}
