import {
  bootstrapCI,
  chao1,
  computeCurve,
  curveKnots,
  freqTable,
  hillAsymptotic,
  hillObserved,
  incidenceTable,
  makeEstimator,
  expectedNewSpecies,
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
    const t = freqTable(GIRDLED);
    const res = bootstrapCI(GIRDLED, t, curve, 30, 7);
    expect(res).toEqual(bootstrapCI(GIRDLED, t, curve, 30, 7));
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

// iNEXT's bundled `data(ant)$h500m` (incidence_freq: T = 230 units).
const ANT_Y = "133,131,123,78,73,65,60,60,56,54,53,52,52,49,47,46,45,44,43,42,41,39,39,38,38,38,38,37,36,34,33,32,32,31,31,30,27,26,25,25,25,24,23,21,21,20,19,18,17,17,17,17,16,16,15,14,14,13,13,13,13,12,12,12,11,11,10,10,10,10,10,9,9,9,9,9,9,9,8,8,8,8,7,7,7,7,7,7,7,7,6,6,6,6,6,6,6,6,6,6,6,5,5,5,5,5,5,5,5,5,4,4,4,4,4,4,4,4,4,4,4,4,4,4,3,3,3,3,3,3,3,3,3,3,3,3,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1"
  .split(",")
  .map(Number);

// iNEXT(ant$h500m, q=c(0,1,2), datatype="incidence_freq",
//       size=c(1,5,20,229,230,231,460), nboot=0)
const ANT_REF: Array<{ m: number; q0: number; q1: number; q2: number; sc: number }> = [
  { m: 1, q0: 12.79565, q1: 12.79565, q2: 12.79565, sc: 0.1952438 },
  { m: 5, q0: 45.69389, q1: 40.93447, q2: 35.92316, sc: 0.5453767 },
  { m: 20, q0: 98.95589, q1: 72.47643, q2: 54.33821, sc: 0.8266601 },
  { m: 229, q0: 240.6913, q1: 101.68195, q2: 64.37803, sc: 0.975875 },
  { m: 230, q0: 241, q1: 101.70557, q2: 64.38298, sc: 0.9759754 },
  { m: 231, q0: 241.30741, q1: 101.72911, q2: 64.38789, sc: 0.9760755 },
  { m: 460, q0: 286.54652, q1: 105.25143, q2: 64.95476, sc: 0.9908005 },
];

describe("iNEXT port — incidence (ant$h500m)", () => {
  const t = incidenceTable(230, ANT_Y);

  it("summarises like DataInfo(datatype='incidence_freq')", () => {
    expect(t.n).toBe(230);
    expect(t.U).toBe(2943);
    expect(t.S).toBe(241);
    expect(t.f1).toBe(71);
    expect(t.f2).toBe(34);
  });

  it("matches ChaoRichness (Chao2)", () => {
    const c = chao1(t);
    expect(c.estimate).toBeCloseTo(314.81, 2);
    expect(c.se).toBeCloseTo(23.259, 3);
    expect(c.lower).toBeCloseTo(281.384, 3);
    expect(c.upper).toBeCloseTo(375.902, 3);
  });

  it("matches the asymptotic Hill numbers (AsyEst / Diversity_profile.inc)", () => {
    expect(hillAsymptotic(t, 0)).toBeCloseTo(314.81003836, 6);
    expect(hillAsymptotic(t, 1)).toBeCloseTo(107.60154263, 6);
    // q ≥ 2: iNEXT's C++ qDFUN loses precision in the 8th digit (it returns
    // 2.49827241897583 for Σ C(Y,2)/C(T,2), exact 2.49827226124928), so we
    // assert the exact closed form, computed in R as
    // (U/T)^(q/(q-1)) * sum(choose(Y,q)/choose(T,q))^(1/(1-q)).
    // iNEXT reports 65.53677386 / 50.15745461.
    expect(hillAsymptotic(t, 2)).toBeCloseTo(65.5367779947, 8);
    expect(hillAsymptotic(t, 3)).toBeCloseTo(50.1574573614, 8);
    expect(hillObserved(t, 0.5)).toBeCloseTo(149.1082336, 6);
    expect(hillObserved(t, 3)).toBeCloseTo(49.51193765, 6);
  });

  it.each(ANT_REF)("matches rarefaction/extrapolation at t=$m", ({ m, q0, q1, q2, sc }) => {
    const est = makeEstimator(t);
    expect(est.hillAt(m, 0)).toBeCloseTo(q0, 3);
    expect(est.hillAt(m, 1)).toBeCloseTo(q1, 3);
    expect(est.hillAt(m, 2)).toBeCloseTo(q2, 3);
    expect(est.coverageAt(m)).toBeCloseTo(sc, 5);
  });

  it("bootstraps incidence data with non-trivial, reproducible bands", () => {
    const curve = computeCurve(makeEstimator(t), curveKnots(230));
    const a = bootstrapCI(ANT_Y, t, curve, 20, 3);
    expect(a).toEqual(bootstrapCI(ANT_Y, t, curve, 20, 3));
    // iNEXT's bootstrap s.e. for Chao2 here is ~21–23
    expect(a.asySe[0]).toBeGreaterThan(8);
    expect(a.asySe[0]).toBeLessThan(45);
  });
});

describe("diversity profile & helpers", () => {
  const t = freqTable(GIRDLED);
  it("matches Diversity_profile / Diversity_profile_MLE (spider$Girdled)", () => {
    expect(hillAsymptotic(t, 1)).toBeCloseTo(13.826253448, 6);
    expect(hillAsymptotic(t, 2)).toBeCloseTo(8.174825175, 6);
    expect(hillAsymptotic(t, 3)).toBeCloseTo(6.478520967, 6);
    expect(hillObserved(t, 0.5)).toBeCloseTo(17.181497358, 6);
    expect(hillObserved(t, 1.5)).toBeCloseTo(9.358789042, 6);
    expect(hillObserved(t, 3)).toBeCloseTo(6.248913336, 6);
  });

  it("expected new species grows with extra effort and is zero at zero effort", () => {
    expect(expectedNewSpecies(t, 0)).toBeCloseTo(0, 9);
    expect(expectedNewSpecies(t, 168)).toBeCloseTo(34.730733 - 26, 4);
    expect(expectedNewSpecies(t, 50)).toBeLessThan(expectedNewSpecies(t, 100));
  });
});
