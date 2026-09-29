/// <reference lib="webworker" />
/**
 * Only ever loaded via `new Worker(...)` — import *types* from here, never
 * values, or this module's onmessage handler would install on the page.
 *
 * Runs iNEXT curves off the main thread. Replies twice per request: first
 * with point estimates (fast, ~tens of ms), then with bootstrap bands.
 */
import {
  PROFILE_QS,
  QS,
  bootstrapCI,
  chao1,
  computeCurve,
  curveKnots,
  freqTable,
  hillAsymptotic,
  hillObserved,
  incidenceTable,
  makeEstimator,
  sampleCoverage,
  type Chao1,
  type CurvePoint,
  type CurveWithCI,
  type DataType,
} from "./inext";

export interface InextGroupInput {
  key: string;
  label: string;
  type: DataType;
  /** Records per species (abundance) or units detected per species (incidence). */
  counts: Int32Array;
  /** Number of sampling units (incidence only). */
  T?: number;
}

export interface InextRequest {
  id: number;
  groups: InextGroupInput[];
  /** Bootstrap replicates; 0 disables bands. */
  B: number;
  /** Extrapolate every group to this sample size (iNEXT `endpoint`). */
  endpoint: number | null;
}

export interface InextGroupResult {
  key: string;
  label: string;
  type: DataType;
  /** Sample size: records (abundance) or sampling units T (incidence). */
  n: number;
  /** Total incidences (incidence) — equals n for abundance. */
  U: number;
  S: number;
  f1: number;
  f2: number;
  coverage: number;
  chao1: Chao1;
  observed: [number, number, number];
  asymptotic: [number, number, number];
  /** Bootstrap s.e. of `asymptotic`; null until the CI phase. */
  asySe: [number, number, number] | null;
  /** Observed Hill numbers at PROFILE_QS. */
  profileObserved: number[];
  /** Estimated (asymptotic) Hill numbers at q = 0, 1, 2, 3. */
  profileEstimated: [number, number, number, number];
  curve: Array<CurvePoint | CurveWithCI>;
}

export interface InextResponse {
  id: number;
  phase: "point" | "ci";
  groups: InextGroupResult[];
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<InextRequest>) => {
  const { id, groups, B, endpoint } = e.data;
  const tables = groups.map((g) =>
    g.type === "incidence" ? incidenceTable(g.T ?? 0, g.counts) : freqTable(g.counts),
  );
  const point: InextGroupResult[] = groups.map((g, k) => {
    const t = tables[k]!;
    const est = makeEstimator(t);
    const curve = computeCurve(est, curveKnots(t.n, endpoint ?? 2 * t.n));
    return {
      key: g.key,
      label: g.label,
      type: g.type,
      n: t.n,
      U: t.U,
      S: t.S,
      f1: t.f1,
      f2: t.f2,
      coverage: sampleCoverage(t),
      chao1: chao1(t),
      observed: QS.map((q) => hillObserved(t, q)) as [number, number, number],
      asymptotic: QS.map((q) => hillAsymptotic(t, q)) as [number, number, number],
      asySe: null,
      profileObserved: PROFILE_QS.map((q) => hillObserved(t, q)),
      profileEstimated: [0, 1, 2, 3].map((q) => hillAsymptotic(t, q)) as [number, number, number, number],
      curve,
    };
  });
  ctx.postMessage({ id, phase: "point", groups: point } satisfies InextResponse);
  if (B <= 0) return;

  const withCi = point.map((p, k) => {
    const res = bootstrapCI(groups[k]!.counts, tables[k]!, p.curve, B, 20260929 + k);
    return { ...p, curve: res.curve, asySe: res.asySe };
  });
  ctx.postMessage({ id, phase: "ci", groups: withCi } satisfies InextResponse);
};
