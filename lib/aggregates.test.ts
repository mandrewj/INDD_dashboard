import { countyRow, countySpeciesMatrix, richness } from "./aggregates";
import { speciesAbundances } from "./diversity";
import { getTaxonIndex, optionsFor } from "./taxonIndex";
import type { Dictionaries, RecordTuple } from "./types";

// [order, family, genus, county, basis, year, month, species, lat, lon]
const R: RecordTuple[] = [
  [1, 1, 1, 1, 1, 2020, 6, 1, null, null],
  [1, 1, 1, 1, 1, 2021, 7, 1, null, null],
  [1, 1, 2, 2, 1, 2021, 7, 2, null, null],
  [2, 2, 3, 2, 2, 1990, 5, 3, null, null],
  [2, 2, 3, 0, 2, 1990, 5, 3, null, null], // no county
  [2, 2, 3, 0, 2, null, null, 0, null, null], // not identified to species
];

const D: Dictionaries = {
  order: ["__UNKNOWN__", "Lepidoptera", "Coleoptera"],
  family: ["__UNKNOWN__", "Nymphalidae", "Carabidae"],
  genus: ["__UNKNOWN__", "Danaus", "Vanessa", "Cicindela"],
  county: ["__UNKNOWN__", "Tippecanoe", "Marion"],
  basisOfRecord: ["__UNKNOWN__", "HUMAN_OBSERVATION", "PRESERVED_SPECIMEN"],
  species: ["__UNKNOWN__", "Danaus plexippus", "Vanessa atalanta", "Cicindela sexguttata"],
  speciesKey: [0, 1, 2, 3],
  schema: [],
};

describe("countySpeciesMatrix", () => {
  const m = countySpeciesMatrix(R, D.county.length, D.species.length);

  it("counts identified records per county × species", () => {
    expect([...countyRow(m, 1)]).toEqual([0, 2, 0, 0]);
    expect([...countyRow(m, 2)]).toEqual([0, 0, 1, 1]);
    expect(richness(countyRow(m, 2))).toBe(2);
  });

  it("tracks all records per county, pooled mapped abundances, and unmapped species", () => {
    expect([...m.records]).toEqual([2, 2, 2]);
    expect([...m.pooled]).toEqual([0, 2, 1, 1]);
    expect(m.unmappedSpecies).toBe(1);
  });

  it("is cached by array identity", () => {
    expect(countySpeciesMatrix(R, D.county.length, D.species.length)).toBe(m);
    expect(countySpeciesMatrix([...R], D.county.length, D.species.length)).not.toBe(m);
  });
});

describe("speciesAbundances cache", () => {
  it("returns the same vector for the same array and counts correctly", () => {
    const a = speciesAbundances(R, D.species.length);
    expect(speciesAbundances(R, D.species.length)).toBe(a);
    expect([...a]).toEqual([0, 2, 1, 2]);
  });
});

describe("getTaxonIndex", () => {
  const idx = getTaxonIndex(R, D);

  it("builds the taxon cascade", () => {
    expect(idx.familiesByOrder.get(1)).toEqual([1]);
    expect(idx.generaByFamily.get(1)?.sort()).toEqual([1, 2]);
    expect(idx.generaByOrder.get(2)).toEqual([3]);
    expect(idx.speciesByGenus.get(3)).toEqual([3]);
  });

  it("counts records per id and sorts ids by label", () => {
    expect(idx.counts.county[0]).toBe(2);
    expect(idx.sorted.genus.map((g) => D.genus[g])).toEqual(["Cicindela", "Danaus", "Vanessa"]);
  });

  it("builds option lists restricted to allowed ids", () => {
    const opts = optionsFor(idx.sorted.genus, D.genus, idx.counts.genus, new Set([1, 2]));
    expect(opts).toEqual([
      { id: 1, label: "Danaus", count: 2 },
      { id: 2, label: "Vanessa", count: 1 },
    ]);
  });
});
