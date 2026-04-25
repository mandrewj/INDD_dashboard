import { FIELD, type Dictionaries, type RecordTuple } from "./types";

export interface FilterState {
  /** Dictionary id; null = all. */
  orderId: number | null;
  familyId: number | null;
  genusId: number | null;
  /** Dictionary id; 0 = "Unknown county" bucket; null = all (incl. unknown). */
  countyId: number | null;
  yearMin: number;
  yearMax: number;
  includeNullYear: boolean;
}

export function createInitialFilterState(
  yearFloor: number,
  yearCeil: number,
): FilterState {
  return {
    orderId: null,
    familyId: null,
    genusId: null,
    countyId: null,
    yearMin: yearFloor,
    yearMax: yearCeil,
    includeNullYear: true,
  };
}

/** True iff the record passes every active dimension. */
export function recordPasses(r: RecordTuple, f: FilterState): boolean {
  if (f.orderId !== null && r[FIELD.ORDER] !== f.orderId) return false;
  if (f.familyId !== null && r[FIELD.FAMILY] !== f.familyId) return false;
  if (f.genusId !== null && r[FIELD.GENUS] !== f.genusId) return false;
  if (f.countyId !== null && r[FIELD.COUNTY] !== f.countyId) return false;
  const y = r[FIELD.YEAR];
  if (y === null) {
    if (!f.includeNullYear) return false;
  } else if (y < f.yearMin || y > f.yearMax) {
    return false;
  }
  return true;
}

export function applyFilters(
  records: readonly RecordTuple[],
  f: FilterState,
): RecordTuple[] {
  const out: RecordTuple[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    if (recordPasses(r, f)) out.push(r);
  }
  return out;
}

/**
 * Compute available option ids for the dependent taxonomic dropdowns.
 * Cascade rule:
 *   - order:  always all
 *   - family: only those that appear in records matching the active order
 *   - genus:  only those that appear in records matching active order+family
 *   - county / year: independent (always all)
 *
 * Each call is one linear scan of the record array (O(n)). With n=366k this
 * runs in single-digit ms in modern JS engines.
 */
export interface DependentOptions {
  familyIds: Set<number>;
  genusIds: Set<number>;
}

export function computeDependentOptions(
  records: readonly RecordTuple[],
  orderId: number | null,
  familyId: number | null,
): DependentOptions {
  const familyIds = new Set<number>();
  const genusIds = new Set<number>();
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    if (orderId !== null && r[FIELD.ORDER] !== orderId) continue;
    familyIds.add(r[FIELD.FAMILY]);
    if (familyId !== null && r[FIELD.FAMILY] !== familyId) continue;
    genusIds.add(r[FIELD.GENUS]);
  }
  return { familyIds, genusIds };
}

/** Build a sorted list of {id, label, count} for a dictionary, restricted
 *  to ids present in `available` (or all ids if `available` is null). */
export function buildOptionList(
  dict: readonly (string | null)[],
  recordCounts: ReadonlyMap<number, number>,
  available: ReadonlySet<number> | null,
): Array<{ id: number; label: string; count: number }> {
  const out: Array<{ id: number; label: string; count: number }> = [];
  for (let i = 1; i < dict.length; i++) {
    if (available !== null && !available.has(i)) continue;
    const label = dict[i] ?? "(unknown)";
    out.push({ id: i, label, count: recordCounts.get(i) ?? 0 });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export function countByField(
  records: readonly RecordTuple[],
  fieldIndex: (typeof FIELD)[keyof typeof FIELD],
): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i < records.length; i++) {
    const v = records[i]![fieldIndex];
    if (typeof v !== "number") continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return m;
}

export function isFilterActive(f: FilterState, yearFloor: number, yearCeil: number): boolean {
  return (
    f.orderId !== null ||
    f.familyId !== null ||
    f.genusId !== null ||
    f.countyId !== null ||
    f.yearMin !== yearFloor ||
    f.yearMax !== yearCeil ||
    !f.includeNullYear
  );
}

/** Helper for chip labels — accepts dict and id, returns the label. */
export function dictLabel(dict: readonly string[], id: number): string {
  return dict[id] ?? "(unknown)";
}

// Re-export the dictionary type for callers that import filtering.ts only.
export type { Dictionaries };
