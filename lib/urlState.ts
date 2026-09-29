/**
 * Filter state ⇄ URL query string.
 *
 * Links are keyed by *names*, never dictionary ids — ids are reassigned on
 * every data rebuild, names are stable. Supported params:
 *
 *   taxon=<name>     any rank; resolved species → genus → family → order
 *   order= family= genus= species=   explicit rank (optional alternative)
 *   county=<name>    county name, or "unknown" for the unmapped bucket
 *   from=<year>  to=<year>           year range
 *   noyear=0         exclude records without a year
 *
 * Matching is case-insensitive and tolerant of "+"/"_" for spaces, so
 * `?taxon=danaus_plexippus&county=tippecanoe` works. Selecting a taxon also
 * fills in its parents (e.g. family → order) so the cascading filter panel
 * stays consistent.
 */

import { createInitialFilterState, type FilterState } from "./filtering";
import { FIELD, type Dictionaries, type RecordTuple } from "./types";

export const URL_PARAM_KEYS = [
  "taxon",
  "order",
  "family",
  "genus",
  "species",
  "county",
  "from",
  "to",
  "noyear",
] as const;

type Rank = "order" | "family" | "genus" | "species";

function norm(s: string): string {
  return s.trim().replace(/[_+]+/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function findId(dict: readonly string[], name: string): number | null {
  const target = norm(name);
  if (target === "") return null;
  for (let i = 1; i < dict.length; i++) {
    if (norm(dict[i] ?? "") === target) return i;
  }
  return null;
}

const RANK_FIELD = {
  order: FIELD.ORDER,
  family: FIELD.FAMILY,
  genus: FIELD.GENUS,
  species: FIELD.SPECIES,
} as const;

/** Fill parent ranks from the first record carrying the chosen taxon. */
function withParents(
  f: FilterState,
  rank: Rank,
  id: number,
  records: readonly RecordTuple[],
): FilterState {
  const field = RANK_FIELD[rank];
  const r = records.find((rec) => rec[field] === id);
  const next = { ...f };
  if (rank === "species") next.speciesId = id;
  if (rank === "genus" || rank === "species") next.genusId = rank === "genus" ? id : r?.[FIELD.GENUS] || null;
  if (rank !== "order") next.familyId = rank === "family" ? id : r?.[FIELD.FAMILY] || null;
  next.orderId = rank === "order" ? id : r?.[FIELD.ORDER] || null;
  return next;
}

export function parseFilterParams(
  params: URLSearchParams,
  dictionaries: Dictionaries,
  records: readonly RecordTuple[],
  yearFloor: number,
  yearCeil: number,
): FilterState {
  let f = createInitialFilterState(yearFloor, yearCeil);

  // Most specific explicit rank wins; a generic `taxon` is tried last.
  const explicit: Rank[] = ["species", "genus", "family", "order"];
  let resolved = false;
  for (const rank of explicit) {
    const v = params.get(rank);
    if (!v) continue;
    const id = findId(dictionaries[rank], v);
    if (id !== null) {
      f = withParents(f, rank, id, records);
      resolved = true;
      break;
    }
  }
  const taxon = params.get("taxon");
  if (!resolved && taxon) {
    for (const rank of explicit) {
      const id = findId(dictionaries[rank], taxon);
      if (id !== null) {
        f = withParents(f, rank, id, records);
        break;
      }
    }
  }

  const county = params.get("county");
  if (county) {
    if (norm(county) === "unknown") f.countyId = 0;
    else {
      // Accept "Tippecanoe" or "Tippecanoe County"
      const id = findId(dictionaries.county, county.replace(/\s+county$/i, ""));
      if (id !== null) f.countyId = id;
    }
  }

  const clampYear = (v: string | null, fallback: number) => {
    const n = v === null ? NaN : Number.parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(yearCeil, Math.max(yearFloor, n)) : fallback;
  };
  const from = clampYear(params.get("from"), yearFloor);
  const to = clampYear(params.get("to"), yearCeil);
  f.yearMin = Math.min(from, to);
  f.yearMax = Math.max(from, to);
  if (params.get("noyear") === "0") f.includeNullYear = false;
  return f;
}

/**
 * Serialize to the shortest equivalent query: only the most specific taxon
 * (as `taxon=`) plus any non-default county/year settings.
 */
export function filtersToParams(
  f: FilterState,
  dictionaries: Dictionaries,
  yearFloor: number,
  yearCeil: number,
): URLSearchParams {
  const p = new URLSearchParams();
  const taxon =
    f.speciesId !== null
      ? dictionaries.species[f.speciesId]
      : f.genusId !== null
        ? dictionaries.genus[f.genusId]
        : f.familyId !== null
          ? dictionaries.family[f.familyId]
          : f.orderId !== null
            ? dictionaries.order[f.orderId]
            : undefined;
  if (taxon) p.set("taxon", taxon);
  if (f.countyId !== null) {
    p.set("county", f.countyId === 0 ? "unknown" : (dictionaries.county[f.countyId] ?? ""));
  }
  if (f.yearMin !== yearFloor) p.set("from", String(f.yearMin));
  if (f.yearMax !== yearCeil) p.set("to", String(f.yearMax));
  if (!f.includeNullYear) p.set("noyear", "0");
  return p;
}

export function paramsToObject(p: URLSearchParams): Record<string, string> {
  const o: Record<string, string> = {};
  p.forEach((v, k) => {
    o[k] = v;
  });
  return o;
}
