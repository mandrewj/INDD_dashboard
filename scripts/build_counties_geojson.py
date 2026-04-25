"""Convert the cached Census 500k US-county shapefile into a simplified
Indiana-only GeoJSON FeatureCollection at public/data/in-counties.geojson.

Each feature:
  properties = { fips: '18###', name: 'Marion', geoid: '18097' }
  geometry   = simplified Polygon / MultiPolygon, EPSG:4326

Tolerance is in degrees (~0.001 ≈ 100m at IN latitude). Adjust if quality
suffers; current setting still preserves all 92 counties.
"""

import json
from pathlib import Path

import shapefile
from shapely.geometry import shape, mapping

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "_cache" / "cb_2022_us_county_500k.shp"
OUT = ROOT / "public" / "data" / "in-counties.geojson"
OUT.parent.mkdir(parents=True, exist_ok=True)

INDIANA_STATEFP = "18"
SIMPLIFY_TOLERANCE = 0.001  # degrees

reader = shapefile.Reader(str(SRC))
field_names = [f[0] for f in reader.fields[1:]]

features = []
for sr in reader.shapeRecords():
    rec = dict(zip(field_names, sr.record))
    if rec.get("STATEFP") != INDIANA_STATEFP:
        continue
    geom = shape(sr.shape.__geo_interface__)
    geom = geom.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
    if geom.is_empty:
        continue
    features.append({
        "type": "Feature",
        "properties": {
            "fips": rec["GEOID"],
            "geoid": rec["GEOID"],
            "name": rec["NAME"],
        },
        "geometry": mapping(geom),
    })

features.sort(key=lambda f: f["properties"]["name"])

OUT.write_text(json.dumps({
    "type": "FeatureCollection",
    "features": features,
}, separators=(",", ":")))

print(f"Wrote {len(features)} county features → {OUT}")
print(f"Size: {OUT.stat().st_size:,} bytes")
