/**
 * Rarefaction / extrapolation of Hill numbers — a TypeScript port of the
 * parts of the R package iNEXT (v3; Hsieh, Ma & Chao 2016) the dashboard
 * needs, for both of iNEXT's main data types:
 *
 *   - "abundance": x = records per species; sample size n = Σx.
 *   - "incidence" (iNEXT `incidence_freq`): T sampling units, y = number of
 *     units each species was detected in; U = Σy total incidences.
 *
 * The two share every formula once written in terms of (n, U): for abundance
 * data U = n. Provided:
 *
 *   - Hill numbers of order q: observed (MLE, any q ≥ 0), rarefied to m < n,
 *     extrapolated to m > n (q = 0, 1, 2), and asymptotic estimates (q = 0:
 *     Chao1 / Chao2; q = 1: Chao et al. 2013; integer q ≥ 2: unbiased).
 *   - Sample coverage Ĉ(m) (Chao & Jost 2012), interpolated and extrapolated.
 *   - Bootstrap standard errors via iNEXT's estimated bootstrap assemblage.
 *
 * Validated against iNEXT 3.0.2 on `spider$Girdled` (abundance) and
 * `ant$h500m` (incidence) — see lib/inext.test.ts.
 *
 * Everything works on the *frequency-count* form (value i → fᵢ = number of
 * species with exactly i records/units), like iNEXT, so cost scales with the
 * number of distinct values rather than the number of species.
 */

export type Q = 0 | 1 | 2;
export const QS: readonly Q[] = [0, 1, 2];
export type DataType = "abundance" | "incidence";

/** Orders q for the observed diversity profile (0 → 3). */
export const PROFILE_QS: readonly number[] = Array.from({ length: 31 }, (_, k) => k / 10);

/** Distinct abundance/incidence values and how many species have each. */
export interface FreqTable {
  type: DataType;
  /** values i (ascending, all > 0) */
  i: Float64Array;
  /** fᵢ — species count at each value (Qᵢ for incidence) */
  f: Float64Array;
  /** sample size: records (abundance) or sampling units T (incidence) */
  n: number;
  /** total incidences Σy (incidence); equals n for abundance data */
  U: number;
  S: number;
  f1: number;
  f2: number;
}

function tabulate(values: ArrayLike<number>): { m: Map<number, number>; sum: number; S: number } {
  const m = new Map<number, number>();
  let sum = 0;
  let S = 0;
  for (let k = 0; k < values.length; k++) {
    const x = values[k]!;
    if (x <= 0) continue;
    m.set(x, (m.get(x) ?? 0) + 1);
    sum += x;
    S++;
  }
  return { m, sum, S };
}

function build(type: DataType, m: Map<number, number>, n: number, U: number, S: number): FreqTable {
  const keys = [...m.keys()].sort((a, b) => a - b);
  return {
    type,
    i: new Float64Array(keys),
    f: new Float64Array(keys.map((k) => m.get(k)!)),
    n,
    U,
    S,
    f1: m.get(1) ?? 0,
    f2: m.get(2) ?? 0,
  };
}

/** Abundance data: records per species. */
export function freqTable(counts: ArrayLike<number>): FreqTable {
  const { m, sum, S } = tabulate(counts);
  return build("abundance", m, sum, sum, S);
}

/**
 * Incidence data: `T` sampling units and, per species, the number of units
 * it was detected in (each ≤ T).
 */
export function incidenceTable(T: number, detections: ArrayLike<number>): FreqTable {
  const { m, sum, S } = tabulate(detections);
  return build("incidence", m, T, sum, S);
}

// ---------------------------------------------------------------------------
// log-factorial and harmonic tables, grown on demand and shared across calls.

let lfCache = new Float64Array([0, 0]);
function logFactorials(n: number): Float64Array {
  if (lfCache.length > n) return lfCache;
  const out = new Float64Array(n + 1);
  out.set(lfCache);
  for (let k = lfCache.length; k <= n; k++) out[k] = out[k - 1]! + Math.log(k);
  lfCache = out;
  return out;
}

// ---------------------------------------------------------------------------
// Undetected-species quantities

/** Chao1 (abundance) / Chao2 (incidence) undetected richness f̂₀. */
export function f0Hat(t: FreqTable): number {
  const { n, f1, f2 } = t;
  if (n === 0) return 0;
  return f2 > 0 ? ((n - 1) / n) * (f1 * f1) / (2 * f2) : ((n - 1) / n) * (f1 * (f1 - 1)) / 2;
}

/** The "A" factor in Chao & Jost's coverage estimator. */
function coverageA(t: FreqTable): number {
  const f0 = f0Hat(t);
  return t.f1 > 0 ? (t.n * f0) / (t.n * f0 + t.f1) : 1;
}

/** Sample coverage of the reference sample, Ĉ = 1 − (f₁/U)·A. */
export function sampleCoverage(t: FreqTable): number {
  if (t.n === 0 || t.U === 0) return 0;
  return 1 - (t.f1 / t.U) * coverageA(t);
}

// ---------------------------------------------------------------------------
// Observed and asymptotic diversity

/** Hill number of order q (any q ≥ 0) of the observed relative frequencies. */
export function hillObserved(t: FreqTable, q: number): number {
  const { i, f, U, S } = t;
  if (U === 0) return 0;
  if (q === 0) return S;
  if (Math.abs(q - 1) < 1e-9) {
    let h = 0;
    for (let k = 0; k < i.length; k++) {
      const p = i[k]! / U;
      h -= f[k]! * p * Math.log(p);
    }
    return Math.exp(h);
  }
  let s = 0;
  for (let k = 0; k < i.length; k++) s += f[k]! * Math.pow(i[k]! / U, q);
  return Math.pow(s, 1 / (1 - q));
}

/** Chao et al. (2013) second-order correction term for Shannon entropy. */
function shannonCorrection(n: number, f1: number, f2: number): number {
  if (f1 === 0) return 0;
  const p1 = f2 > 0 ? (2 * f2) / ((n - 1) * f1 + 2 * f2) : f1 > 1 ? 2 / ((n - 1) * (f1 - 1) + 2) : 1;
  if (p1 >= 1) return 0;
  // B = f1/n · (1-p1)^(1-n) · (−ln p1 − Σ_{r=1}^{n-1} (1-p1)^r / r).
  const q = 1 - p1;
  if (n * p1 > 5) {
    // Bracket ≡ Σ_{r≥n} (1-p1)^r / r. When (1-p1)^n is tiny the direct form
    // cancels catastrophically, but this tail converges within ~40/p1 terms.
    let tail = 0;
    let term = q; // (1-p1)^(r-n+1), already rescaled by (1-p1)^(1-n)
    for (let r = n; ; r++) {
      const add = term / r;
      tail += add;
      if (add < 1e-16 * tail) break;
      term *= q;
    }
    return (f1 / n) * tail;
  }
  // Otherwise (1-p1)^n is O(1): the direct partial sum loses few digits and
  // costs exactly n−1 terms.
  let partial = 0;
  let pow = 1;
  for (let r = 1; r < n; r++) {
    pow *= q;
    partial += pow / r;
  }
  return (f1 / n) * Math.pow(q, 1 - n) * (-Math.log(p1) - partial);
}

/** log C(a, k) for real a ≥ k ≥ 0 integer k (a is an integer here). */
function lchoose(lf: Float64Array, a: number, k: number): number {
  return lf[a]! - lf[k]! - lf[a - k]!;
}

/**
 * Asymptotic (estimated true) Hill number. q = 0, 1, or an integer ≥ 2.
 * For incidence data these are the iNEXT `Diversity_profile.inc` estimators.
 */
export function hillAsymptotic(t: FreqTable, q: number): number {
  const { i, f, n, U, S } = t;
  if (n === 0 || U === 0) return 0;
  if (q === 0) return S + f0Hat(t);
  if (q === 1) {
    // A = Σ x/n (ψ(n) − ψ(x)), with ψ(n) − ψ(x) = Σ_{k=x}^{n-1} 1/k.
    // Walk the harmonic sum downward from n−1 once, visiting each distinct x.
    let A = 0;
    let harm = 0;
    let k = n - 1;
    for (let j = i.length - 1; j >= 0; j--) {
      const x = i[j]!;
      while (k >= x) {
        harm += 1 / k;
        k--;
      }
      A += f[j]! * (x / n) * harm;
    }
    // Abundance: exp(A + B). Incidence rescales by n/U (= T/U); U = n makes
    // the two identical.
    return Math.exp((n / U) * (A + shannonCorrection(n, t.f1, t.f2)) + Math.log(U / n));
  }
  if (!Number.isInteger(q) || q < 2) throw new Error(`hillAsymptotic: unsupported q=${q}`);
  if (n < q) return hillObserved(t, q);
  const lf = logFactorials(n);
  let s = 0;
  for (let k = 0; k < i.length; k++) {
    const x = i[k]!;
    if (x >= q) s += f[k]! * Math.exp(lchoose(lf, x, q) - lchoose(lf, n, q));
  }
  if (s === 0) return Number.POSITIVE_INFINITY;
  return Math.pow(U / n, q / (q - 1)) * Math.pow(s, 1 / (1 - q));
}

// ---------------------------------------------------------------------------
// Rarefaction (m < n)

function rarefyQ0(t: FreqTable, m: number, lf: Float64Array): number {
  const { i, f, n, S } = t;
  const base = lf[n - m]! - lf[n]!;
  let missed = 0;
  for (let k = 0; k < i.length; k++) {
    const x = i[k]!;
    if (n - x < m) break; // i ascending → all remaining terms are 0
    missed += f[k]! * Math.exp(lf[n - x]! - lf[n - x - m]! + base);
  }
  return S - missed;
}

function rarefyQ1(t: FreqTable, m: number, lf: Float64Array): number {
  const { i, f, n, U } = t;
  // Expected total at size m: m records, or m·U/T incidences.
  const Um = (m * U) / n;
  const logUm = Math.log(Um);
  const plogp = (k: number) => (k > 0 ? (k / Um) * (Math.log(k) - logUm) : 0);
  let h = 0;
  if (m === n - 1) {
    // Removing one unit: K = x−1 with prob x/n, else K = x. Exact, and it
    // matters — the extrapolation slope β hinges on D(n) − D(n−1), a tiny
    // difference the windowed sum below can't resolve precisely enough.
    for (let j = 0; j < i.length; j++) {
      const x = i[j]!;
      h -= f[j]! * ((x / n) * plogp(x - 1) + (1 - x / n) * plogp(x));
    }
    return Math.exp(h);
  }
  const lCnm = lf[n]! - lf[m]! - lf[n - m]!;
  for (let j = 0; j < i.length; j++) {
    const x = i[j]!;
    // K ~ Hypergeometric(n, x, m). Sum −(k/Um)ln(k/Um)·P(K=k) over a window
    // around the mean wide enough that the omitted mass is negligible.
    const lo = Math.max(1, m - (n - x));
    const hi = Math.min(x, m);
    if (lo > hi) continue;
    const mean = (m * x) / n;
    const sd = Math.sqrt((mean * (1 - x / n) * (n - m)) / Math.max(1, n - 1));
    const a = Math.max(lo, Math.floor(mean - 10 * sd - 10));
    const b = Math.min(hi, Math.ceil(mean + 10 * sd + 10));
    const lx = lf[x]!;
    const lnx = lf[n - x]!;
    let e = 0;
    for (let k = a; k <= b; k++) {
      const lp = lx - lf[k]! - lf[x - k]! + lnx - lf[m - k]! - lf[n - x - m + k]! - lCnm;
      e += Math.exp(lp) * plogp(k);
    }
    h -= f[j]! * e;
  }
  return Math.exp(h);
}

/**
 * q = 2 at any size m, rarefied or extrapolated:
 *   ²D(m) = m·U² / (n·(U + (m−1)·Σx(x−1)/(n−1)))
 * (reduces to iNEXT's abundance and incidence forms when U = n / U = Σy).
 */
function hillQ2At(t: FreqTable, m: number): number {
  const { i, f, n, U } = t;
  if (n < 2) return hillObserved(t, 2);
  let s = 0;
  for (let k = 0; k < i.length; k++) {
    const x = i[k]!;
    s += f[k]! * x * (x - 1);
  }
  return (m * U * U) / (n * (U + ((m - 1) * s) / (n - 1)));
}

function coverageRarefied(t: FreqTable, m: number, lf: Float64Array): number {
  const { i, f, n, U } = t;
  const base = lf[n - 1 - m]! - lf[n - 1]!;
  let s = 0;
  for (let k = 0; k < i.length; k++) {
    const x = i[k]!;
    if (n - x < m) break;
    s += f[k]! * (x / U) * Math.exp(lf[n - x]! - lf[n - x - m]! + base);
  }
  return 1 - s;
}

// ---------------------------------------------------------------------------
// Public curve evaluation

export interface Estimator {
  t: FreqTable;
  /** Hill number of order q at sample size m (rarefied, observed, or extrapolated). */
  hillAt(m: number, q: Q): number;
  /** Estimated sample coverage at sample size m. */
  coverageAt(m: number): number;
}

/**
 * Build an evaluator over one assemblage. Caches the quantities that are
 * reused across many m (observed, asymptotic, D(n−1), β).
 */
export function makeEstimator(input: ArrayLike<number> | FreqTable): Estimator {
  const t = "f" in input && "i" in input ? (input as FreqTable) : freqTable(input as ArrayLike<number>);
  const lf = logFactorials(t.n);
  const A = coverageA(t);
  const cache = new Map<0 | 1, { o: number; a: number; beta: number }>();

  function extrapolationParams(q: 0 | 1): { o: number; a: number; beta: number } {
    let p = cache.get(q);
    if (!p) {
      const o = hillObserved(t, q);
      const a = hillAsymptotic(t, q);
      // iNEXT 3: D(n+m*) = D_obs + (D_asy − D_obs)(1 − (1 − β)^m*),
      // β = (D_obs − D(n−1)) / (D_asy − D(n−1)).
      const dn1 = t.n > 1 ? (q === 0 ? rarefyQ0(t, t.n - 1, lf) : rarefyQ1(t, t.n - 1, lf)) : o;
      p = { o, a, beta: a !== dn1 ? (o - dn1) / (a - dn1) : 0 };
      cache.set(q, p);
    }
    return p;
  }

  return {
    t,
    hillAt(m: number, q: Q): number {
      const n = t.n;
      if (n === 0 || m <= 0) return 0;
      if (q === 2) return hillQ2At(t, m);
      if (m === n) return hillObserved(t, q);
      if (m < n) return q === 0 ? rarefyQ0(t, m, lf) : rarefyQ1(t, m, lf);
      const { o, a, beta } = extrapolationParams(q);
      return o + (a - o) * (1 - Math.pow(1 - beta, m - n));
    },
    coverageAt(m: number): number {
      const n = t.n;
      if (n === 0 || m <= 0 || t.U === 0) return 0;
      if (m < n) return coverageRarefied(t, m, lf);
      if (m === n) return 1 - (t.f1 / t.U) * A;
      return 1 - (t.f1 / t.U) * Math.pow(A, m - n + 1);
    },
  };
}

/**
 * Expected number of *new* species from `extra` more records/units beyond
 * the current sample: ⁰D(n + extra) − S_obs.
 */
export function expectedNewSpecies(t: FreqTable, extra: number): number {
  if (t.n === 0) return 0;
  return Math.max(0, makeEstimator(t).hillAt(t.n + extra, 0) - t.S);
}

/**
 * Sample-size knots for a rarefaction/extrapolation curve: iNEXT's linear
 * spacing plus geometric points, so the steep early part of the curve is
 * drawn smoothly.
 */
export function curveKnots(n: number, endpoint = 2 * n, knots = 40): number[] {
  if (n <= 0) return [];
  const out = new Set<number>([1, n]);
  const half = Math.max(2, Math.floor(knots / 2));
  for (let k = 0; k < half; k++) {
    out.add(Math.max(1, Math.floor(1 + ((n - 1) * k) / (half - 1))));
  }
  // Geometric knots across the whole rarefied range: the curve bends most at
  // small m, and the coverage view stretches that region out.
  for (let v = 2; v < n; v *= 1.5) out.add(Math.floor(v));
  if (endpoint > n) {
    for (let k = 1; k <= half; k++) {
      out.add(Math.floor(n + ((endpoint - n) * k) / half));
    }
  }
  return [...out].filter((m) => m >= 1 && m <= Math.max(n, endpoint)).sort((a, b) => a - b);
}

export type Method = "Rarefaction" | "Observed" | "Extrapolation";

export interface CurvePoint {
  m: number;
  method: Method;
  /** Hill numbers at q = 0, 1, 2 */
  qD: [number, number, number];
  SC: number;
}

export function computeCurve(est: Estimator, ms: readonly number[]): CurvePoint[] {
  const n = est.t.n;
  return ms.map((m) => ({
    m,
    method: m < n ? "Rarefaction" : m === n ? "Observed" : "Extrapolation",
    qD: [est.hillAt(m, 0), est.hillAt(m, 1), est.hillAt(m, 2)],
    SC: est.coverageAt(m),
  }));
}

// ---------------------------------------------------------------------------
// Chao1 / Chao2 with iNEXT's log-normal confidence interval

export interface Chao1 {
  observed: number;
  estimate: number;
  se: number;
  lower: number;
  upper: number;
}

export function chao1(t: FreqTable, z = 1.959964): Chao1 {
  const { n, S: D, f1, f2 } = t;
  if (n === 0) return { observed: 0, estimate: 0, se: 0, lower: 0, upper: 0 };
  const k = (n - 1) / n;
  let est: number;
  let v: number;
  if (f1 > 0 && f2 > 0) {
    const r = f1 / f2;
    est = D + (k * f1 * f1) / (2 * f2);
    v = f2 * ((k * r * r) / 2 + k * k * r ** 3 + (k * k * r ** 4) / 4);
  } else if (f1 > 1 && f2 === 0) {
    est = D + (k * f1 * (f1 - 1)) / 2;
    v = (k * f1 * (f1 - 1)) / 2 + (k * k * f1 * (2 * f1 - 1) ** 2) / 4 - (k * k * f1 ** 4) / 4 / est;
  } else {
    // No undetected-species signal; iNEXT reports the observed richness with
    // a Poisson-approximation interval.
    let varObs = 0;
    let pSum = 0;
    let lin = 0;
    for (let j = 0; j < t.i.length; j++) {
      const x = t.i[j]!;
      const fx = t.f[j]!;
      varObs += fx * (Math.exp(-x) - Math.exp(-2 * x));
      lin += x * Math.exp(-x) * fx;
      pSum += (fx * Math.exp(-x)) / D;
    }
    varObs -= (lin * lin) / n;
    const sd = Math.sqrt(Math.max(0, varObs));
    return {
      observed: D,
      estimate: D,
      se: sd,
      lower: Math.max(D, D / (1 - pSum) - (z * sd) / (1 - pSum)),
      upper: D / (1 - pSum) + (z * sd) / (1 - pSum),
    };
  }
  const tt = est - D;
  const K = tt > 0 ? Math.exp(z * Math.sqrt(Math.log(1 + v / (tt * tt)))) : 1;
  return { observed: D, estimate: est, se: Math.sqrt(Math.max(0, v)), lower: D + tt / K, upper: D + tt * K };
}

// ---------------------------------------------------------------------------
// Bootstrap (iNEXT's estimated-assemblage bootstrap)

/** Small, fast, seedable PRNG so bootstrap bands are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bootstrap assemblage: adjusted detection probabilities for detected species
 * plus f̂₀ equal-probability undetected species. For abundance these are
 * multinomial cell probabilities; for incidence, per-unit detection
 * probabilities (iNEXT `BootstrapFun`).
 */
export function bootstrapAssemblage(values: ArrayLike<number>, t: FreqTable): number[] {
  const xs: number[] = [];
  for (let k = 0; k < values.length; k++) if (values[k]! > 0) xs.push(values[k]!);
  const { n, U } = t;
  if (n === 0) return [];
  const f0 = f0Hat(t);
  const C = sampleCoverage(t);
  // Incidence probabilities are per unit, so the unseen mass is scaled by U/T.
  const scale = U / n;
  let lambda = 0;
  if (f0 > 0) {
    let s = 0;
    for (const x of xs) s += (x / n) * Math.pow(1 - x / n, n);
    lambda = s > 0 ? (scale * (1 - C)) / s : 0;
  }
  const p = xs.map((x) => (x / n) * (1 - lambda * Math.pow(1 - x / n, n)));
  const f0Int = Math.max(Math.round(f0), 1);
  if (f0 > 0) for (let k = 0; k < f0Int; k++) p.push((scale * (1 - C)) / f0Int);
  return p;
}

/** Draw a multinomial sample of size n from probabilities p (Walker alias). */
export function sampleMultinomial(p: readonly number[], n: number, rand: () => number): Int32Array {
  const K = p.length;
  const out = new Int32Array(K);
  if (K === 0) return out;
  let total = 0;
  for (const v of p) total += Math.max(0, v);
  const prob = new Float64Array(K);
  const alias = new Int32Array(K);
  const scaled = p.map((v) => (Math.max(0, v) / total) * K);
  const small: number[] = [];
  const large: number[] = [];
  scaled.forEach((v, idx) => (v < 1 ? small : large).push(idx));
  while (small.length && large.length) {
    const s = small.pop()!;
    const l = large.pop()!;
    prob[s] = scaled[s]!;
    alias[s] = l;
    scaled[l] = scaled[l]! + scaled[s]! - 1;
    (scaled[l]! < 1 ? small : large).push(l);
  }
  for (const idx of large) prob[idx] = 1;
  for (const idx of small) prob[idx] = 1;
  for (let d = 0; d < n; d++) {
    const u = rand() * K;
    const col = Math.floor(u);
    const hit = u - col < prob[col]! ? col : alias[col]!;
    out[hit] = out[hit]! + 1;
  }
  return out;
}

/** Binomial(n, p) by geometric skipping — O(n·min(p, 1−p)) expected. */
export function sampleBinomial(n: number, p: number, rand: () => number): number {
  if (p <= 0) return 0;
  if (p >= 1) return n;
  if (p > 0.5) return n - sampleBinomial(n, 1 - p, rand);
  const lq = Math.log(1 - p);
  let k = 0;
  let pos = 0;
  for (;;) {
    pos += Math.floor(Math.log(1 - rand()) / lq) + 1;
    if (pos > n) return k;
    k++;
  }
}

export interface CurveWithCI extends CurvePoint {
  /** lower / upper 95% bounds for qD[0..2] */
  lo: [number, number, number];
  hi: [number, number, number];
  scLo: number;
  scHi: number;
}

export interface BootstrapResult {
  curve: CurveWithCI[];
  /** Bootstrap s.e. of the asymptotic estimates for q = 0, 1, 2. */
  asySe: [number, number, number];
}

/**
 * Bootstrap ±1.96·s.e. bands around each knot, as iNEXT does (conditional on
 * the sample; bands are clamped at 0 / 1). `values` are the per-species
 * counts (abundance) or detection counts (incidence) behind `t`.
 */
export function bootstrapCI(
  values: ArrayLike<number>,
  t: FreqTable,
  curve: readonly CurvePoint[],
  B = 50,
  seed = 1,
): BootstrapResult {
  const n = t.n;
  const rand = mulberry32(seed);
  const p = bootstrapAssemblage(values, t);
  const K = curve.length;
  // Running sums for mean / variance per (knot, metric): 3 hill + 1 coverage.
  const sum = new Float64Array(K * 4);
  const sumSq = new Float64Array(K * 4);
  const asySum = [0, 0, 0];
  const asySq = [0, 0, 0];
  let reps = 0;
  if (n > 0 && p.length > 0) {
    for (let b = 0; b < B; b++) {
      let bt: FreqTable;
      if (t.type === "abundance") {
        bt = freqTable(sampleMultinomial(p, n, rand));
      } else {
        const ys = p.map((pi) => sampleBinomial(n, pi, rand));
        bt = incidenceTable(n, ys);
        if (bt.U === 0) continue;
      }
      const est = makeEstimator(bt);
      for (let k = 0; k < K; k++) {
        const m = curve[k]!.m;
        const vals = [est.hillAt(m, 0), est.hillAt(m, 1), est.hillAt(m, 2), est.coverageAt(m)];
        for (let j = 0; j < 4; j++) {
          const v = vals[j]!;
          const idx = k * 4 + j;
          sum[idx] = sum[idx]! + v;
          sumSq[idx] = sumSq[idx]! + v * v;
        }
      }
      for (const q of QS) {
        const a = hillAsymptotic(bt, q);
        asySum[q] = asySum[q]! + a;
        asySq[q] = asySq[q]! + a * a;
      }
      reps++;
    }
  }
  const z = 1.959964;
  const asySe = QS.map((q) => {
    if (reps < 2) return 0;
    const mean = asySum[q]! / reps;
    return Math.sqrt(Math.max(0, (asySq[q]! - reps * mean * mean) / (reps - 1)));
  }) as [number, number, number];
  const out = curve.map((c, k) => {
    const sd = (j: number) => {
      if (reps < 2) return 0;
      const mean = sum[k * 4 + j]! / reps;
      return Math.sqrt(Math.max(0, (sumSq[k * 4 + j]! - reps * mean * mean) / (reps - 1)));
    };
    const s = [sd(0), sd(1), sd(2)];
    const scSd = sd(3);
    return {
      ...c,
      lo: [0, 1, 2].map((j) => Math.max(0, c.qD[j]! - z * s[j]!)) as [number, number, number],
      hi: [0, 1, 2].map((j) => c.qD[j]! + z * s[j]!) as [number, number, number],
      scLo: Math.max(0, c.SC - z * scSd),
      scHi: Math.min(1, c.SC + z * scSd),
    };
  });
  return { curve: out, asySe };
}
