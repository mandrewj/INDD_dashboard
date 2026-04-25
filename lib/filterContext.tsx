"use client";

import {
  createContext,
  useCallback,
  useContext,
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
import type { RecordTuple } from "./types";

interface FilterContextValue {
  filters: FilterState;
  yearFloor: number;
  yearCeil: number;
  setOrder: (id: number | null) => void;
  setFamily: (id: number | null) => void;
  setGenus: (id: number | null) => void;
  setCounty: (id: number | null) => void;
  setYearRange: (min: number, max: number) => void;
  setIncludeNullYear: (v: boolean) => void;
  reset: () => void;
}

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
  const [filters, setFilters] = useState<FilterState>(() =>
    createInitialFilterState(yearFloor, yearCeil),
  );

  const setOrder = useCallback((orderId: number | null) => {
    // Changing order resets dependent taxa.
    setFilters((f) => ({ ...f, orderId, familyId: null, genusId: null }));
  }, []);
  const setFamily = useCallback((familyId: number | null) => {
    setFilters((f) => ({ ...f, familyId, genusId: null }));
  }, []);
  const setGenus = useCallback((genusId: number | null) => {
    setFilters((f) => ({ ...f, genusId }));
  }, []);
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

  const value = useMemo<FilterContextValue>(
    () => ({
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
    }),
    [
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
    ],
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (ctx === null) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}

// ---- Filtered-records context ---------------------------------------------
// Shared across all charts/KPIs so we run the O(n) filter scan once per
// (records, filters) pair, not once per consumer.

const FilteredRecordsContext = createContext<RecordTuple[] | null>(null);

export function FilteredRecordsProvider({ children }: { children: ReactNode }) {
  const { records } = useLoadedData();
  const { filters } = useFilters();
  const filtered = useMemo(
    () => applyFilters(records, filters),
    [records, filters],
  );
  return (
    <FilteredRecordsContext.Provider value={filtered}>
      {children}
    </FilteredRecordsContext.Provider>
  );
}

export function useFilteredRecords(): RecordTuple[] {
  const v = useContext(FilteredRecordsContext);
  if (v === null) {
    throw new Error("useFilteredRecords must be used within FilteredRecordsProvider");
  }
  return v;
}
