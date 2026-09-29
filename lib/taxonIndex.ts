/**
 * Static indexes over the full record set, built once per data load:
 *
 *   - which families / genera / species occur under each order / family /
 *     genus (for the cascading filter dropdowns — no per-change record scan);
 *   - record counts per dictionary id;
 *   - dictionary ids pre-sorted by label (so option lists never re-sort).
 *
 * Cached by the records array's identity.
 */
import { FIELD, type Dictionaries, type RecordTuple } from "./types";

export interface TaxonIndex {
  familiesByOrder: Map<number, number[]>;
  generaByOrder: Map<number, number[]>;
  generaByFamily: Map<number, number[]>;
  speciesByGenus: Map<number, number[]>;
  counts: {
    order: Int32Array;
    family: Int32Array;
    genus: Int32Array;
    county: Int32Array;
    species: Int32Array;
  };
  /** Dictionary ids 1..N sorted by label (id 0 = unknown is excluded). */
  sorted: {
    order: number[];
    family: number[];
    genus: number[];
    county: number[];
    species: number[];
  };
}

const cache = new WeakMap<readonly RecordTuple[], TaxonIndex>();

function addPair(m: Map<number, Set<number>>, k: number, v: number) {
  let s = m.get(k);
  if (!s) m.set(k, (s = new Set()));
  s.add(v);
}

function toArrays(m: Map<number, Set<number>>): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const [k, s] of m) out.set(k, [...s]);
  return out;
}

function sortedIds(dict: readonly string[]): number[] {
  const ids: number[] = [];
  for (let i = 1; i < dict.length; i++) ids.push(i);
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return ids.sort((a, b) => collator.compare(dict[a] ?? "", dict[b] ?? ""));
}

export function getTaxonIndex(records: readonly RecordTuple[], d: Dictionaries): TaxonIndex {
  const hit = cache.get(records);
  if (hit) return hit;
  const fo = new Map<number, Set<number>>();
  const go = new Map<number, Set<number>>();
  const gf = new Map<number, Set<number>>();
  const sg = new Map<number, Set<number>>();
  const counts = {
    order: new Int32Array(d.order.length),
    family: new Int32Array(d.family.length),
    genus: new Int32Array(d.genus.length),
    county: new Int32Array(d.county.length),
    species: new Int32Array(d.species.length),
  };
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    const o = r[FIELD.ORDER];
    const f = r[FIELD.FAMILY];
    const g = r[FIELD.GENUS];
    const s = r[FIELD.SPECIES];
    counts.order[o]!++;
    counts.family[f]!++;
    counts.genus[g]!++;
    counts.county[r[FIELD.COUNTY]]!++;
    counts.species[s]!++;
    addPair(fo, o, f);
    addPair(go, o, g);
    addPair(gf, f, g);
    if (s !== 0) addPair(sg, g, s);
  }
  const idx: TaxonIndex = {
    familiesByOrder: toArrays(fo),
    generaByOrder: toArrays(go),
    generaByFamily: toArrays(gf),
    speciesByGenus: toArrays(sg),
    counts,
    sorted: {
      order: sortedIds(d.order),
      family: sortedIds(d.family),
      genus: sortedIds(d.genus),
      county: sortedIds(d.county),
      species: sortedIds(d.species),
    },
  };
  cache.set(records, idx);
  return idx;
}

export interface Option {
  id: number;
  label: string;
  count: number;
}

/** Options in label order, restricted to `allowed` (null = all ids). */
export function optionsFor(
  sorted: readonly number[],
  dict: readonly string[],
  counts: Int32Array,
  allowed: ReadonlySet<number> | null,
): Option[] {
  const out: Option[] = [];
  for (const id of sorted) {
    if (allowed !== null && !allowed.has(id)) continue;
    out.push({ id, label: dict[id] ?? "(unknown)", count: counts[id] ?? 0 });
  }
  return out;
}
