import { SiteHeader } from "@/components/SiteHeader";
import { Dashboard } from "@/components/Dashboard";
import precomputed from "@/public/data/precomputed.json";
import type { Precomputed } from "@/lib/types";
import { GBIF_CITATION, GBIF_DOI, GBIF_DOI_URL } from "@/lib/citation";

const data = precomputed as Precomputed;

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader precomputed={data} />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <Dashboard precomputed={data} />

        <DataGapsSection data={data} />

        <footer className="mt-12 border-t border-forest-100 pt-6 text-xs text-moss-600">
          <p className="font-serif text-sm text-forest-700">
            Created and curated by the{" "}
            <span className="font-semibold">
              Insect Diversity and Diagnostics Lab
            </span>{" "}
            in the Purdue University Department of Entomology.
          </p>
          <p className="mt-3">
            Data: GBIF Darwin Core occurrence export, filtered to Indiana / class
            Insecta. County boundaries: U.S. Census TIGER 2022 cartographic
            boundary file (1:500k).
          </p>
          <p className="mt-2">
            <span className="font-medium text-moss-700">Cite this data:</span>{" "}
            {GBIF_CITATION.replace(GBIF_DOI_URL, "")}
            <a
              href={GBIF_DOI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-forest-700 underline underline-offset-2 hover:text-forest-800"
            >
              https://doi.org/{GBIF_DOI}
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

function DataGapsSection({ data }: { data: Precomputed }) {
  return (
    <section
      aria-labelledby="gaps-heading"
      className="mt-10 nature-card nature-card-accent p-6"
    >
      <h2
        id="gaps-heading"
        className="leaf-rule font-serif text-lg font-semibold text-forest-800"
      >
        Known data gaps
      </h2>
      <p className="mt-3 text-sm text-bark-600">
        We surface missing values rather than fill them silently — the dataset
        is messy in the ways field collections always are.
      </p>
      <ul className="mt-4 grid gap-2 text-sm text-bark-700 sm:grid-cols-2">
        <Gap n={data.recordsWithoutCounty} of={data.totalRecords} label="lack a derivable county (no usable coordinates)" />
        <Gap n={data.recordsWithoutYear} of={data.totalRecords} label="lack a year" />
        <Gap n={data.recordsWithoutMonth} of={data.totalRecords} label="lack a month" />
        <Gap n={data.recordsWithoutSpecies} of={data.totalRecords} label="aren’t identified to species" />
        <Gap n={data.recordsOutOfBboxCoords} of={data.totalRecords} label="have coordinates outside the Indiana bbox" />
        <Gap n={data.recordsYearOutOfRange} of={data.totalRecords} label="have years outside 1880–2026 (treated as unknown)" />
      </ul>
    </section>
  );
}

function Gap({ n, of, label }: { n: number; of: number; label: string }) {
  const pct = of > 0 ? (100 * n) / of : 0;
  return (
    <li className="flex items-baseline gap-2">
      <span className="font-serif text-base text-forest-700 tabular-nums">
        {n.toLocaleString()}
      </span>
      <span className="text-xs text-moss-600 tabular-nums">({pct.toFixed(1)}%)</span>
      <span>{label}</span>
    </li>
  );
}
