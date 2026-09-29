"use client";

import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyFilters,
  createInitialFilterState,
  type FilterState,
} from "./filtering";
import { useLoadedData } from "./dataContext";
import { publishParams } from "./embed";
import { filtersToParams, parseFilterParams } from "./urlState";
import type { RecordTuple } from "./types";

interface FilterSetters {
  setOrder: (id: number | null) => void;
  setFamily: (id: number | null) => void;
  setGenus: (id: number | null) => void;
  setSpecies: (id: number | null) => void;
  setCounty: (id: number | null) => void;
  setYearRange: (min: number, max: number) => void;
  setIncludeNullYear: (v: boolean) => void;
  /** Replace the whole taxon selection at once (e.g. treemap / table clicks). */
  setTaxon: (t: Pick<FilterState, "orderId" | "familyId" | "genusId" | "speciesId">) => void;
  reset: () => void;
}

/**
 * What the charts see. `filters` is *deferred*: when the user changes a
 * filter, React re-renders the charts for the new value in the background
 * (interruptible, time-sliced), so the controls never freeze. This context
 * only changes when the charts' filters do.
 */
interface FilterContextValue extends FilterSetters {
  filters: FilterState;
  yearFloor: number;
  yearCeil: number;
  /** Shareable URL params (names, not ids) for what the charts show. */
  params: URLSearchParams;
}

/** What the filter controls see: the latest choice, updated immediately. */
interface FilterControlsValue extends FilterSetters {
  filters: FilterState;
  yearFloor: number;
  yearCeil: number;
  params: URLSearchParams;
  /** True while charts are still catching up with the controls. */
  isUpdating: boolean;
}

const FilterControlsContext = createContext<FilterControlsValue | null>(null);
const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({
  yearFloor,
  yearCeil,
  children,
}: {
  yearFloor: number;
  yearCeil: number;
  children: ReactNode;
}) {
  const { records, dictionaries } = useLoadedData();

  // This provider only mounts after the data has loaded client-side, so the
  // URL is available for the initial state (deep links from insectid.org).
  const [filters, setFilters] = useState<FilterState>(() =>
    typeof window === "undefined"
      ? createInitialFilterState(yearFloor, yearCeil)
      : parseFilterParams(
          new URLSearchParams(window.location.search),
          dictionaries,
          records,
          yearFloor,
          yearCeil,
        ),
  );

  const deferred = useDeferredValue(filters);

  const params = useMemo(
    () => filtersToParams(filters, dictionaries, yearFloor, yearCeil),
    [filters, dictionaries, yearFloor, yearCeil],
  );

  useEffect(() => {
    publishParams(params);
  }, [params]);

  const setOrder = useCallback((orderId: number | null) => {
    // Changing order resets dependent taxa.
    setFilters((f) => ({ ...f, orderId, familyId: null, genusId: null, speciesId: null }));
  }, []);
  const setFamily = useCallback((familyId: number | null) => {
    setFilters((f) => ({ ...f, familyId, genusId: null, speciesId: null }));
  }, []);
  const setGenus = useCallback((genusId: number | null) => {
    setFilters((f) => ({ ...f, genusId, speciesId: null }));
  }, []);
  const setSpecies = useCallback((speciesId: number | null) => {
    setFilters((f) => ({ ...f, speciesId }));
  }, []);
  const setTaxon = useCallback(
    (t: Pick<FilterState, "orderId" | "familyId" | "genusId" | "speciesId">) => {
      setFilters((f) => ({ ...f, ...t }));
    },
    [],
  );
  const setCounty = useCallback((countyId: number | null) => {
    setFilters((f) => ({ ...f, countyId }));
  }, []);
  const setYearRange = useCallback((min: number, max: number) => {
    setFilters((f) => ({
      ...f,
      yearMin: Math.min(min, max),
      yearMax: Math.max(min, max),
    }));
  }, []);
  const setIncludeNullYear = useCallback((includeNullYear: boolean) => {
    setFilters((f) => ({ ...f, includeNullYear }));
  }, []);
  const reset = useCallback(() => {
    setFilters(createInitialFilterState(yearFloor, yearCeil));
  }, [yearFloor, yearCeil]);

  const setters = useMemo<FilterSetters>(
    () => ({
      setOrder,
      setFamily,
      setGenus,
      setSpecies,
      setCounty,
      setYearRange,
      setIncludeNullYear,
      setTaxon,
      reset,
    }),
    [setOrder, setFamily, setGenus, setSpecies, setCounty, setYearRange, setIncludeNullYear, setTaxon, reset],
  );

  const deferredParams = useMemo(
    () => filtersToParams(deferred, dictionaries, yearFloor, yearCeil),
    [deferred, dictionaries, yearFloor, yearCeil],
  );

  const view = useMemo<FilterContextValue>(
    () => ({ ...setters, filters: deferred, yearFloor, yearCeil, params: deferredParams }),
    [setters, deferred, yearFloor, yearCeil, deferredParams],
  );
  const controls = useMemo<FilterControlsValue>(
    () => ({ ...setters, filters, yearFloor, yearCeil, params, isUpdating: deferred !== filters }),
    [setters, filters, yearFloor, yearCeil, params, deferred],
  );

  return (
    <FilterControlsContext.Provider value={controls}>
      <FilterContext.Provider value={view}>{children}</FilterContext.Provider>
    </FilterControlsContext.Provider>
  );
}

/** For the filter controls: the latest selection, updated immediately. */
export function useFilterControls(): FilterControlsValue {
  const ctx = useContext(FilterControlsContext);
  if (ctx === null) throw new Error("useFilterControls must be used within FilterProvider");
  return ctx;
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (ctx === null) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}

// ---- Filtered-records context ---------------------------------------------
// Shared across all charts/KPIs so we run the O(n) filter scan once per
// (records, filters) pair, not once per consumer.
//
// `exceptCounty` is the same filter with the county dimension released. The
// map and the county effort chart use it so every county stays visible (and
// comparable) while one is selected. When no county is selected it's the
// same array — no second scan.

interface FilteredRecords {
  all: RecordTuple[];
  exceptCounty: RecordTuple[];
}

const FilteredRecordsContext = createContext<FilteredRecords | null>(null);

export function FilteredRecordsProvider({ children }: { children: ReactNode }) {
  const { records } = useLoadedData();
  const { filters } = useFilters();
  const all = useMemo(() => applyFilters(records, filters), [records, filters]);
  const exceptCounty = useMemo(
    () =>
      filters.countyId === null ? all : applyFilters(records, { ...filters, countyId: null }),
    [records, filters, all],
  );
  const value = useMemo(() => ({ all, exceptCounty }), [all, exceptCounty]);
  return (
    <FilteredRecordsContext.Provider value={value}>{children}</FilteredRecordsContext.Provider>
  );
}

function useFilteredCtx(): FilteredRecords {
  const v = useContext(FilteredRecordsContext);
  if (v === null) {
    throw new Error("useFilteredRecords must be used within FilteredRecordsProvider");
  }
  return v;
}

export function useFilteredRecords(): RecordTuple[] {
  return useFilteredCtx().all;
}

/** Records passing every filter except county (for county-comparison views). */
export function useFilteredRecordsExceptCounty(): RecordTuple[] {
  return useFilteredCtx().exceptCounty;
}
