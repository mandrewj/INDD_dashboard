"use client";

import { useState } from "react";
import { Filter as FilterIcon, X } from "lucide-react";
import { DataProvider, useDataState } from "@/lib/dataContext";
import { FilteredRecordsProvider, FilterProvider } from "@/lib/filterContext";
import { FilterPanel } from "./FilterPanel";
import { FilteredKpis } from "./FilteredKpis";
import { ActiveFilterChips } from "./ActiveFilterChips";
import { CountyChoropleth } from "./charts/CountyChoropleth";
import { ObservationsOverTime } from "./charts/ObservationsOverTime";
import { SeasonalityHeatmap } from "./charts/SeasonalityHeatmap";
import { TaxonomicComposition } from "./charts/TaxonomicComposition";
import { TopSpeciesTable } from "./charts/TopSpeciesTable";
import type { Precomputed } from "@/lib/types";

export function Dashboard({ precomputed }: { precomputed: Precomputed }) {
  return (
    <DataProvider>
      <DashboardInner precomputed={precomputed} />
    </DataProvider>
  );
}

function DashboardInner({ precomputed }: { precomputed: Precomputed }) {
  const data = useDataState();

  if (data.status === "loading") {
    return <LoadingState />;
  }
  if (data.status === "error") {
    return <ErrorState message={data.message} />;
  }

  return (
    <FilterProvider
      yearFloor={precomputed.yearFilterFloor}
      yearCeil={precomputed.yearFilterCeil}
    >
      <FilteredRecordsProvider>
        <DashboardLayout precomputed={precomputed} />
      </FilteredRecordsProvider>
    </FilterProvider>
  );
}

function DashboardLayout({ precomputed }: { precomputed: Precomputed }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
      {/* Sticky sidebar (desktop) */}
      <aside className="hidden lg:block">
        <div className="nature-card sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto p-5">
          <FilterPanel />
        </div>
      </aside>

      {/* Mobile open-filter button */}
      <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 rounded-md border border-forest-300 bg-cream-50 px-3 py-1.5 text-sm text-forest-800 hover:bg-cream-100"
        >
          <FilterIcon className="h-4 w-4" aria-hidden />
          Filters
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div
            className="absolute inset-0 bg-bark-700/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[88%] max-w-sm overflow-y-auto bg-cream-50 p-5 shadow-leaf">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-moss-600">
                Filters
              </span>
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1 text-forest-700 hover:bg-cream-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <FilterPanel />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="min-w-0">
        <section aria-labelledby="kpi-heading">
          <div className="mb-5 flex items-baseline justify-between">
            <h2
              id="kpi-heading"
              className="leaf-rule font-serif text-xl font-semibold text-forest-800"
            >
              At a glance
            </h2>
            <p className="text-xs uppercase tracking-wider text-moss-600">
              Live · responds to filters
            </p>
          </div>

          <ActiveFilterChips />

          <div className="mt-4">
            <FilteredKpis
              unfilteredTotal={precomputed.totalRecords}
              totalCounties={precomputed.totalCountiesInIndiana}
            />
          </div>
        </section>

        <div className="mt-8 grid grid-cols-1 gap-6">
          <CountyChoropleth />
          <TaxonomicComposition />
          <ObservationsOverTime />
          <SeasonalityHeatmap />
          <TopSpeciesTable />
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="nature-card p-10 text-center">
      <div className="mx-auto h-8 w-8 animate-pulse rounded-full bg-forest-300" />
      <p className="mt-4 text-sm text-moss-700">
        Loading 366,675 occurrence records (~15&nbsp;MB)…
      </p>
      <p className="mt-1 text-xs text-bark-500">
        First load only — the file is cached after this.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="nature-card p-6">
      <p className="font-serif text-lg text-ok-vermillion">Could not load data</p>
      <p className="mt-2 text-sm text-bark-700">{message}</p>
      <p className="mt-2 text-xs text-moss-600">
        Try a hard reload, or run <code>npm run build:data</code> to regenerate
        <code className="ml-1">/public/data/</code>.
      </p>
    </div>
  );
}
