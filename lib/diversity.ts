/**
 * Shannon diversity index H' = -Σ p_i ln(p_i), where p_i is the proportion
 * of individuals (or here, records) belonging to species i.
 *
 * Convention: species id 0 ("__UNKNOWN__") is excluded — we only count
 * records identified to a real species.
 */

import { FIELD, type RecordTuple } from "./types";

export function shannonFromCounts(counts: Iterable<number>): number {
  let total = 0;
  const arr: number[] = [];
  for (const n of counts) {
    if (n > 0) {
      arr.push(n);
      total += n;
    }
  }
  if (total === 0) return 0;
  let h = 0;
  for (const n of arr) {
    const p = n / total;
    h -= p * Math.log(p);
  }
  return h;
}

export function shannonForRecords(records: readonly RecordTuple[]): number {
  const counts = new Map<number, number>();
  for (let i = 0; i < records.length; i++) {
    const sp = records[i]![FIELD.SPECIES];
    if (sp === 0) continue; // skip unidentified
    counts.set(sp, (counts.get(sp) ?? 0) + 1);
  }
  return shannonFromCounts(counts.values());
}

/** Pielou's evenness J = H' / ln(S), undefined when S < 2 (returns NaN). */
export function pielouEvenness(h: number, s: number): number {
  if (s < 2) return Number.NaN;
  return h / Math.log(s);
}

/**
 * Records-per-species abundance vector (dense, indexed by species id; id 0 =
 * unidentified is left at 0). The input format for lib/inext.
 */
const abundanceCache = new WeakMap<readonly RecordTuple[], Int32Array>();

/**
 * Cached by the records array's identity, so the KPIs, rank–abundance, and
 * accumulation cards share one pass. Treat the result as read-only.
 */
export function speciesAbundances(
  records: readonly RecordTuple[],
  speciesCount: number,
): Int32Array {
  const hit = abundanceCache.get(records);
  if (hit && hit.length === speciesCount) return hit;
  const out = new Int32Array(speciesCount);
  for (let i = 0; i < records.length; i++) {
    const sp = records[i]![FIELD.SPECIES];
    if (sp !== 0) out[sp] = out[sp]! + 1;
  }
  abundanceCache.set(records, out);
  return out;
}

/** Abundance vector with the zero entries dropped (compact, for export). */
export function nonZero(counts: Int32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < counts.length; i++) if (counts[i]! > 0) out.push(counts[i]!);
  return out;
}
