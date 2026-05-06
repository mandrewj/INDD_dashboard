# CLAUDE.md

Project-scoped notes for Claude Code. Setup, data refresh, deploy, and full structure live in `README.md` — read it for those. This file covers conventions and gotchas that aren't obvious from the code.

## Stack at a glance

Next.js 14 App Router · TypeScript strict · Tailwind · Recharts · Python build pipeline. No backend — `npm run build:data` produces static JSON in `public/data/` which is committed and served as-is.

## Deployment context

Deployed as a **subdomain of insectid.org** (the lab's parent site). The header is intentionally split:

- **Logo** → external `<a href="https://insectid.org">` (full-page navigation back to parent)
- **Title block** ("Field Guide…" + h1) → `<Link href="/">` (internal app reload)

Don't merge these; they navigate to different sites by design. See `components/SiteHeader.tsx`.

## Brand / palette

Source of truth: `tailwind.config.ts`. Anchors:

- `forest-800` `#0A3F95` — h1 + logo text + magnifier outline
- `forest-600` `#116dff` — primary accent, links
- `moss-300` `#B7BDC0` — magnifier handle fill, neutral grays
- Charts use Okabe-Ito (qualitative) and viridis (sequential) — both colorblind-safe; don't swap them out for arbitrary palettes.

The `forest`/`moss`/`bark`/`cream` Tailwind keys are remapped to the insectid.org palette — names are legacy, values are current. Keep using the semantic class names; edit the palette in one place.

## Logo files

- `data/insectID.png` — original raster (black text, 1094×474, 2.31:1).
- `data/insectID-brand.png` — recolored variant: text + magnifier outline forest-800, handle moss-300, beetle preserved. Reuse this on sibling apps when you need the brand-aligned mark.
- `public/images/insectID.png` — what Next.js serves (currently the brand variant). To swap, copy the file you want from `data/` over this path.

Sizing: the logo is **not square** (1094×474). Style with `h-14 w-auto sm:h-16` — never `w-X h-X`, which crushes the aspect ratio. Width/height props on `<Image>` should match intrinsic dimensions (1094×474) so Next computes the layout correctly.

To recolor a logo PNG by component (text vs. magnifier vs. beetle), use Python + PIL with connected-component labeling — the magnifier interior is transparent, so a single flood-fill from a colored seed will *not* capture the beetle. Identify each component separately by bbox or by which contains gray (handle) pixels. PIL is preinstalled (`from PIL import Image`).

## Data refresh

Two paths, both detailed in README:

- `npm run refresh:gbif` — submits a fresh GBIF download (needs `.env` with credentials), polls until ready, drops the TSV into `data/`, updates `lib/citation.ts`.
- `npm run build:data` — rebuilds `public/data/` JSON bundle from `data/IN_data.txt`.

A weekly launchd cron is wired up: `scripts/cron_refresh.sh` is invoked by `scripts/com.iddl.indd-dashboard-refresh.plist` (installed at `~/Library/LaunchAgents/`) every Monday at 05:00. Two macOS quirks the plist works around — both because the project lives in iCloud-synced `~/Documents/`: (1) `/bin/bash` must be granted Full Disk Access in System Settings → Privacy & Security, or runs fail with `Operation not permitted` (exit 126); (2) the plist invokes bash via `osascript -e 'do shell script "..."'` rather than spawning `/bin/bash` directly, because launchd-spawned bash hits `mmap: Resource deadlock avoided` against the iCloud FileProvider extension on `.env` reads and `git commit`. Don't revert that wrapper. Logs land in `~/Library/Logs/INDD_dashboard_refresh.{out,err,}.log`. A manual refresh is rarely needed.

## Architectural rules of thumb

- All filtering is client-side; `useFilteredRecords()` runs the O(n) scan once per (records, filters) change and shares the result via context. New charts read from this context — don't re-filter inside individual charts.
- Records are dictionary-encoded positional tuples (`lib/types.ts` → `RecordTuple`). Decode through the dictionaries; don't introduce a parallel parsed shape.
- County is derived at build time via point-in-polygon. ~83% resolve; the rest land in *Unknown / unmapped* and surface in the data-gaps panel — preserve that bucket, don't drop it.
- Image cache fetches in `lib/dataContext.tsx` are versioned by a hash of `precomputed.json`, so any rebuild auto-busts CDN + browser caches. Don't add manual `?v=` query params.

## Things to avoid

- Don't add a backend or runtime data fetch — the whole site is static by design.
- Don't reach for `output: "export"` in `next.config.mjs` unless the user asks; we keep it unset so Vercel can run image optimization on the small icons.
- Don't introduce `any` — `@typescript-eslint/no-explicit-any` is set to `error`.
- Don't commit `data/IN_data.txt` (gitignored) or `.env`.

## Vercel CLI

Not installed by default in fresh sessions. If a task needs `vercel env pull`, `vercel deploy`, etc., suggest the user run `npm i -g vercel` — don't try to invoke it without checking.
