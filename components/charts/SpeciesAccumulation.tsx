"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useLoadedData } from "@/lib/dataContext";
import { useFilteredRecords, useFilteredRecordsExceptCounty, useFilters } from "@/lib/filterContext";
import { speciesAbundances } from "@/lib/diversity";
import { useInext } from "@/lib/useInext";
import type { InextGroupInput, InextGroupResult } from "@/lib/inext.worker";
import { PROFILE_QS, type CurveWithCI, type DataType, type Q } from "@/lib/inext";
import { FIELD, type RecordTuple } from "@/lib/types";
import { ChartCard, EmptyState, SERIES_COLORS, Toggle } from "./ChartCard";
import { RichnessFlag, richnessFlagTitle } from "../RichnessFlag";
import { LinePlot, defaultFormat, type PlotSeries } from "./LinePlot";

type View = "size" | "coverage" | "completeness" | "profile";
type Compare = "none" | "source" | "era" | "county";
type Unit = "county-year" | "cell-year";

const Q_LABEL: Record<Q, string> = {
  0: "Species richness",
  1: "Shannon diversity",
  2: "Simpson diversity",
};

const UNIT_LABEL: Record<Unit, { short: string; plural: string }> = {
  "county-year": { short: "County × year", plural: "county-years" },
  "cell-year": { short: "10-km cell × year", plural: "cell-years" },
};

const ERAS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: "Before 1970", min: -Infinity, max: 1969 },
  { label: "1970–1999", min: 1970, max: 1999 },
  { label: "2000–2014", min: 2000, max: 2014 },
  { label: "2015–present", min: 2015, max: Infinity },
];

/** Same ~11 km grid as the map's survey-gap view. */
const CELL_LAT = 0.1;
const CELL_LON = 0.125;

export function SpeciesAccumulation() {
  const { dictionaries } = useLoadedData();
  const filtered = useFilteredRecords();
  const exceptCounty = useFilteredRecordsExceptCounty();
  const { filters } = useFilters();
  const [view, setView] = useState<View>("size");
  const [q, setQ] = useState<Q>(0);
  const [dataType, setDataType] = useState<DataType>("abundance");
  const [unit, setUnit] = useState<Unit>("county-year");
  const [compareRaw, setCompare] = useState<Compare>("none");
  const compare: Compare =
    compareRaw === "county" && (filters.countyId === null || filters.countyId === 0) ? "none" : compareRaw;

  const nSpecies = dictionaries.species.length;
  const split = useMemo(
    () => splitGroups(compare, filtered, exceptCounty, dictionaries, filters.countyId),
    [compare, filtered, exceptCounty, dictionaries, filters.countyId],
  );
  const groups = useMemo<InextGroupInput[]>(
    () => split.map((g) => toInput(g, dataType, unit, nSpecies)),
    [split, dataType, unit, nSpecies],
  );
  const { groups: results, bandsPending } = useInext(groups);

  const usable = useMemo(() => (results ?? []).filter((g) => g.n >= 2 && g.S > 0), [results]);
  const series = useMemo(() => toSeries(usable, view, q), [usable, view, q]);

  const countyName =
    filters.countyId !== null && filters.countyId !== 0 ? dictionaries.county[filters.countyId] : null;
  const incidence = dataType === "incidence";
  const sizeLabel = incidence ? `Sampling units (${UNIT_LABEL[unit].plural})` : "Number of records (sample size)";

  return (
    <ChartCard
      title="Species accumulation (rarefaction & extrapolation)"
      subtitle={
        view === "profile" ? (
          <>
            Diversity profile: effective number of species as the order <i>q</i> rises
            from 0 (all species count equally) to 3 (only dominant species count). Line:
            observed; ○: estimated true value (± 95% CI).
          </>
        ) : (
          <>
            Expected species with fewer or more{" "}
            {incidence ? UNIT_LABEL[unit].plural : "records"}. Solid: interpolated from the
            sample (●); dashed: extrapolated to twice its size; bands: 95% bootstrap CI
            {bandsPending ? " (computing…)" : ""}.
          </>
        )
      }
      controls={
        <>
          <Toggle
            label="Curve type"
            value={view}
            onChange={setView}
            options={[
              { value: "size", label: "Size" },
              { value: "coverage", label: "Coverage" },
              { value: "completeness", label: "Completeness" },
              { value: "profile", label: "Profile" },
            ]}
          />
          {view === "size" || view === "coverage" ? (
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
        </>
      }
      caveat={
        incidence ? (
          <>
            Incidence data: a species counts once per {UNIT_LABEL[unit].plural.replace(/s$/, "")} it was
            recorded in, however many records it has — less sensitive to one collector
            photographing the same insect 200 times. Records lacking a{" "}
            {unit === "county-year" ? "county or year" : "coordinate or year"} are excluded.
          </>
        ) : (
          <>
            Records identified to species are treated as individuals (abundance data).
            GBIF records are not independent random draws, so read these as estimates of
            how complete the <em>database</em> is, not the fauna. Try “Sampling units”
            for a more robust view.
          </>
        )
      }
      explainer={<Explainer />}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-moss-700" data-export-exclude>
        <Toggle
          label="Data type"
          value={dataType}
          onChange={setDataType}
          options={[
            { value: "abundance", label: "Records", title: "Abundance: each record is one individual" },
            { value: "incidence", label: "Sampling units", title: "Incidence: presence per sampling unit" },
          ]}
        />
        {incidence ? (
          <select
            aria-label="Sampling unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as Unit)}
            className="rounded-md border border-forest-200 bg-cream-50 py-1 pl-2 pr-7 text-xs text-bark-700"
          >
            <option value="county-year">{UNIT_LABEL["county-year"].short}</option>
            <option value="cell-year">{UNIT_LABEL["cell-year"].short}</option>
          </select>
        ) : null}
        <label className="ml-auto inline-flex items-center gap-1.5">
          Compare
          <select
            value={compare}
            onChange={(e) => setCompare(e.target.value as Compare)}
            className="rounded-md border border-forest-200 bg-cream-50 py-1 pl-2 pr-7 text-xs text-bark-700"
          >
            <option value="none">Nothing</option>
            <option value="source">Data source</option>
            <option value="era">Time period</option>
            {countyName ? <option value="county">{countyName} vs. rest of state</option> : null}
          </select>
        </label>
      </div>

      {results === null ? (
        <div className="h-[300px] animate-pulse rounded-md bg-cream-100" />
      ) : usable.length === 0 ? (
        <EmptyState>Too few identified records to draw a curve.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {usable.length > 1 || view === "profile" ? <Legend groups={usable} view={view} /> : null}
            <LinePlot
              series={series}
              height={300}
              xLabel={
                view === "coverage" ? "Sample coverage" : view === "profile" ? "Order q" : sizeLabel
              }
              yLabel={
                view === "completeness"
                  ? "Sample coverage"
                  : view === "profile"
                    ? "Effective number of species"
                    : Q_LABEL[q]
              }
              xFormat={view === "coverage" ? pct : view === "profile" ? (v) => v.toFixed(1).replace(/\.0$/, "") : defaultFormat}
              yFormat={view === "completeness" ? pct : defaultFormat}
              yScale={view === "profile" ? "log" : "linear"}
              xDomain={view === "profile" ? [0, 3] : undefined}
              yDomain={view === "completeness" ? [0, 1] : undefined}
              ariaLabel={ariaFor(usable, view, q)}
            />
          </div>
          <div className="min-w-0">
            <SummaryTable groups={usable} />
            <Downloads groups={usable} inputs={groups} bandsPending={bandsPending} />
          </div>
        </div>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------

interface SplitGroup {
  key: string;
  label: string;
  records: readonly RecordTuple[];
}

function splitGroups(
  compare: Compare,
  filtered: readonly RecordTuple[],
  exceptCounty: readonly RecordTuple[],
  dictionaries: { basisOfRecord: readonly string[]; county: readonly string[] },
  countyId: number | null,
): SplitGroup[] {
  // Pass the shared array through (no copy) so cached aggregates are reused.
  if (compare === "none") return [{ key: "all", label: "All filtered records", records: filtered }];
  if (compare === "county" && countyId !== null) {
    const inCounty: RecordTuple[] = [];
    const rest: RecordTuple[] = [];
    for (const r of exceptCounty) (r[FIELD.COUNTY] === countyId ? inCounty : rest).push(r);
    return [
      { key: "county", label: `${dictionaries.county[countyId]} Co.`, records: inCounty },
      { key: "rest", label: "Rest of Indiana", records: rest },
    ];
  }
  if (compare === "era") {
    const buckets: RecordTuple[][] = ERAS.map(() => []);
    for (const r of filtered) {
      const y = r[FIELD.YEAR];
      if (y === null) continue;
      const k = ERAS.findIndex((e) => y >= e.min && y <= e.max);
      if (k >= 0) buckets[k]!.push(r);
    }
    return ERAS.map((e, k) => ({ key: `era${k}`, label: e.label, records: buckets[k]! }));
  }
  // Data source: the two big basisOfRecord classes, everything else pooled.
  const source = (id: number): 0 | 1 | 2 => {
    const b = dictionaries.basisOfRecord[id];
    return b === "HUMAN_OBSERVATION" ? 0 : b === "PRESERVED_SPECIMEN" ? 1 : 2;
  };
  const buckets: RecordTuple[][] = [[], [], []];
  for (const r of filtered) buckets[source(r[FIELD.BASIS])]!.push(r);
  return [
    { key: "obs", label: "Human observations", records: buckets[0]! },
    { key: "spec", label: "Museum specimens", records: buckets[1]! },
    { key: "other", label: "Other sources", records: buckets[2]! },
  ].filter((g) => g.records.length > 0);
}

function unitKey(r: RecordTuple, unit: Unit): string | null {
  const y = r[FIELD.YEAR];
  if (y === null) return null;
  if (unit === "county-year") {
    const c = r[FIELD.COUNTY];
    return c === 0 ? null : `${c}:${y}`;
  }
  const lat = r[FIELD.LAT];
  const lon = r[FIELD.LON];
  if (lat === null || lon === null || r[FIELD.COUNTY] === 0) return null;
  return `${Math.floor(lat / CELL_LAT)}:${Math.floor(lon / CELL_LON)}:${y}`;
}

function toInput(g: SplitGroup, type: DataType, unit: Unit, nSpecies: number): InextGroupInput {
  if (type === "abundance") {
    return { key: g.key, label: g.label, type, counts: speciesAbundances(g.records, nSpecies) };
  }
  // Incidence: detections[s] = number of units where species s was recorded.
  const seen = new Map<string, Set<number>>();
  for (const r of g.records) {
    const sp = r[FIELD.SPECIES];
    if (sp === 0) continue;
    const k = unitKey(r, unit);
    if (k === null) continue;
    let set = seen.get(k);
    if (!set) seen.set(k, (set = new Set()));
    set.add(sp);
  }
  const counts = new Int32Array(nSpecies);
  for (const set of seen.values()) for (const sp of set) counts[sp] = counts[sp]! + 1;
  return { key: g.key, label: g.label, type, counts, T: seen.size };
}

type Pt = InextGroupResult["curve"][number];

function toSeries(groups: InextGroupResult[], view: View, q: Q): PlotSeries[] {
  return groups.map((g, k) => {
    const color = SERIES_COLORS[k % SERIES_COLORS.length]!;
    if (view === "profile") {
      const est = g.profileEstimated;
      return {
        key: g.key,
        label: g.label,
        color,
        segments: [{ points: PROFILE_QS.map((qq, i) => ({ x: qq, y: g.profileObserved[i]! })) }],
        markers: est.map((y, qq) => ({ x: qq, y })).filter((p) => Number.isFinite(p.y)),
        hollowMarkers: true,
        errorBars: g.asySe
          ? ([0, 1, 2] as const).map((qq) => ({
              x: qq,
              lo: est[qq] - 1.96 * g.asySe![qq],
              hi: est[qq] + 1.96 * g.asySe![qq],
            }))
          : undefined,
      };
    }
    const x = (p: Pt) => (view === "coverage" ? p.SC : p.m);
    const y = (p: Pt) => (view === "completeness" ? p.SC : p.qD[q]);
    const rare = g.curve.filter((p) => p.m <= g.n);
    const extra = g.curve.filter((p) => p.m >= g.n);
    const obs = g.curve.find((p) => p.method === "Observed");
    const hasCi = (p: Pt): p is CurveWithCI => "lo" in p;
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

function Legend({ groups, view }: { groups: InextGroupResult[]; view: View }) {
  const unitWord = groups[0]?.type === "incidence" ? "units" : "n";
  return (
    <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-bark-700">
      {groups.map((g, k) => (
        <span key={g.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: SERIES_COLORS[k % SERIES_COLORS.length] }} />
          {g.label}
          <span className="text-moss-600 tabular-nums">
            {unitWord}={g.n.toLocaleString()}
          </span>
        </span>
      ))}
      {view === "profile" ? (
        <span className="text-moss-600">— observed · ○ estimated (± 95% CI)</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-moss-600">
          <svg aria-hidden width="18" height="4"><line x1="0" x2="18" y1="2" y2="2" stroke="currentColor" strokeWidth="2" /></svg>
          rarefied
          <svg aria-hidden width="18" height="4"><line x1="0" x2="18" y1="2" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" /></svg>
          extrapolated
        </span>
      )}
    </div>
  );
}

function SummaryTable({ groups }: { groups: InextGroupResult[] }) {
  const inc = groups[0]?.type === "incidence";
  const fmt = (v: number) => (Number.isFinite(v) ? (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1)) : "∞");
  const se = (g: InextGroupResult, q: Q) => (g.asySe ? ` ±${fmt(1.96 * g.asySe[q])}` : "");
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[11px] tabular-nums">
        <caption className="mb-1 text-left text-[11px] text-moss-700">
          Observed → <strong>estimated</strong> Hill numbers (± 95% CI)
        </caption>
        <thead>
          <tr className="border-b border-forest-200 text-left text-moss-700">
            <th className="px-1.5 py-1 font-medium">Group</th>
            <th className="px-1.5 py-1 text-right font-medium" title={inc ? "Sampling units (T)" : "Records identified to species"}>
              {inc ? "T" : "n"}
            </th>
            <th className="px-1.5 py-1 text-right font-medium" title={inc ? "Species in 1 / 2 units" : "Singletons / doubletons"}>
              {inc ? "Q₁/Q₂" : "f₁/f₂"}
            </th>
            <th className="px-1.5 py-1 text-right font-medium" title="Sample coverage">Cov.</th>
            <th className="px-1.5 py-1 text-right font-medium">q=0</th>
            <th className="px-1.5 py-1 text-right font-medium">q=1</th>
            <th className="px-1.5 py-1 text-right font-medium">q=2</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, k) => (
            <tr key={g.key} className="border-b border-forest-100/60 align-top last:border-0">
              <td className="px-1.5 py-1">
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: SERIES_COLORS[k % SERIES_COLORS.length] }} />
                  {g.label}
                </span>
              </td>
              <td className="px-1.5 py-1 text-right">{g.n.toLocaleString()}</td>
              <td className="px-1.5 py-1 text-right">{g.f1.toLocaleString()}/{g.f2.toLocaleString()}</td>
              <td className="px-1.5 py-1 text-right">{pct(g.coverage)}</td>
              {([0, 1, 2] as const).map((q) => (
                <td
                  key={q}
                  className="px-1.5 py-1 text-right"
                  title={q === 0 ? richnessFlagTitle(g.richness, inc ? "sampling units" : "records") : undefined}
                >
                  {fmt(g.observed[q])}→<span className="font-semibold text-forest-800">{fmt(g.asymptotic[q])}</span>
                  <div className="text-[10px] text-moss-600">{se(g, q)}</div>
                  {q === 0 ? <RichnessFlag rc={g.richness} compact /> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Downloads({
  groups,
  inputs,
  bandsPending,
}: {
  groups: InextGroupResult[];
  inputs: InextGroupInput[];
  bandsPending: boolean;
}) {
  const inc = inputs[0]?.type === "incidence";
  const curveCsv = () => {
    const rows = ["group,datatype,size,method,qD_q0,qD_q1,qD_q2,SC,q0_lo,q0_hi,q1_lo,q1_hi,q2_lo,q2_hi,SC_lo,SC_hi"];
    for (const g of groups) {
      for (const p of g.curve) {
        const ci = "lo" in p ? [p.lo[0], p.hi[0], p.lo[1], p.hi[1], p.lo[2], p.hi[2], p.scLo, p.scHi] : Array(8).fill("");
        rows.push([csvQuote(g.label), g.type, p.m, p.method, ...p.qD.map(r6), r6(p.SC), ...ci.map((v) => (v === "" ? "" : r6(v as number)))].join(","));
      }
    }
    return rows.join("\n");
  };
  // Long-format input data + the R code to reproduce every curve on the card.
  const rData = () => {
    const rows = ["group,value"];
    for (const g of inputs) {
      if (g.type === "incidence") rows.push(`${csvQuote(g.label)},${g.T ?? 0}`);
      for (let i = 0; i < g.counts.length; i++) if (g.counts[i]! > 0) rows.push(`${csvQuote(g.label)},${g.counts[i]}`);
    }
    return rows.join("\n");
  };
  const rCode = [
    "# install.packages('iNEXT'); library(iNEXT)",
    "d <- read.csv('inext-input.csv')",
    "x <- split(d$value, factor(d$group, levels = unique(d$group)))",
    `out <- iNEXT(x, q = c(0, 1, 2), datatype = '${inc ? "incidence_freq" : "abundance"}')`,
    "ggiNEXT(out, type = 1, facet.var = 'Order.q')",
  ].join("\n");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-export-exclude>
      <DownloadButton filename="inext-curves.csv" build={curveCsv} disabled={bandsPending}>
        Curves (CSV)
      </DownloadButton>
      <DownloadButton filename="inext-input.csv" build={rData}>
        Data for R
      </DownloadButton>
      <details className="w-full text-[11px] text-moss-700">
        <summary className="cursor-pointer text-forest-700">R code to reproduce</summary>
        <pre className="mt-1 overflow-x-auto rounded bg-cream-100 p-2 text-[10.5px] text-bark-700">{rCode}</pre>
      </details>
    </div>
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
      className="inline-flex items-center gap-1.5 rounded-md border border-forest-200 bg-cream-50 px-2 py-1 text-forest-700 hover:bg-cream-100 disabled:opacity-50"
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
        once (<i>f</i>₁) and twice (<i>f</i>₂).
      </p>
      <p>
        <strong>Records vs. sampling units.</strong> With <em>Records</em>, every
        occurrence counts as one individual. That overweights species that are
        photographed or collected in bulk. <em>Sampling units</em> (incidence
        data) instead ask, for each county-year or 10-km cell-year, only
        <em> whether</em> a species was recorded there. The singletons become
        species found in just one unit (<i>Q</i>₁), and the estimate becomes
        Chao2. Comparing the two is a good lesson in how the unit of sampling
        changes the answer.
      </p>
      <p>
        <strong>Hill numbers</strong> put richness and evenness on one scale, in
        units of “effective number of species”. <i>q</i>=0 counts every species
        equally (richness), <i>q</i>=1 (exp Shannon) counts the “common”
        species, <i>q</i>=2 (inverse Simpson) the “dominant” ones. The{" "}
        <em>Profile</em> view traces this continuously from <i>q</i> = 0 to 3.
        A steeply falling profile means a few species dominate. If two groups’
        profiles cross, which one is “more diverse” depends on how much weight
        you give rare species.
      </p>
      <p>
        <strong>Is the estimate trustworthy yet?</strong> Chao1 (and Chao2)
        estimate the <em>minimum</em> true richness: while the curve is still
        climbing they usually underestimate. Under each richness estimate a flag
        applies the sufficient-sampling test of Chao et al. (2009): how much more
        sampling would it take to record 90% of the estimated species? If that is
        more than doubling the current sample, beyond the range where
        extrapolation is reliable, the estimate is flagged <em>curve still
        steep</em>. Read it as “at least this many”. Exception: singletons from
        misidentifications or stray individuals inflate Chao1, so a steep flag
        on a well-known group (e.g. butterflies) can mean messy data rather
        than undiscovered species.
      </p>
      <p>
        <strong>Coverage</strong> is the estimated share of all records (or
        incidences) belonging to species already detected. Comparing groups at
        equal coverage compares them at equal completeness (Chao &amp; Jost 2012).
      </p>
      <p>
        <strong>Try this:</strong> compare <em>Data source</em> with Records, then
        with Sampling units. Does the gap between specimens and observations
        shrink? Why might it?
      </p>
      <p className="text-moss-600">
        Methods follow the R package iNEXT (Hsieh, Ma &amp; Chao 2016); this port
        reproduces its abundance and incidence estimates (tested against iNEXT
        3.0.2). Bands come from 50 bootstrap replicates. Download the data for R
        to rerun any curve.
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
  if (view === "profile") {
    return `Diversity profiles from q=0 to 3 for ${groups.map((g) => g.label).join(", ")}.`;
  }
  const what = view === "completeness" ? "sample coverage" : Q_LABEL[q].toLowerCase();
  const parts = groups.map(
    (g) => `${g.label}: sample size ${g.n.toLocaleString()}, ${Math.round(g.observed[q]).toLocaleString()} observed, ${Math.round(g.asymptotic[q]).toLocaleString()} estimated`,
  );
  return `Rarefaction and extrapolation curves of ${what}. ${parts.join("; ")}.`;
}
