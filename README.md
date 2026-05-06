# Indiana Insect Biodiversity Dashboard

Interactive visualization of GBIF Darwin Core occurrence records for class
Insecta in Indiana. Built and curated by the Insect Diversity and Diagnostics
Lab in the Purdue University Department of Entomology.

**Stack:** Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS ·
Recharts · Python build pipeline (pandas + shapely + pyshp). No backend; all
data is pre-computed at build time and served statically.

---

## Prerequisites

- **Node.js** ≥ 20
- **Python** ≥ 3.10 with `pandas`, `shapely`, `pyshp`
  ```bash
  python3 -m pip install pandas shapely pyshp
  ```
- The raw TSV at `./data/IN_data.txt` (GBIF occurrence download — see
  *Updating data* below)
- The cached county shapefile at `./scripts/_cache/cb_2022_us_county_500k.*`
  (downloaded once from the U.S. Census; see *Regenerating county
  boundaries*)

## Quick start

```bash
# 1. Install Node deps
npm install

# 2. Generate the static data bundle from the TSV (~5 s on an M-series Mac)
npm run build:data

# 3. Run the dev server
npm run dev
# → http://localhost:3000
```

`/public/data/` holds the four artifacts the dashboard reads:

| File                  | What it contains                                   | Size  |
| --------------------- | -------------------------------------------------- | ----- |
| `records.json`        | Slim per-record table (dictionary-encoded)         | ~15 MB |
| `dictionaries.json`   | id↔label lookups for orders/families/.../counties  | ~324 KB |
| `precomputed.json`    | KPIs and unfiltered totals                         | <1 KB |
| `in-counties.geojson` | Simplified Indiana county polygons (Census 1:500k) | ~110 KB |

These are committed to the repo so deployment doesn't depend on the Python
toolchain.

## Scripts

```bash
npm run dev           # Next dev server (HMR)
npm run build         # Production build
npm run start         # Serve the production build
npm run lint          # next lint
npm test              # Jest unit tests (lib/diversity)
npm run build:data    # Re-run the Python data pipeline
```

## Updating data

### Automatic: pull a fresh GBIF download

`scripts/refresh_gbif_data.py` submits a fresh occurrence download to GBIF
(filter: class Insecta · STATE_PROVINCE Indiana · OCCURRENCE_STATUS present),
polls every 10 minutes until ready, downloads the TSV into `./data/`, and
updates `lib/citation.ts` with the new DOI and date.

```bash
# 1. One-time setup
cp .env.example .env
# Edit .env with your GBIF username and password.
# .env is gitignored — never commit it.

# 2. Refresh
npm run refresh:gbif
# (or: python3 scripts/refresh_gbif_data.py [--poll-seconds 60] [--resume KEY])

# 3. Rebuild the static bundle and ship it
npm run build:data
git add data/IN_data.txt public/data/ lib/citation.ts
git commit -m "Update GBIF data to <new DOI>"
git push   # Vercel auto-redeploys
```

GBIF downloads typically take 5–30 minutes for a query this size. The script
prints a `https://www.gbif.org/occurrence/download/<key>` URL right after
submission so you can watch progress in the browser too. If your shell
disconnects mid-poll, restart with `--resume <key>` to rejoin without
re-submitting.

### Weekly cron (launchd)

A LaunchAgent runs the refresh + rebuild + commit/push pipeline every Monday
at 05:00 local time. The pieces:

- `scripts/cron_refresh.sh` — does `refresh:gbif` → `build:data` → commit/push
  if anything changed; macOS notification on failure, silent on success.
- `scripts/com.iddl.indd-dashboard-refresh.plist` — the LaunchAgent that
  invokes the script. Installed copy lives at
  `~/Library/LaunchAgents/com.iddl.indd-dashboard-refresh.plist`.
- Logs: `~/Library/Logs/INDD_dashboard_refresh.{out,err,}.log`.

```bash
# Install (or reinstall after editing the plist):
cp scripts/com.iddl.indd-dashboard-refresh.plist ~/Library/LaunchAgents/
launchctl unload -w ~/Library/LaunchAgents/com.iddl.indd-dashboard-refresh.plist 2>/dev/null
launchctl load   -w ~/Library/LaunchAgents/com.iddl.indd-dashboard-refresh.plist

# Manually trigger (don't wait for Monday):
launchctl start com.iddl.indd-dashboard-refresh

# Inspect:
launchctl list | grep com.iddl.indd
tail -F ~/Library/Logs/INDD_dashboard_refresh.{out,err}.log
```

**Two macOS gotchas this setup works around** — both stem from the project
living in `~/Documents/`, which is iCloud-synced and TCC-protected:

1. **Full Disk Access for `/bin/bash`** (one-time, manual). Without it,
   launchd cannot read the script and the run fails with `Operation not
   permitted` (exit 126). Open **System Settings → Privacy & Security →
   Full Disk Access**, click **+**, press **⌘⇧G**, type `/bin/bash`, click
   **Open**, and toggle it on.
2. **`osascript` wrapper around bash** (already wired into the plist). When
   launchd spawns `/bin/bash` directly, `mmap()` calls on iCloud-synced
   paths can deadlock against the FileProvider extension and fail with
   `Resource deadlock avoided` — this killed both `.env` reads and `git
   commit` in earlier revisions. Wrapping the bash invocation in
   `osascript -e 'do shell script "..."'` detaches the spawned shell from
   launchd's immediate child domain and bypasses the deadlock. If you ever
   regenerate the plist and revert to a direct `/bin/bash` invocation, the
   weekly run will start failing again at the commit stage.

### Manual: drop in your own TSV

If you've downloaded the file by other means:

1. Replace `./data/IN_data.txt` with the new TSV.
2. Edit `lib/citation.ts` — bump `GBIF_DOI`, `GBIF_DOI_URL`, and
   `GBIF_DOWNLOAD_DATE`.
3. `npm run build:data`
4. Commit `lib/citation.ts` and the regenerated files in `/public/data/`.

The fetch URLs in `lib/dataContext.tsx` are versioned with a hash derived
from `precomputed.json`, so any rebuild defeats both browser and CDN caches
without manual cache-busting.

## Regenerating county boundaries (one-time)

The Indiana county GeoJSON is built from the Census 2022 1:500k cartographic
boundary file:

```bash
mkdir -p scripts/_cache
curl -o scripts/_cache/cb_2022_us_county_500k.zip \
  https://www2.census.gov/geo/tiger/GENZ2022/shp/cb_2022_us_county_500k.zip
unzip -o scripts/_cache/cb_2022_us_county_500k.zip -d scripts/_cache/
python3 scripts/build_counties_geojson.py
```

The script filters to STATEFP=18 (Indiana), simplifies polygons at a
~100 m tolerance, and writes `public/data/in-counties.geojson` (~110 KB,
all 92 counties). Re-running is only needed if county lines change — i.e.,
essentially never.

## Deploying to Vercel

The project is a vanilla Next.js app. Vercel autodetects everything.

### One-shot CLI deploy

```bash
npm i -g vercel
vercel login
vercel --prod
```

### Settings

| Setting              | Value                  |
| -------------------- | ---------------------- |
| Framework Preset     | Next.js (auto-detected) |
| Build Command        | `next build` (default) |
| Output Directory     | `.next` (default)      |
| Install Command      | `npm install` (default) |
| Node version         | 20.x                   |
| Environment vars     | *None required*        |

`vercel.json` adds aggressive `Cache-Control` headers for the data and image
assets — they're content-versioned by URL, so they're safe to mark immutable.

### Static export option

If you want to deploy somewhere that can't run a Node server (S3, GitHub
Pages, etc.):

```js
// next.config.mjs
export default { output: "export", images: { unoptimized: true } };
```

Then `npm run build` writes the static site to `./out/`. The current config
keeps `output` unset so Vercel's image optimizer handles the small icons.

## Project structure

```
.
├── app/                  # App Router — root layout + page
├── components/
│   ├── Dashboard.tsx     # Client shell: data + filter providers, layout
│   ├── FilterPanel.tsx   # Sticky sidebar / mobile drawer
│   ├── FilteredKpis.tsx  # Live KPIs that respond to filters
│   ├── ActiveFilterChips.tsx
│   ├── SiteHeader.tsx
│   └── charts/
│       ├── ChartCard.tsx          # Shared card wrapper
│       ├── CountyChoropleth.tsx   # SVG map, viridis fill, click-to-filter
│       ├── ObservationsOverTime.tsx
│       ├── TaxonomicComposition.tsx (Recharts Treemap)
│       ├── SeasonalityHeatmap.tsx (custom SVG, drills into active filter)
│       ├── TopSpeciesTable.tsx
│       ├── GbifLink.tsx           # Logo link to GBIF Indiana search
│       └── InatLink.tsx           # Logo link to iNaturalist (lazy lookup, cached)
├── lib/
│   ├── types.ts          # RecordTuple, Dictionaries, Precomputed
│   ├── filtering.ts      # Pure filter + dependent-options logic
│   ├── filterContext.tsx # Filter state + shared filtered-records context
│   ├── dataContext.tsx   # Fetches the static data bundle once
│   ├── diversity.ts      # Shannon H' + Pielou's J (with unit tests)
│   ├── colorscale.ts     # Viridis interpolation
│   ├── citation.ts       # GBIF DOI + URL builders
│   └── inaturalist.ts    # Cached iNat taxon-id lookup
├── scripts/
│   ├── build_data.py            # Main pipeline (TSV → JSON bundle)
│   ├── build_counties_geojson.py
│   ├── refresh_gbif_data.py     # Submits + polls a fresh GBIF download
│   ├── cron_refresh.sh          # Weekly launchd entry point
│   ├── com.iddl.indd-dashboard-refresh.plist  # LaunchAgent definition
│   └── profile.py               # One-off schema profiler
├── public/
│   ├── data/             # Built data artifacts (committed)
│   └── images/           # Site icon, GBIF + iNat logos
└── data/
    ├── IN_data.txt       # Source TSV (gitignored)
    └── *.png/.gif        # Logo sources (copied into public/images)
```

## Architectural notes

- **All filtering happens client-side.** `useFilteredRecords()` runs the
  O(n) filter scan once per `(records, filters)` change and shares the
  result with every chart and the KPI strip via React context — adding more
  charts doesn't compound the cost.
- **Records are dictionary-encoded** (positional tuples of integer ids).
  366 k rows + 50 columns (~221 MB raw TSV) compresses to ~15 MB JSON in
  this representation.
- **County is derived at build time** by point-in-polygon against the
  Indiana county GeoJSON. ~83 % of records resolve; the rest land in the
  *Unknown / unmapped* bucket and are surfaced in the data-gaps panel.
- **The seasonality heatmap drills into the active filter:**
  - No taxonomic filter → top 14 orders
  - Order set → that order + top 10 families within it
  - Family or genus set → top 10 species in that group
- **Species names link to** GBIF Indiana search (synchronous; we have the
  taxon key from the build) **and** iNaturalist (lazy lookup of the iNat
  taxon id, cached in `localStorage`).

## Accessibility

- Strict TypeScript, no `any` (`@typescript-eslint/no-explicit-any: error`)
- Charts have `role="img"` + descriptive `aria-label`s; SVG titles where
  Recharts allows
- Sort buttons in the species table use `aria-sort` ascending/descending
- Filter selects are native `<select>` (full keyboard + screen-reader
  support) with `<label>` associations
- Visible forest-green focus ring on every interactive element
- Color encoding is **Okabe-Ito** (qualitative palette, taxonomic groups)
  or **viridis** (sequential, choropleth + heatmap) — both are
  colorblind-safe
- Mobile-first responsive layout; sticky sidebar collapses to a drawer
  below the `lg` breakpoint

## Citation

Data: GBIF.org (2026-04-25). GBIF Occurrence Download
<https://doi.org/10.15468/dl.h4g94t>

County boundaries: U.S. Census Bureau, 2022 TIGER/Line cartographic
boundary file (1:500k).
