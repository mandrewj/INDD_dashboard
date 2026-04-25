"""Build static data bundle for the INDD dashboard.

Reads ./data/IN_data.txt (GBIF Darwin Core occurrence TSV) and writes:

  public/data/records.json       slim per-record table, dictionary-encoded
  public/data/dictionaries.json  id↔name lookups for orders/families/genera/counties/species
  public/data/precomputed.json   KPIs and unfiltered totals
  public/data/in-counties.geojson  (produced separately by build_counties_geojson.py)

Decisions reflected here (confirmed with user):
  - County is derived from decimalLatitude/Longitude via point-in-polygon
    against in-counties.geojson; coords missing or outside any IN polygon
    map to county=null ("Unknown county" bucket in the UI).
  - speciesKey is the canonical species identity. Display label is `species`
    text; falls back to `scientificName` only when species is null.
  - year/month/day come from the integer columns; eventDate ignored.
  - Year filter range floor is 1880 (records older than that are kept but
    flagged in the "Out-of-range year" bucket).
  - basisOfRecord is exposed as a categorical filter (replaces the original
    habitat/method ask, which has no source column).
  - Coords outside the Indiana bbox lat∈[37.7,41.85], lon∈[-88.15,-84.75]
    are not used for the choropleth (county=null) but the record itself
    is kept.
"""

from __future__ import annotations

import json
import math
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import pandas as pd
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
TSV = ROOT / "data" / "IN_data.txt"
GEOJSON = ROOT / "public" / "data" / "in-counties.geojson"
OUT_DIR = ROOT / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

YEAR_MIN_FLOOR = 1880
YEAR_MAX_CEIL = 2026
IN_BBOX = (-88.15, 37.7, -84.75, 41.85)  # (minLon, minLat, maxLon, maxLat)


def in_bbox(lon: float, lat: float) -> bool:
    return IN_BBOX[0] <= lon <= IN_BBOX[2] and IN_BBOX[1] <= lat <= IN_BBOX[3]


def load_county_index() -> tuple[STRtree, list[Any], list[str]]:
    gj = json.loads(GEOJSON.read_text())
    polys = []
    names = []
    for feat in gj["features"]:
        polys.append(shape(feat["geometry"]))
        names.append(feat["properties"]["name"])
    tree = STRtree(polys)
    return tree, polys, names


def encode_dict(values: list[str | None]) -> tuple[dict[str | None, int], list[str]]:
    """Return (label→id, id→label). id 0 is reserved for None / NaN / "" / Unknown.

    pandas hands us NaN (a float) for missing string cells; checks must include
    pd.isna() — `v is not None` is True for NaN.
    """
    counter: Counter[str] = Counter()
    for v in values:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        if not isinstance(v, str) or v == "":
            continue
        counter[v] += 1
    ordered: list[str] = ["__UNKNOWN__"] + [v for v, _ in counter.most_common()]
    label_to_id: dict[str | None, int] = {None: 0, "": 0, "__UNKNOWN__": 0}
    for i, v in enumerate(ordered):
        label_to_id[v] = i
    return label_to_id, ordered


def main() -> None:
    t0 = time.time()
    print(f"Loading {TSV} …")
    df = pd.read_csv(
        TSV,
        sep="\t",
        dtype=str,
        keep_default_na=False,
        na_values=[""],
        low_memory=False,
        on_bad_lines="warn",
    )
    print(f"  {len(df):,} rows in {time.time()-t0:.1f}s")

    # Numeric coercions
    for c in ["year", "month", "day"]:
        df[c] = pd.to_numeric(df[c], errors="coerce").astype("Int64")
    for c in ["decimalLatitude", "decimalLongitude"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    # County derivation -------------------------------------------------------
    print("Building county spatial index …")
    tree, polys, county_names = load_county_index()
    counties: list[str | None] = [None] * len(df)

    lats = df["decimalLatitude"].to_numpy()
    lons = df["decimalLongitude"].to_numpy()

    print("Point-in-polygon for geocoded rows …")
    t1 = time.time()
    n_resolved = 0
    n_oob = 0
    for i in range(len(df)):
        lat = lats[i]
        lon = lons[i]
        if pd.isna(lat) or pd.isna(lon):
            continue
        if not in_bbox(lon, lat):
            n_oob += 1
            continue
        pt = Point(lon, lat)
        # STRtree.query returns indices of candidate polys (bbox match)
        candidates = tree.query(pt)
        for idx in candidates:
            if polys[int(idx)].covers(pt):
                counties[i] = county_names[int(idx)]
                n_resolved += 1
                break
    print(f"  Resolved {n_resolved:,} of {len(df):,} rows to a county "
          f"({100*n_resolved/len(df):.1f}%) in {time.time()-t1:.1f}s")
    print(f"  Out-of-IN-bbox coords: {n_oob:,}")

    # Canonical species identity ---------------------------------------------
    # speciesKey when present; otherwise None (UNKNOWN bucket).
    species_key_series = pd.to_numeric(df["speciesKey"], errors="coerce").astype("Int64")

    # Display label per speciesKey: prefer `species` text, fallback to `scientificName`.
    species_label: dict[int, str] = {}
    for sk, sp, sn in zip(
        species_key_series.tolist(),
        df["species"].fillna("").tolist(),
        df["scientificName"].fillna("").tolist(),
    ):
        if pd.isna(sk):
            continue
        sk_int = int(sk)
        if sk_int in species_label:
            continue
        species_label[sk_int] = sp if sp else (sn if sn else f"speciesKey:{sk_int}")

    # Dictionary encoding -----------------------------------------------------
    print("Dictionary-encoding categorical fields …")
    order_map, order_labels = encode_dict(df["order"].tolist())
    family_map, family_labels = encode_dict(df["family"].tolist())
    genus_map, genus_labels = encode_dict(df["genus"].tolist())
    county_map, county_labels = encode_dict(counties)
    basis_map, basis_labels = encode_dict(df["basisOfRecord"].tolist())

    # Species: id 0 = unknown; otherwise stable id ordered by frequency.
    sk_counter: Counter[int] = Counter()
    for sk in species_key_series.tolist():
        if not pd.isna(sk):
            sk_counter[int(sk)] += 1
    ordered_sks = [sk for sk, _ in sk_counter.most_common()]
    sk_to_id = {sk: i + 1 for i, sk in enumerate(ordered_sks)}
    species_dict_labels = ["__UNKNOWN__"] + [species_label.get(sk, f"speciesKey:{sk}") for sk in ordered_sks]
    species_dict_keys = [0] + ordered_sks  # parallel to species_dict_labels

    # Slim records ------------------------------------------------------------
    print("Building slim record array …")
    orders = df["order"].tolist()
    families = df["family"].tolist()
    genera = df["genus"].tolist()
    bases = df["basisOfRecord"].tolist()
    years = df["year"].tolist()
    months = df["month"].tolist()
    sks = species_key_series.tolist()
    lats_l = lats.tolist()
    lons_l = lons.tolist()

    records: list[list[Any]] = []
    n_year_oor = 0
    for i in range(len(df)):
        y = years[i]
        if pd.isna(y):
            year_v: int | None = None
        else:
            yi = int(y)
            if yi < YEAR_MIN_FLOOR or yi > YEAR_MAX_CEIL:
                n_year_oor += 1
                year_v = None
            else:
                year_v = yi
        m = months[i]
        month_v = int(m) if not pd.isna(m) and 1 <= int(m) <= 12 else None

        sk = sks[i]
        sp_id = sk_to_id[int(sk)] if not pd.isna(sk) and int(sk) in sk_to_id else 0

        lat = lats_l[i]
        lon = lons_l[i]
        lat_v = round(lat, 4) if not pd.isna(lat) else None
        lon_v = round(lon, 4) if not pd.isna(lon) else None

        # [order, family, genus, county, basis, year, month, species, lat, lon]
        records.append([
            order_map.get(orders[i], 0),
            family_map.get(families[i], 0),
            genus_map.get(genera[i], 0),
            county_map.get(counties[i], 0),
            basis_map.get(bases[i], 0),
            year_v,
            month_v,
            sp_id,
            lat_v,
            lon_v,
        ])
    print(f"  Year-out-of-range (clamped to null): {n_year_oor:,}")

    # Precomputed unfiltered KPIs --------------------------------------------
    print("Computing unfiltered KPIs …")
    valid_year_records = [r for r in records if r[5] is not None]
    year_min = min((r[5] for r in valid_year_records), default=YEAR_MIN_FLOOR)
    year_max = max((r[5] for r in valid_year_records), default=YEAR_MAX_CEIL)

    species_set_unfiltered = {r[7] for r in records if r[7] != 0}
    family_set_unfiltered = {r[1] for r in records if r[1] != 0}
    county_set_unfiltered = {r[3] for r in records if r[3] != 0}

    # Shannon diversity (unfiltered) — at species level
    sp_counts: dict[int, int] = defaultdict(int)
    for r in records:
        if r[7] != 0:
            sp_counts[r[7]] += 1
    total_sp = sum(sp_counts.values())
    shannon = 0.0
    if total_sp > 0:
        for n in sp_counts.values():
            p = n / total_sp
            shannon -= p * math.log(p)

    precomputed = {
        "totalRecords": len(records),
        "uniqueSpecies": len(species_set_unfiltered),
        "uniqueFamilies": len(family_set_unfiltered),
        "uniqueCountiesObserved": len(county_set_unfiltered),
        "shannonDiversityUnfiltered": round(shannon, 6),
        "yearObservedMin": int(year_min),
        "yearObservedMax": int(year_max),
        "yearFilterFloor": YEAR_MIN_FLOOR,
        "yearFilterCeil": YEAR_MAX_CEIL,
        "totalCountiesInIndiana": len(county_labels) - 1,
        "recordsWithoutCounty": sum(1 for r in records if r[3] == 0),
        "recordsWithoutYear": sum(1 for r in records if r[5] is None),
        "recordsWithoutMonth": sum(1 for r in records if r[6] is None),
        "recordsWithoutSpecies": sum(1 for r in records if r[7] == 0),
        "recordsOutOfBboxCoords": n_oob,
        "recordsYearOutOfRange": n_year_oor,
    }

    # Write outputs -----------------------------------------------------------
    print("Writing JSON …")

    dictionaries = {
        "order": order_labels,
        "family": family_labels,
        "genus": genus_labels,
        "county": county_labels,
        "basisOfRecord": basis_labels,
        "species": species_dict_labels,
        "speciesKey": species_dict_keys,
        "schema": [
            "order", "family", "genus", "county",
            "basisOfRecord", "year", "month", "species",
            "lat", "lon",
        ],
    }

    (OUT_DIR / "dictionaries.json").write_text(
        json.dumps(dictionaries, separators=(",", ":"), allow_nan=False)
    )
    (OUT_DIR / "precomputed.json").write_text(
        json.dumps(precomputed, separators=(",", ":"), indent=2, allow_nan=False)
    )
    (OUT_DIR / "records.json").write_text(
        json.dumps({"records": records}, separators=(",", ":"), allow_nan=False)
    )

    # Stats --------------------------------------------------------------------
    print()
    print("=== OUTPUT SIZES ===")
    for f in ["records.json", "dictionaries.json", "precomputed.json", "in-counties.geojson"]:
        p = OUT_DIR / f
        if p.exists():
            print(f"  {f:<28} {p.stat().st_size:>12,} bytes")
    print()
    print(f"Total time: {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
