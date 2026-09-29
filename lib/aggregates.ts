/**
 * Shared, cached aggregations over a filtered record array.
 *
 * Filter changes re-render every chart, so hot loops here use typed arrays
 * indexed by dictionary id instead of Map/Set per record (≈5–10× faster on
 * the full ~400k records). Results are cached by the records array's
 * identity: charts reading the same filtered array share one pass.
 */
import { FIELD, type RecordTuple } from "./types";

export interface CountySpeciesMatrix {
  nCounty: number;
  nSpecies: number;
  /** abund[c * nSpecies + s] = identified records of species s in county c */
  abund: Int32Array;
  /** All records per county id (including those not identified to species). */
  records: Int32Array;
  /** Species abundances pooled over mapped counties (county ≠ 0). */
  pooled: Int32Array;
  /** Distinct species among records with no county (county id 0). */
  unmappedSpecies: number;
}

const matrixCache = new WeakMap<readonly RecordTuple[], CountySpeciesMatrix>();

export function countySpeciesMatrix(
  records: readonly RecordTuple[],
  nCounty: number,
  nSpecies: number,
): CountySpeciesMatrix {
  const hit = matrixCache.get(records);
  if (hit && hit.nCounty === nCounty && hit.nSpecies === nSpecies) return hit;
  const abund = new Int32Array(nCounty * nSpecies);
  const perCounty = new Int32Array(nCounty);
  const pooled = new Int32Array(nSpecies);
  const unmapped = new Uint8Array(nSpecies);
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    const c = r[FIELD.COUNTY];
    const s = r[FIELD.SPECIES];
    perCounty[c]!++;
    if (s === 0) continue;
    if (c === 0) {
      unmapped[s] = 1;
      continue;
    }
    abund[c * nSpecies + s]!++;
    pooled[s]!++;
  }
  let unmappedSpecies = 0;
  for (let s = 0; s < nSpecies; s++) unmappedSpecies += unmapped[s]!;
  const m = { nCounty, nSpecies, abund, records: perCounty, pooled, unmappedSpecies };
  matrixCache.set(records, m);
  return m;
}

/** Species abundance vector for one county (a view, not a copy). */
export function countyRow(m: CountySpeciesMatrix, countyId: number): Int32Array {
  return m.abund.subarray(countyId * m.nSpecies, (countyId + 1) * m.nSpecies);
}

/** Number of non-zero entries. */
export function richness(v: ArrayLike<number>): number {
  let k = 0;
  for (let i = 0; i < v.length; i++) if (v[i]! > 0) k++;
  return k;
}
