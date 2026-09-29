/// <reference lib="webworker" />
/**
 * Runs iNEXT curves off the main thread. Replies twice per request: first
 * with point estimates (fast, ~tens of ms), then with bootstrap bands.
 */
import {
  QS,
  bootstrapCI,
  chao1,
  computeCurve,
  curveKnots,
  hillAsymptotic,
  hillObserved,
  makeEstimator,
  sampleCoverage,
  type Chao1,
  type CurvePoint,
  type CurveWithCI,
} from "./inext";

export interface InextGroupInput {
  key: string;
  label: string;
  counts: Int32Array;
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
  n: number;
  S: number;
  f1: number;
  f2: number;
  coverage: number;
  chao1: Chao1;
  observed: [number, number, number];
  asymptotic: [number, number, number];
  /** Bootstrap s.e. of `asymptotic`; null until the CI phase. */
  asySe: [number, number, number] | null;
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
  const point: InextGroupResult[] = groups.map((g) => {
    const est = makeEstimator(g.counts);
    const t = est.t;
    const curve = computeCurve(est, curveKnots(t.n, endpoint ?? 2 * t.n));
    return {
      key: g.key,
      label: g.label,
      n: t.n,
      S: t.S,
      f1: t.f1,
      f2: t.f2,
      coverage: sampleCoverage(t),
      chao1: chao1(t),
      observed: QS.map((q) => hillObserved(t, q)) as [number, number, number],
      asymptotic: QS.map((q) => hillAsymptotic(t, q)) as [number, number, number],
      asySe: null,
      curve,
    };
  });
  ctx.postMessage({ id, phase: "point", groups: point } satisfies InextResponse);
  if (B <= 0) return;

  const withCi = point.map((p, k) => {
    const res = bootstrapCI(groups[k]!.counts, p.curve, B, 20260929 + k);
    return { ...p, curve: res.curve, asySe: res.asySe };
  });
  ctx.postMessage({ id, phase: "ci", groups: withCi } satisfies InextResponse);
};
