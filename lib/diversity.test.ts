import {
  pielouEvenness,
  shannonForRecords,
  shannonFromCounts,
} from "./diversity";
import type { RecordTuple } from "./types";

// Build a minimal RecordTuple where only the species slot matters.
function rec(speciesId: number): RecordTuple {
  return [0, 0, 0, 0, 0, 2000, 6, speciesId, null, null];
}

describe("shannonFromCounts", () => {
  it("returns 0 for empty input", () => {
    expect(shannonFromCounts([])).toBe(0);
  });

  it("returns 0 for a single species (perfectly uneven)", () => {
    expect(shannonFromCounts([42])).toBe(0);
  });

  it("returns ln(S) for an even distribution across S species", () => {
    // 3 species, equal counts → H' = ln(3)
    const h = shannonFromCounts([10, 10, 10]);
    expect(h).toBeCloseTo(Math.log(3), 10);
  });

  it("matches a hand-computed value for an uneven distribution", () => {
    // counts [2, 2, 1] → p = [0.4, 0.4, 0.2]
    // H' = -[0.4 ln 0.4 + 0.4 ln 0.4 + 0.2 ln 0.2]
    const expected =
      -(0.4 * Math.log(0.4) + 0.4 * Math.log(0.4) + 0.2 * Math.log(0.2));
    expect(shannonFromCounts([2, 2, 1])).toBeCloseTo(expected, 10);
  });

  it("ignores zero counts", () => {
    expect(shannonFromCounts([0, 0, 5])).toBe(0);
    expect(shannonFromCounts([3, 0, 3])).toBeCloseTo(Math.log(2), 10);
  });
});

describe("shannonForRecords", () => {
  it("excludes unidentified records (species id 0)", () => {
    const records: RecordTuple[] = [rec(0), rec(0), rec(0)];
    expect(shannonForRecords(records)).toBe(0);
  });

  it("computes correctly when mixing identified and unidentified", () => {
    const records: RecordTuple[] = [
      rec(0), // ignored
      rec(1),
      rec(1),
      rec(2),
      rec(2),
    ];
    expect(shannonForRecords(records)).toBeCloseTo(Math.log(2), 10);
  });

  it("returns 0 for an empty array", () => {
    expect(shannonForRecords([])).toBe(0);
  });
});

describe("pielouEvenness", () => {
  it("is NaN when S < 2", () => {
    expect(Number.isNaN(pielouEvenness(0, 0))).toBe(true);
    expect(Number.isNaN(pielouEvenness(0, 1))).toBe(true);
  });

  it("is 1 for a perfectly even distribution", () => {
    const h = shannonFromCounts([5, 5, 5, 5]);
    expect(pielouEvenness(h, 4)).toBeCloseTo(1, 10);
  });

  it("is < 1 for an uneven distribution", () => {
    const h = shannonFromCounts([10, 1, 1]);
    expect(pielouEvenness(h, 3)).toBeLessThan(1);
  });
});
