"""Profile the IN_data.txt TSV: schema, dtypes, nulls, cardinality, value samples, ranges."""
import pandas as pd
import sys
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "data" / "IN_data.txt"

# Detect BOM
with open(PATH, "rb") as f:
    head_bytes = f.read(4)
print(f"File size: {PATH.stat().st_size:,} bytes")
print(f"Leading bytes (hex): {head_bytes.hex()}")
print(f"Has UTF-8 BOM: {head_bytes.startswith(b'\\xef\\xbb\\xbf')}")
print()

# Read everything as string first to inspect rawly, then re-infer.
df = pd.read_csv(
    PATH,
    sep="\t",
    dtype=str,
    keep_default_na=False,
    na_values=[""],
    low_memory=False,
    on_bad_lines="warn",
)

print(f"Rows: {len(df):,}")
print(f"Columns: {len(df.columns)}")
print()

print("=== COLUMN PROFILE ===")
print(f"{'col':<35} {'nonnull':>10} {'null%':>7} {'nunique':>10}  sample")
print("-" * 110)
for c in df.columns:
    s = df[c]
    n_nonnull = s.notna().sum()
    null_pct = 100 * (1 - n_nonnull / len(df))
    nunique = s.nunique(dropna=True)
    samp = s.dropna().head(3).tolist()
    samp_str = " | ".join(str(x)[:40] for x in samp)
    print(f"{c:<35} {n_nonnull:>10,} {null_pct:>6.1f}% {nunique:>10,}  {samp_str}")

print()
print("=== KEY CATEGORICAL VALUE COUNTS ===")
for c in ["kingdom", "phylum", "class", "order", "basisOfRecord", "occurrenceStatus", "taxonRank", "stateProvince", "countryCode"]:
    if c in df.columns:
        print(f"\n--- {c} (top 15) ---")
        print(df[c].value_counts(dropna=False).head(15).to_string())

print()
print("=== NUMERIC / DATE RANGES ===")
for c in ["year", "month", "day", "decimalLatitude", "decimalLongitude", "individualCount", "elevation", "depth", "coordinateUncertaintyInMeters"]:
    if c in df.columns:
        s = pd.to_numeric(df[c], errors="coerce")
        print(f"{c:<35} min={s.min()}  max={s.max()}  mean={s.mean():.3f}  nonnull={s.notna().sum():,}")

print()
print("=== DATE COLUMNS ===")
for c in ["eventDate", "dateIdentified", "lastInterpreted"]:
    if c in df.columns:
        s = pd.to_datetime(df[c], errors="coerce", utc=True)
        print(f"{c:<35} min={s.min()}  max={s.max()}  nonnull={s.notna().sum():,}")

print()
print("=== COUNTY-LIKE COLUMNS ===")
# locality field varies wildly. Look for any explicit county column.
print("Columns containing 'count' or 'county':", [c for c in df.columns if "count" in c.lower()])
print()
print("locality null%:", 100*(df['locality'].isna().sum()/len(df)))
print("locality nunique:", df['locality'].nunique())
print("locality top 20:")
print(df['locality'].value_counts(dropna=True).head(20).to_string())

print()
print("=== HABITAT / METHOD COLUMNS ===")
for c in df.columns:
    if any(k in c.lower() for k in ["habitat", "method", "sampling", "protocol"]):
        print(f"  {c}")

print()
print("=== UNIQUE TAXA COUNTS ===")
print(f"unique order:    {df['order'].nunique():,}")
print(f"unique family:   {df['family'].nunique():,}")
print(f"unique genus:    {df['genus'].nunique():,}")
print(f"unique species:  {df['species'].nunique():,}")
print(f"unique scientificName: {df['scientificName'].nunique():,}")
print(f"unique speciesKey:     {df['speciesKey'].nunique():,}")

print()
print("=== ROWS WITH NO LAT/LON ===")
no_coord = df['decimalLatitude'].isna() | df['decimalLongitude'].isna()
print(f"  {no_coord.sum():,} rows ({100*no_coord.mean():.1f}%)")

print()
print("=== ROWS WITH NO YEAR ===")
no_year = df['year'].isna()
print(f"  {no_year.sum():,} rows ({100*no_year.mean():.1f}%)")
