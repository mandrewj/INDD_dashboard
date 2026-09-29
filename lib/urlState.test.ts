import { filtersToParams, parseFilterParams } from "./urlState";
import type { Dictionaries, RecordTuple } from "./types";

const dict: Dictionaries = {
  order: ["__UNKNOWN__", "Lepidoptera", "Coleoptera"],
  family: ["__UNKNOWN__", "Nymphalidae", "Carabidae"],
  genus: ["__UNKNOWN__", "Danaus", "Cicindela"],
  county: ["__UNKNOWN__", "Tippecanoe", "Marion", "St. Joseph"],
  basisOfRecord: ["__UNKNOWN__", "HUMAN_OBSERVATION"],
  species: ["__UNKNOWN__", "Danaus plexippus", "Cicindela sexguttata"],
  speciesKey: [0, 5133088, 1035185],
  schema: [],
};

// [order, family, genus, county, basis, year, month, species, lat, lon]
const records: RecordTuple[] = [
  [1, 1, 1, 1, 1, 2020, 7, 1, null, null],
  [2, 2, 2, 2, 1, 2019, 5, 2, null, null],
];

const parse = (qs: string) => parseFilterParams(new URLSearchParams(qs), dict, records, 1880, 2026);

describe("parseFilterParams", () => {
  it("returns defaults for an empty query", () => {
    const f = parse("");
    expect(f).toMatchObject({ orderId: null, familyId: null, countyId: null, yearMin: 1880, yearMax: 2026 });
  });

  it("resolves a generic taxon at any rank and fills parents", () => {
    expect(parse("taxon=Carabidae")).toMatchObject({ orderId: 2, familyId: 2, genusId: null, speciesId: null });
    expect(parse("taxon=danaus_plexippus")).toMatchObject({ orderId: 1, familyId: 1, genusId: 1, speciesId: 1 });
    expect(parse("taxon=Lepidoptera")).toMatchObject({ orderId: 1, familyId: null });
  });

  it("accepts explicit rank params, case-insensitively", () => {
    expect(parse("genus=cicindela")).toMatchObject({ orderId: 2, familyId: 2, genusId: 2 });
  });

  it("resolves counties by name, with or without 'County', plus 'unknown'", () => {
    expect(parse("county=tippecanoe").countyId).toBe(1);
    expect(parse("county=St.+Joseph+County").countyId).toBe(3);
    expect(parse("county=unknown").countyId).toBe(0);
    expect(parse("county=Atlantis").countyId).toBeNull();
  });

  it("clamps and orders years; honours noyear=0", () => {
    expect(parse("from=2030&to=1990")).toMatchObject({ yearMin: 1990, yearMax: 2026 });
    expect(parse("noyear=0").includeNullYear).toBe(false);
  });

  it("ignores unknown names instead of failing", () => {
    expect(parse("taxon=Notaninsect")).toMatchObject({ orderId: null, speciesId: null });
  });
});

describe("filtersToParams round-trip", () => {
  it.each([
    "taxon=Danaus+plexippus&county=Tippecanoe",
    "taxon=Carabidae&from=2000",
    "county=unknown&noyear=0",
    "",
  ])("%s", (qs) => {
    const f = parse(qs);
    expect(filtersToParams(f, dict, 1880, 2026).toString()).toBe(qs);
  });
});
