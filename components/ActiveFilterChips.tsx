"use client";

import { X } from "lucide-react";
import { useLoadedData } from "@/lib/dataContext";
import { useFilters } from "@/lib/filterContext";
import { dictLabel, isFilterActive } from "@/lib/filtering";

export function ActiveFilterChips() {
  const { dictionaries } = useLoadedData();
  const {
    filters,
    yearFloor,
    yearCeil,
    setOrder,
    setFamily,
    setGenus,
    setCounty,
    setYearRange,
    setIncludeNullYear,
    reset,
  } = useFilters();

  const active = isFilterActive(filters, yearFloor, yearCeil);
  if (!active) return null;

  const chips: Array<{ key: string; label: string; clear: () => void }> = [];

  if (filters.orderId !== null) {
    chips.push({
      key: "order",
      label: `Order: ${dictLabel(dictionaries.order, filters.orderId)}`,
      clear: () => setOrder(null),
    });
  }
  if (filters.familyId !== null) {
    chips.push({
      key: "family",
      label: `Family: ${dictLabel(dictionaries.family, filters.familyId)}`,
      clear: () => setFamily(null),
    });
  }
  if (filters.genusId !== null) {
    chips.push({
      key: "genus",
      label: `Genus: ${dictLabel(dictionaries.genus, filters.genusId)}`,
      clear: () => setGenus(null),
    });
  }
  if (filters.countyId !== null) {
    const label = filters.countyId === 0 ? "Unknown / unmapped" : dictLabel(dictionaries.county, filters.countyId);
    chips.push({
      key: "county",
      label: `County: ${label}`,
      clear: () => setCounty(null),
    });
  }
  if (filters.yearMin !== yearFloor || filters.yearMax !== yearCeil) {
    chips.push({
      key: "year",
      label: `Year: ${filters.yearMin}–${filters.yearMax}`,
      clear: () => setYearRange(yearFloor, yearCeil),
    });
  }
  if (!filters.includeNullYear) {
    chips.push({
      key: "no-null-year",
      label: "Excluding records with no year",
      clear: () => setIncludeNullYear(true),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.clear}
          className="group inline-flex items-center gap-1.5 rounded-full border border-forest-200 bg-cream-100 px-3 py-1 text-xs text-forest-800 hover:border-forest-400 hover:bg-cream-200"
        >
          {c.label}
          <X className="h-3 w-3 text-moss-600 group-hover:text-forest-700" aria-hidden />
          <span className="sr-only">Clear</span>
        </button>
      ))}
      <button
        type="button"
        onClick={reset}
        className="text-xs text-moss-700 underline-offset-2 hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
