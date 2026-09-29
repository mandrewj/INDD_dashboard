import {
  bootstrapCI,
  chao1,
  computeCurve,
  curveKnots,
  freqTable,
  hillAsymptotic,
  hillObserved,
  makeEstimator,
  sampleCoverage,
} from "./inext";

// iNEXT's bundled `data(spider)$Girdled`. Reference values below were
// produced by iNEXT 3.0.2 in R:
//   iNEXT(x, q=c(0,1,2), datatype="abundance",
//         size=c(1,10,50,100,168,200,336), nboot=0)
const GIRDLED = [46, 22, 17, 15, 15, 9, 8, 6, 6, 4, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

const REF: Array<{ m: number; q0: number; q1: number; q2: number; sc: number }> = [
  { m: 1, q0: 1.0, q1: 1.0, q2: 1.0, sc: 0.1223268 },
  { m: 10, q0: 6.478617, q1: 5.608968, q2: 4.759772, sc: 0.5969308 },
  { m: 50, q0: 15.030098, q1: 9.939329, q2: 7.148973, sc: 0.8674807 },
  { m: 100, q0: 20.459426, q1: 11.266546, q2: 7.627561, sc: 0.9072004 },
  { m: 167, q0: 25.928571, q1: 12.051422, q2: 7.838078, sc: 0.9285714 },
  { m: 168, q0: 26.0, q1: 12.05965, q2: 7.84, sc: 0.9288554 },
  { m: 169, q0: 26.071145, q1: 12.06784, q2: 7.841901, sc: 0.9291383 },
  { m: 200, q0: 28.141739, q1: 12.303742, q2: 7.891717, sc: 0.9373713 },
  { m: 336, q0: 34.730733, q1: 13.016966, q2: 8.003912, sc: 0.9635701 },
];

describe("iNEXT port — spider$Girdled", () => {
  const t = freqTable(GIRDLED);

  it("summarises the sample like iNEXT::DataInfo", () => {
    expect(t.n).toBe(168);
    expect(t.S).toBe(26);
    expect(t.f1).toBe(12);
    expect(t.f2).toBe(4);
    expect(sampleCoverage(t)).toBeCloseTo(0.9289, 4);
  });

  it("matches ChaoRichness (estimate, s.e., 95% CI)", () => {
    const c = chao1(t);
    expect(c.estimate).toBeCloseTo(43.893, 3);
    expect(c.se).toBeCloseTo(14.306, 3);
    expect(c.lower).toBeCloseTo(30.511, 3);
    expect(c.upper).toBeCloseTo(96.971, 3);
  });

  it("matches ChaoShannon / ChaoSimpson asymptotic estimates", () => {
    expect(Math.log(hillObserved(t, 1))).toBeCloseTo(2.49, 2);
    expect(Math.log(hillAsymptotic(t, 1))).toBeCloseTo(2.627, 3);
    // ChaoSimpson reports Gini–Simpson 1 − 1/²D
    expect(1 - 1 / hillAsymptotic(t, 2)).toBeCloseTo(0.878, 3);
  });

  it.each(REF)("matches rarefaction/extrapolation at m=$m", ({ m, q0, q1, q2, sc }) => {
    const est = makeEstimator(t);
    expect(est.hillAt(m, 0)).toBeCloseTo(q0, 4);
    expect(est.hillAt(m, 1)).toBeCloseTo(q1, 4);
    expect(est.hillAt(m, 2)).toBeCloseTo(q2, 4);
    expect(est.coverageAt(m)).toBeCloseTo(sc, 5);
  });
});

describe("curve helpers", () => {
  it("knots include 1, n, and reach the endpoint in ascending order", () => {
    const ks = curveKnots(168);
    expect(ks[0]).toBe(1);
    expect(ks).toContain(168);
    expect(ks[ks.length - 1]).toBe(336);
    for (let k = 1; k < ks.length; k++) expect(ks[k]!).toBeGreaterThan(ks[k - 1]!);
  });

  it("curves are monotone non-decreasing in m for q=0 and coverage", () => {
    const curve = computeCurve(makeEstimator(GIRDLED), curveKnots(168));
    for (let k = 1; k < curve.length; k++) {
      expect(curve[k]!.qD[0]).toBeGreaterThanOrEqual(curve[k - 1]!.qD[0] - 1e-9);
      expect(curve[k]!.SC).toBeGreaterThanOrEqual(curve[k - 1]!.SC - 1e-9);
    }
  });

  it("bootstrap bands bracket the point estimate and are reproducible", () => {
    const curve = computeCurve(makeEstimator(GIRDLED), curveKnots(168));
    const res = bootstrapCI(GIRDLED, curve, 30, 7);
    expect(res).toEqual(bootstrapCI(GIRDLED, curve, 30, 7));
    const a = res.curve;
    // iNEXT's bootstrap s.e. for Chao1 on this sample is ~14 (analytic 14.3)
    expect(res.asySe[0]).toBeGreaterThan(3);
    for (const p of a) {
      for (const q of [0, 1, 2] as const) {
        expect(p.lo[q]).toBeLessThanOrEqual(p.qD[q] + 1e-9);
        expect(p.hi[q]).toBeGreaterThanOrEqual(p.qD[q] - 1e-9);
      }
    }
    // Observed-point richness band should have non-trivial width
    const obs = a.find((p) => p.method === "Observed")!;
    expect(obs.hi[0] - obs.lo[0]).toBeGreaterThan(1);
  });

  it("handles degenerate samples without NaN", () => {
    for (const counts of [[], [5], [1], [1, 1, 1], [3, 3]]) {
      const est = makeEstimator(counts);
      const n = est.t.n;
      for (const m of [1, Math.max(1, n), 2 * Math.max(1, n)]) {
        for (const q of [0, 1, 2] as const) {
          expect(Number.isNaN(est.hillAt(m, q))).toBe(false);
        }
        expect(Number.isNaN(est.coverageAt(m))).toBe(false);
      }
      expect(Number.isNaN(chao1(freqTable(counts)).estimate)).toBe(false);
    }
  });
});
