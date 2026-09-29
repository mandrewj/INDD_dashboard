"use client";

import { useMemo } from "react";
import { useLoadedData } from "./dataContext";
import { useFilters } from "./filterContext";

export interface Scope {
  /** e.g. "Coleoptera › Carabidae" or "All insects" */
  taxon: string;
  /** Rank of the most specific taxon filter, or null for all insects. */
  rank: "order" | "family" | "genus" | "species" | null;
  /** e.g. "Tippecanoe Co.", "all counties", "unmapped records" */
  place: string;
  /** e.g. "2000–2026", or null when the full range is selected */
  years: string | null;
}

/**
 * Human-readable description of what the current filters select — shown on
 * every card and in exported figure captions so a chart is never ambiguous
 * about which insects it describes.
 *
 * `ignoreCounty` is for views that deliberately compare all counties
 * (the map, county effort), where the county filter is released.
 */
export function useScope(ignoreCounty = false): Scope {
  const { dictionaries: d } = useLoadedData();
  const { filters: f, yearFloor, yearCeil } = useFilters();
  return useMemo(() => {
    const parts: string[] = [];
    if (f.orderId !== null) parts.push(d.order[f.orderId] ?? "?");
    if (f.familyId !== null) parts.push(d.family[f.familyId] ?? "?");
    if (f.genusId !== null && f.speciesId === null) parts.push(d.genus[f.genusId] ?? "?");
    if (f.speciesId !== null) parts.push(d.species[f.speciesId] ?? "?");
    const rank =
      f.speciesId !== null
        ? "species"
        : f.genusId !== null
          ? "genus"
          : f.familyId !== null
            ? "family"
            : f.orderId !== null
              ? "order"
              : null;
    const place =
      ignoreCounty || f.countyId === null
        ? "all Indiana counties"
        : f.countyId === 0
          ? "records without a county"
          : `${d.county[f.countyId]} Co.`;
    const yearsSet = f.yearMin !== yearFloor || f.yearMax !== yearCeil;
    return {
      taxon: parts.length ? parts.join(" › ") : "All insects",
      rank,
      place,
      years: yearsSet ? `${f.yearMin}–${f.yearMax}` : null,
    };
  }, [d, f, yearFloor, yearCeil, ignoreCounty]);
}

export function scopeText(s: Scope): string {
  return [s.taxon, s.place, s.years].filter(Boolean).join(" · ");
}
