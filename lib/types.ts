/**
 * Schema for the slim record array shipped at /public/data/records.json.
 *
 * Each record is encoded as a positional tuple (smaller payload than an
 * object-per-row). Indices match `dictionaries.schema`:
 *
 *   0: order id          (lookup → dictionaries.order)
 *   1: family id         (lookup → dictionaries.family)
 *   2: genus id          (lookup → dictionaries.genus)
 *   3: county id         (lookup → dictionaries.county; 0 = unknown)
 *   4: basisOfRecord id  (lookup → dictionaries.basisOfRecord)
 *   5: year              (number | null)
 *   6: month             (1–12 | null)
 *   7: species id        (lookup → dictionaries.species; 0 = unknown)
 *   8: lat               (number | null)
 *   9: lon               (number | null)
 */
export type RecordTuple = [
  number, // orderId
  number, // familyId
  number, // genusId
  number, // countyId
  number, // basisId
  number | null, // year
  number | null, // month
  number, // speciesId
  number | null, // lat
  number | null, // lon
];

export interface Dictionaries {
  order: string[];
  family: string[];
  genus: string[];
  county: string[];
  basisOfRecord: string[];
  species: string[];
  /** GBIF speciesKey aligned with `species` array (parallel arrays). */
  speciesKey: number[];
  schema: string[];
}

export interface Precomputed {
  totalRecords: number;
  uniqueSpecies: number;
  uniqueFamilies: number;
  uniqueCountiesObserved: number;
  shannonDiversityUnfiltered: number;
  yearObservedMin: number;
  yearObservedMax: number;
  yearFilterFloor: number;
  yearFilterCeil: number;
  totalCountiesInIndiana: number;
  recordsWithoutCounty: number;
  recordsWithoutYear: number;
  recordsWithoutMonth: number;
  recordsWithoutSpecies: number;
  recordsOutOfBboxCoords: number;
  recordsYearOutOfRange: number;
}

/** Field index in a RecordTuple (named for readability in chart code). */
export const FIELD = {
  ORDER: 0,
  FAMILY: 1,
  GENUS: 2,
  COUNTY: 3,
  BASIS: 4,
  YEAR: 5,
  MONTH: 6,
  SPECIES: 7,
  LAT: 8,
  LON: 9,
} as const;
