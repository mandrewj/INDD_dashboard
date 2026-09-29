"use client";

import { DataProvider, useDataState } from "@/lib/dataContext";
import { FilteredRecordsProvider, FilterProvider } from "@/lib/filterContext";
import { FilterBar } from "./FilterPanel";
import { FilteredKpis } from "./FilteredKpis";
import { CollectorBias } from "./charts/CollectorBias";
import { CountyChoropleth } from "./charts/CountyChoropleth";
import { CountyEffort } from "./charts/CountyEffort";
import { RankAbundance } from "./charts/RankAbundance";
import { SpeciesAccumulation } from "./charts/SpeciesAccumulation";
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
    return <LoadingState total={precomputed.totalRecords} />;
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
  return (
    <div>
      {/* Filters: sticky so they stay reachable inside the fixed-height iframe. */}
      <div className="sticky top-0 z-30 -mx-1 mb-4 rounded-b-lg border-b border-cream-300 bg-cream-50/95 px-1 pb-2 pt-1 backdrop-blur">
        <FilterBar />
      </div>

      {/* Row 1: map beside the headline numbers + the abundance distribution
          that drives the richness estimate. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <CountyChoropleth />
        <div className="flex min-w-0 flex-col gap-4">
          <FilteredKpis
            unfilteredTotal={precomputed.totalRecords}
            totalCounties={precomputed.totalCountiesInIndiana}
          />
          <RankAbundance />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <SpeciesAccumulation />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CountyEffort />
        <CollectorBias />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ObservationsOverTime />
        <SeasonalityHeatmap />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TaxonomicComposition />
        <TopSpeciesTable />
      </div>
    </div>
  );
}

function LoadingState({ total }: { total: number }) {
  return (
    <div className="nature-card p-10 text-center">
      <div className="mx-auto h-8 w-8 animate-pulse rounded-full bg-forest-300" />
      <p className="mt-4 text-sm text-moss-700">
        Loading {total.toLocaleString()} occurrence records (~15&nbsp;MB)…
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
