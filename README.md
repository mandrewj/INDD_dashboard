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
| `records.json`        | Slim per-record table (dictionary-encoded)         | ~16 MB |
| `dictionaries.json`   | id↔label lookups for orders/families/.../counties  | ~324 KB |
| `precomputed.json`    | KPIs, unfiltered totals, `dataVersion` hash        | <1 KB |
| `in-counties.geojson` | Simplified Indiana county polygons (Census 1:500k) | ~110 KB |

These are committed to the repo so deployment doesn't depend on the Python
toolchain.

## Scripts

```bash
npm run dev           # Next dev server (HMR)
npm run build         # Production build
npm run start         # Serve the production build
npm run lint          # next lint
npm test              # Jest unit tests (iNEXT port vs. R, URL state, aggregations)
npm run build:data    # Re-run the Python data pipeline (validates; --force to override)
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

### Scheduled refresh (GitHub Actions)

`.github/workflows/refresh-data.yml` runs Mondays and Thursdays at 09:00 UTC
(and on demand via *Run workflow*): `refresh:gbif` → `build:data` → commit →
push, which triggers a Vercel deploy. Credentials come from the repo secrets
`GBIF_USER`, `GBIF_PASSWORD`, and `GBIF_NOTIFY_EMAIL`.

Safeguards, so that a bad download never reaches the live site:

- **Download reuse.** GBIF sometimes takes hours to prepare a download.
  Before submitting, the script looks for a matching download from the last
  4 days that is still running, or finished and newer than the current data,
  and reuses it. So a run that times out doesn't waste GBIF's work: the next
  run picks it up. `--always-submit` disables this.
- **Bounded waits and retries.** Polling stops at 1.6 h, inside the job's
  2 h limit, with a clear error. Transient network errors are retried. The
  zip download is retried and checked for size and integrity.
- **Validation gate** in `build_data.py`. It aborts, and nothing is
  committed, if required columns are missing, more than 0.1% of TSV lines
  fail to parse, the record count drops more than 20% from the last build,
  or fewer than 60% of records resolve to a county. After a deliberate scope
  change, run `python3 scripts/build_data.py --force`.
- **Atomic writes.** Output files are written to temp files and renamed, so a
  crash can't leave half-written JSON.
- **Push race.** If `main` moved during the run, the job rebases and retries
  the push.
- **Cache safety.** `precomputed.json` carries `dataVersion`, a content hash
  of the bundle. Data URLs are versioned with it and served `immutable`, so
  any content change reaches every browser even if the record count is
  unchanged.
- The year ceiling is the current year, so new records are never treated
  as out of range.

`scripts/cron_refresh.sh` runs the same pipeline locally for ad-hoc
refreshes (`bash scripts/cron_refresh.sh`). The old launchd agent is
retired: macOS privacy (TCC) controls kept blocking it from reading
`~/Documents`.

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
│   ├── FilterPanel.tsx   # FilterBar: sticky one-row filters + copy link
│   ├── FilteredKpis.tsx  # Live KPIs that respond to filters
│   ├── SiteHeader.tsx
│   └── charts/
│       ├── ChartCard.tsx          # Card wrapper (+ "How to read this"), Toggle, shared chart styles
│       ├── LinePlot.tsx           # Hand-rolled SVG line plot: CI bands, log axes, crosshair
│       ├── CountyChoropleth.tsx   # SVG map (species / records / completeness), click-to-filter
│       ├── SpeciesAccumulation.tsx # iNEXT rarefaction/extrapolation + Hill-number table
│       ├── CountyEffort.tsx       # Records vs. species per county vs. statewide rarefaction
│       ├── RankAbundance.tsx      # Whittaker plot (singletons/doubletons)
│       ├── CollectorBias.tsx      # Observations vs. specimens: taxonomic bias
│       ├── ObservationsOverTime.tsx # Records by source / species per year / discovery curve
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
│   ├── diversity.ts      # Shannon H', Pielou's J, abundance vectors
│   ├── inext.ts          # TS port of iNEXT (Hill numbers, coverage, Chao1, bootstrap)
│   ├── inext.worker.ts   # Runs iNEXT curves + bootstrap off the main thread
│   ├── useInext.ts       # React hook around the worker
│   ├── urlState.ts       # Filters ⇄ shareable URL params (by name)
│   ├── embed.ts          # iframe glue: postMessage to insectid.org, share URLs
│   ├── aggregates.ts     # Cached typed-array aggregates (county × species)
│   ├── taxonIndex.ts     # Static taxonomy index for the filter cascade
│   ├── scope.ts          # "What is this chart analysing?" label for cards + exports
│   ├── figureExport.ts   # Captioned golden-ratio PNG export of any card
│   ├── colorscale.ts     # Viridis interpolation
│   ├── citation.ts       # GBIF DOI + URL builders
│   └── inaturalist.ts    # Cached iNat taxon-id lookup
├── wix/
│   └── indiana-insects.page.js  # Velo page code for insectid.org (deep links)
├── scripts/
│   ├── build_data.py            # Main pipeline (TSV → JSON bundle)
│   ├── build_counties_geojson.py
│   ├── refresh_gbif_data.py     # Submits + polls a fresh GBIF download
│   ├── cron_refresh.sh          # Local ad-hoc refresh (same pipeline as CI)
│   ├── com.iddl.indd-dashboard-refresh.plist  # LaunchAgent definition
│   └── profile.py               # One-off schema profiler
├── public/
│   ├── data/             # Built data artifacts (committed)
│   └── images/           # Site icon, GBIF + iNat logos
└── data/
    ├── IN_data.txt       # Source TSV (gitignored)
    └── *.png/.gif        # Logo sources (copied into public/images)
```

## Embedding in insectid.org & deep links

The dashboard is embedded on <https://www.insectid.org/indiana-insects> as a
Wix *Embed a site* element. Any view can be linked:

```
https://www.insectid.org/indiana-insects?taxon=Carabidae&county=Tippecanoe
https://www.insectid.org/indiana-insects?taxon=Danaus+plexippus&from=2000
https://www.insectid.org/indiana-insects?taxon=Odonata&county=unknown
```

| Param | Meaning |
| ----- | ------- |
| `taxon` | Order, family, genus, or species name (any rank; case-insensitive; `_` or `+` for spaces). Parents are filled in automatically. |
| `order` / `family` / `genus` / `species` | Same, with an explicit rank |
| `county` | County name (`Tippecanoe` or `Tippecanoe County`), or `unknown` |
| `from`, `to` | Year range |
| `noyear=0` | Exclude records without a year |

Names, not ids, are used because dictionary ids change on every rebuild.
The same params work directly on the Vercel URL.

**How the params reach the iframe.** A cross-origin iframe can't read its
parent's URL (the browser strips the referrer to the origin), so the Wix page
needs a few lines of Velo code — `wix/indiana-insects.page.js`:

1. In the Wix editor, turn on **Dev Mode**.
2. Select the dashboard embed; in the Properties panel set its ID to
   `dashboard`.
3. Paste `wix/indiana-insects.page.js` into that page's code panel. Publish.

The page code copies the page's query string onto the iframe `src`, and
listens for `{source: "indd-dashboard", type: "filters"}` messages from the
app to mirror filter changes back into the address bar. Without it, deep
links still work on the Vercel URL, and the in-app **Copy link to this view**
button always produces an `insectid.org/indiana-insects?…` link. Those links
just won't pre-filter until the page code is installed.

## Analytical views (for teaching)

Every card names the taxon, place, and years it is analysing. Each card also
has a collapsible **How to read this** (method plus a "try this" prompt,
written for undergraduate courses and public workshops) and a **PNG** button
(see *Figure export*).

- **KPIs** (beside the map): observed vs. **Chao1-estimated** species (95%
  CI) and **sample coverage**, so "how many species?" always comes with "how
  complete?".
- **Map**: species, records, completeness (sample coverage) per county, and
  **Survey gaps**. That view uses a ~11 km grid shaded by the chance that
  the next record in each cell is a species new to that cell (1 − coverage,
  cells with ≥ 20 records), plus a ranked "where to survey next" list. The
  tooltip also extrapolates how many new species doubling the cell's records
  would add.
- **Rank–abundance**: the singleton/doubleton tail behind Chao1.
- **Species accumulation (iNEXT)**: rarefaction/extrapolation of Hill
  numbers q = 0, 1, 2 by sample size or coverage, the completeness curve,
  and a **diversity profile** (observed Hill numbers for q = 0–3 with
  estimated values ± CI at q = 0, 1, 2, 3). Bands and CIs come from 50
  bootstrap replicates. It runs on **abundance** data (records) or
  **incidence** data (sampling units: county × year or 10-km cell × year;
  iNEXT `incidence_freq`, Chao2). Groups can be compared by data source, time
  period, or selected county vs. rest of state. The card exports curve CSVs
  plus the input data and R code to rerun everything in iNEXT.
  `lib/inext.ts` is tested against iNEXT 3.0.2 (`spider$Girdled` for
  abundance, `ant$h500m` for incidence).
- **Sampling effort vs. species**: county records vs. species on log–log
  axes against the statewide rarefaction curve.
- **Who records what**: which subgroups (orders → families → genera →
  species, following the filter) are over-represented in community
  observations vs. museum specimens, and how many species each source alone
  has documented.
- **Records through time** (by source, species/year, discovery curve),
  **seasonality**, **taxonomic composition**, **species list**.

### Figure export

The PNG button on every card renders that card's figure into a 1618 × 1000
(golden-ratio) image at 2× resolution. The image includes the title, the
analysis scope, the card's caption, the GBIF DOI citation, a lab credit,
and a link to the exact view on insectid.org (`lib/figureExport.ts`,
using `html-to-image`). Controls and download buttons are left out; mark
any element `data-export-exclude` to do the same.

## Architectural notes

- **All filtering happens client-side.** `useFilteredRecords()` runs the
  O(n) filter scan once per `(records, filters)` change and shares the
  result with every chart and the KPI strip via React context, so adding
  more charts doesn't compound the cost.
- **Filters never block input.** The controls read `useFilterControls()`,
  which updates immediately. Charts read `useFilters()`, whose filters are
  React-deferred (`useDeferredValue`), so they re-render in background,
  time-sliced passes. A filter change paints in under 10 ms; all charts
  settle within about 70–150 ms on the full 414k records (production build,
  M-series Mac), with no main-thread block over 50 ms.
- **Hot loops use typed arrays**, indexed by dictionary id, rather than a
  `Map`/`Set` per record. Shared aggregates are cached by the filtered
  array's identity (`lib/aggregates.ts`: county × species matrix;
  `speciesAbundances` in `lib/diversity.ts`), so the map and the effort
  chart share one pass. The filter dropdowns use a static taxonomy index
  built once per load (`lib/taxonIndex.ts`).
- **Records are dictionary-encoded** (positional tuples of integer ids).
  ~414 k rows + 50 columns (~250 MB raw TSV) compresses to ~16 MB JSON
  (~3.6 MB brotli over the wire) in this representation.
- **County is derived at build time** by point-in-polygon against the
  Indiana county GeoJSON. ~83 % of records resolve; the rest land in the
  *Unknown / unmapped* bucket and are surfaced in the data-gaps panel.
- **The seasonality heatmap drills into the active filter:**
  - No taxonomic filter → top 14 orders
  - Order set → that order + top 10 families within it
  - Family or genus set → top 10 species in that group
- **iNEXT runs in a Web Worker** (`lib/inext.worker.ts`): point estimates
  return in tens of ms, bootstrap bands follow (~1 s for the full dataset).
- **`useFilteredRecordsExceptCounty()`** is the filtered set with the
  county dimension released. The map and county-effort chart use it so all
  counties stay visible while one is selected.
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
