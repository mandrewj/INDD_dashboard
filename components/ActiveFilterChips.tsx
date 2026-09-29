"use client";

import { useState } from "react";
import { Check, Link2, X } from "lucide-react";
import { shareUrl } from "@/lib/embed";
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
    setSpecies,
    setCounty,
    setYearRange,
    setIncludeNullYear,
    reset,
    params,
  } = useFilters();

  const active = isFilterActive(filters, yearFloor, yearCeil);

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
  if (filters.speciesId !== null) {
    chips.push({
      key: "species",
      label: `Species: ${dictLabel(dictionaries.species, filters.speciesId)}`,
      clear: () => setSpecies(null),
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
      {active ? (
        <button
          type="button"
          onClick={reset}
          className="text-xs text-moss-700 underline-offset-2 hover:underline"
        >
          Clear all
        </button>
      ) : (
        <span className="text-xs text-moss-600">
          Showing all Indiana insect records. Pick a taxon, county, or years to focus.
        </span>
      )}
      <CopyLink url={() => shareUrl(params)} />
    </div>
  );
}

function CopyLink({ url }: { url: () => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const u = url();
        try {
          await navigator.clipboard.writeText(u);
        } catch {
          // Clipboard can be blocked inside iframes without the
          // clipboard-write permission; fall back to a prompt-free copy.
          const ta = document.createElement("textarea");
          ta.value = u;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      title="Copy a link to this exact view"
      className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-forest-200 bg-cream-50 px-2.5 py-1 text-xs text-forest-700 hover:bg-cream-100"
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
      {copied ? "Link copied" : "Copy link to this view"}
    </button>
  );
}
