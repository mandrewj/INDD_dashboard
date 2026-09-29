"use client";

import { useMemo } from "react";
import { useLoadedData } from "@/lib/dataContext";
import { useFilteredRecords, useFilters } from "@/lib/filterContext";
import { FIELD, type Dictionaries, type RecordTuple } from "@/lib/types";
import { ChartCard, EmptyState, SERIES_COLORS } from "./ChartCard";

/** Same hues as the time chart: blue = observations, orange = specimens. */
const OBS = SERIES_COLORS[0];
const SPEC = SERIES_COLORS[1];
const TOP_N = 12;
/** log2 ratio shown on the axis: ±3 = 8× over-represented. */
const MAX_LOG2 = 3;

interface Row {
  id: number;
  label: string;
  italic: boolean;
  obs: number;
  spec: number;
  /** log2(share among observations / share among specimens), smoothed */
  log2: number;
}

/**
 * "Who records what": for the current taxon, which subgroups are
 * over-represented in community observations vs. museum specimens. A direct
 * look at collector/taxonomic bias in occurrence data.
 */
export function CollectorBias() {
  const { dictionaries } = useLoadedData();
  const filtered = useFilteredRecords();
  const { filters, setTaxon } = useFilters();

  const level = childLevel(filters);
  const result = useMemo(
    () => compute(filtered, dictionaries, level.field),
    [filtered, dictionaries, level.field],
  );

  const drill = (id: number) => {
    if (level.field === FIELD.ORDER) setTaxon({ orderId: id, familyId: null, genusId: null, speciesId: null });
    else if (level.field === FIELD.FAMILY) setTaxon({ ...filters, familyId: id, genusId: null, speciesId: null });
    else if (level.field === FIELD.GENUS) setTaxon({ ...filters, genusId: id, speciesId: null });
    else setTaxon({ ...filters, speciesId: id });
  };

  const { rows, obsTotal, specTotal, onlyObs, onlySpec, both } = result;
  const spTotal = onlyObs + onlySpec + both;

  return (
    <ChartCard
      title="Who records what: observations vs. specimens"
      subtitle={
        rows.length > 0 ? (
          <>
            Which {level.plural} are over-represented among community observations
            ({obsTotal.toLocaleString()} records) versus museum specimens (
            {specTotal.toLocaleString()}). Bars show the ratio of each group’s share
            of records. Click a bar to drill down.
          </>
        ) : undefined
      }
      explainer={
        <>
          <p>
            People photograph what is big, colourful, slow, and near paths:
            butterflies, dragonflies, showy beetles. Museum collections reflect
            what specialists collected with nets, lights, and traps, including
            tiny flies, wasps, and beetles that are hard to identify from photos.
            Neither is a random sample of the fauna.
          </p>
          <p>
            Each bar compares a group’s <em>share</em> of observation records with
            its share of specimen records (log scale). ×4 to the right means the
            group makes up four times as large a fraction of observations as of
            specimens. The bottom strip counts species known from only one source.
            Losing either source would erase those species from the state list.
          </p>
          <p>
            <strong>Try this:</strong> drill into Diptera or Hymenoptera, then into
            Lepidoptera. Which data source would you trust for a county species
            list of each?
          </p>
        </>
      }
      exportCaption={`Ratio of each ${level.singular}'s share of human-observation records to its share of museum-specimen records (log scale), top ${TOP_N} ${level.plural} by records. Species known only from specimens: ${onlySpec.toLocaleString()}; only from observations: ${onlyObs.toLocaleString()}; both: ${both.toLocaleString()}.`}
    >
      {rows.length === 0 ? (
        <EmptyState>Needs records from both observations and specimens.</EmptyState>
      ) : (
        <div>
          <div className="mb-1 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-2 text-[10px] text-moss-600">
            <span />
            <div className="flex justify-between">
              <span style={{ color: SPEC }} className="font-medium">◀ more in specimens</span>
              <span style={{ color: OBS }} className="font-medium">more in observations ▶</span>
            </div>
          </div>
          <ul className="space-y-[3px]">
            {rows.map((r) => {
              const v = Math.max(-MAX_LOG2, Math.min(MAX_LOG2, r.log2));
              const w = (Math.abs(v) / MAX_LOG2) * 50;
              const right = v >= 0;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => drill(r.id)}
                    title={`${r.label}: ${r.obs.toLocaleString()} observation records (${((100 * r.obs) / obsTotal).toFixed(1)}%), ${r.spec.toLocaleString()} specimen records (${((100 * r.spec) / specTotal).toFixed(1)}%)`}
                    className="group grid w-full grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-x-2 text-left"
                  >
                    <span className={`truncate text-xs text-bark-700 group-hover:text-forest-700 ${r.italic ? "italic" : ""}`}>
                      {r.label}
                    </span>
                    <span className="relative block h-4">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-moss-300" aria-hidden />
                      <span
                        className="absolute inset-y-0.5 rounded-sm"
                        style={{
                          background: right ? OBS : SPEC,
                          left: right ? "50%" : `${50 - w}%`,
                          width: `${Math.max(w, 0.6)}%`,
                        }}
                      />
                      {/* Label outside the bar end, or inside it when the bar is near the edge. */}
                      <span
                        className={`absolute top-0 text-[10px] tabular-nums ${w > 40 ? "text-white" : "text-bark-600"}`}
                        style={
                          w > 40
                            ? right
                              ? { right: `calc(${50 - w}% + 3px)` }
                              : { left: `calc(${50 - w}% + 3px)` }
                            : right
                              ? { left: `calc(${50 + w}% + 3px)` }
                              : { right: `calc(${50 + w}% + 3px)` }
                        }
                      >
                        {ratioLabel(r.log2)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-2 text-[10px] tabular-nums text-moss-600">
            <span />
            <div className="flex justify-between">
              <span>×8</span><span>×4</span><span>×2</span><span>1</span><span>×2</span><span>×4</span><span>×8</span>
            </div>
          </div>

          {spTotal > 0 ? (
            <div className="mt-4">
              <div className="mb-1 text-[11px] text-bark-700">
                {spTotal.toLocaleString()} species, by the sources that recorded them
              </div>
              <div className="flex h-5 w-full overflow-hidden rounded" role="img" aria-label={`${onlySpec} species only from specimens, ${both} from both, ${onlyObs} only from observations`}>
                <div style={{ width: `${(100 * onlySpec) / spTotal}%`, background: SPEC }} />
                <div style={{ width: `${(100 * both) / spTotal}%`, background: "#B7BDC0" }} className="border-x-2 border-white" />
                <div style={{ width: `${(100 * onlyObs) / spTotal}%`, background: OBS }} />
              </div>
              <div className="mt-1 flex justify-between gap-2 text-[11px] tabular-nums text-bark-700">
                <span><strong>{onlySpec.toLocaleString()}</strong> specimens only</span>
                <span className="text-moss-600">{both.toLocaleString()} both</span>
                <span><strong>{onlyObs.toLocaleString()}</strong> observations only</span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------

type Level = {
  field: typeof FIELD.ORDER | typeof FIELD.FAMILY | typeof FIELD.GENUS | typeof FIELD.SPECIES;
  singular: string;
  plural: string;
};

function childLevel(f: { orderId: number | null; familyId: number | null; genusId: number | null }): Level {
  if (f.genusId !== null) return { field: FIELD.SPECIES, singular: "species", plural: "species" };
  if (f.familyId !== null) return { field: FIELD.GENUS, singular: "genus", plural: "genera" };
  if (f.orderId !== null) return { field: FIELD.FAMILY, singular: "family", plural: "families" };
  return { field: FIELD.ORDER, singular: "order", plural: "orders" };
}

function compute(records: readonly RecordTuple[], d: Dictionaries, field: Level["field"]) {
  const obsId = d.basisOfRecord.indexOf("HUMAN_OBSERVATION");
  const specId = d.basisOfRecord.indexOf("PRESERVED_SPECIMEN");
  const labels = field === FIELD.ORDER ? d.order : field === FIELD.FAMILY ? d.family : field === FIELD.GENUS ? d.genus : d.species;
  // Typed arrays indexed by group / species id: one cheap pass per filter change.
  const obsBy = new Int32Array(labels.length);
  const specBy = new Int32Array(labels.length);
  const spSource = new Uint8Array(d.species.length); // bit 1 = obs, bit 2 = spec
  let obsTotal = 0;
  let specTotal = 0;
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    const b = r[FIELD.BASIS];
    const isObs = b === obsId;
    if (!isObs && b !== specId) continue;
    const sp = r[FIELD.SPECIES];
    if (sp !== 0) spSource[sp] = spSource[sp]! | (isObs ? 1 : 2);
    const g = r[field] as number;
    if (g === 0) continue;
    if (isObs) { obsBy[g]!++; obsTotal++; } else { specBy[g]!++; specTotal++; }
  }
  let onlyObs = 0, onlySpec = 0, both = 0;
  for (let sp = 1; sp < spSource.length; sp++) {
    const v = spSource[sp];
    if (v === 1) onlyObs++;
    else if (v === 2) onlySpec++;
    else if (v === 3) both++;
  }
  const counts = new Map<number, { obs: number; spec: number }>();
  for (let g = 1; g < labels.length; g++) {
    if (obsBy[g]! + specBy[g]! > 0) counts.set(g, { obs: obsBy[g]!, spec: specBy[g]! });
  }
  const empty = { rows: [] as Row[], obsTotal, specTotal, onlyObs, onlySpec, both };
  if (obsTotal === 0 || specTotal === 0) return empty;
  const K = counts.size;
  const rows: Row[] = [...counts.entries()]
    .sort((a, b) => b[1].obs + b[1].spec - (a[1].obs + a[1].spec))
    .slice(0, TOP_N)
    .map(([id, c]) => ({
      id,
      label: labels[id] ?? "(unknown)",
      italic: field === FIELD.GENUS || field === FIELD.SPECIES,
      obs: c.obs,
      spec: c.spec,
      // +0.5 pseudo-count keeps groups absent from one source finite.
      log2: Math.log2(((c.obs + 0.5) / (obsTotal + 0.5 * K)) / ((c.spec + 0.5) / (specTotal + 0.5 * K))),
    }))
    .sort((a, b) => b.log2 - a.log2);
  return { ...empty, rows };
}

function ratioLabel(log2: number): string {
  const r = 2 ** Math.abs(log2);
  if (r < 1.1) return "≈";
  const s = r >= 10 ? Math.round(r).toString() : r.toFixed(1);
  return `×${s}`;
}
