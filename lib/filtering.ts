import { FIELD, type RecordTuple } from "./types";

export interface FilterState {
  /** Dictionary id; null = all. */
  orderId: number | null;
  familyId: number | null;
  genusId: number | null;
  speciesId: number | null;
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
    speciesId: null,
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
  if (f.speciesId !== null && r[FIELD.SPECIES] !== f.speciesId) return false;
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

export function isFilterActive(f: FilterState, yearFloor: number, yearCeil: number): boolean {
  return (
    f.orderId !== null ||
    f.familyId !== null ||
    f.genusId !== null ||
    f.speciesId !== null ||
    f.countyId !== null ||
    f.yearMin !== yearFloor ||
    f.yearMax !== yearCeil ||
    !f.includeNullYear
  );
}
