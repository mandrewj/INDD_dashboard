"use client";

import { useId, useMemo } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { useLoadedData } from "@/lib/dataContext";
import { useFilters } from "@/lib/filterContext";
import {
  buildOptionList,
  computeDependentOptions,
  countByField,
} from "@/lib/filtering";
import { FIELD } from "@/lib/types";

export function FilterPanel() {
  const { records, dictionaries } = useLoadedData();
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

  // Counts (unfiltered) — used to annotate option counts.
  const orderCounts = useMemo(() => countByField(records, FIELD.ORDER), [records]);
  const familyCounts = useMemo(() => countByField(records, FIELD.FAMILY), [records]);
  const genusCounts = useMemo(() => countByField(records, FIELD.GENUS), [records]);
  const countyCounts = useMemo(() => countByField(records, FIELD.COUNTY), [records]);

  // Cascade: family options depend on selected order; genus on order+family.
  const dependent = useMemo(
    () => computeDependentOptions(records, filters.orderId, filters.familyId),
    [records, filters.orderId, filters.familyId],
  );

  const orderOptions = useMemo(
    () => buildOptionList(dictionaries.order, orderCounts, null),
    [dictionaries.order, orderCounts],
  );
  const familyOptions = useMemo(
    () => buildOptionList(dictionaries.family, familyCounts, dependent.familyIds),
    [dictionaries.family, familyCounts, dependent.familyIds],
  );
  const genusOptions = useMemo(
    () => buildOptionList(dictionaries.genus, genusCounts, dependent.genusIds),
    [dictionaries.genus, genusCounts, dependent.genusIds],
  );
  const countyOptions = useMemo(
    () => buildOptionList(dictionaries.county, countyCounts, null),
    [dictionaries.county, countyCounts],
  );

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => e.preventDefault()}
      aria-label="Filter occurrences"
    >
      <div className="flex items-center justify-between">
        <h2 className="leaf-rule font-serif text-base font-semibold text-forest-800">
          Filters
        </h2>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md border border-forest-200 bg-cream-50 px-2 py-1 text-xs text-forest-700 hover:bg-cream-100"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Reset
        </button>
      </div>

      <SelectField
        label="Order"
        value={filters.orderId}
        onChange={setOrder}
        options={orderOptions}
        placeholder="All orders"
      />
      <SelectField
        label="Family"
        value={filters.familyId}
        onChange={setFamily}
        options={familyOptions}
        placeholder={
          filters.orderId === null ? "All families" : "All families in order"
        }
      />
      <SelectField
        label="Genus"
        value={filters.genusId}
        onChange={setGenus}
        options={genusOptions}
        placeholder={
          filters.familyId === null ? "All genera" : "All genera in family"
        }
      />
      <SelectField
        label="County"
        value={filters.countyId}
        onChange={setCounty}
        options={countyOptions}
        placeholder="All counties"
        unknownOptionLabel="Unknown / unmapped"
      />

      <YearRangeField
        floor={yearFloor}
        ceil={yearCeil}
        min={filters.yearMin}
        max={filters.yearMax}
        includeNull={filters.includeNullYear}
        onRangeChange={setYearRange}
        onIncludeNullChange={setIncludeNullYear}
      />
    </form>
  );
}

interface Option {
  id: number;
  label: string;
  count: number;
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  unknownOptionLabel,
}: {
  label: string;
  value: number | null;
  onChange: (id: number | null) => void;
  options: Option[];
  placeholder: string;
  unknownOptionLabel?: string;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-moss-600"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value === null ? "" : String(value)}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? null : Number(v));
          }}
          className="w-full appearance-none rounded-md border border-forest-200 bg-cream-50 py-2 pl-3 pr-9 text-sm text-bark-700 hover:border-forest-300 focus:border-forest-500"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => {
            // id 0 in dictionaries is the "__UNKNOWN__" bucket. Show a friendly label.
            const display =
              o.id === 0 && unknownOptionLabel ? unknownOptionLabel : o.label;
            return (
              <option key={o.id} value={o.id}>
                {display} ({o.count.toLocaleString()})
              </option>
            );
          })}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-forest-500"
        />
      </div>
    </div>
  );
}

function YearRangeField({
  floor,
  ceil,
  min,
  max,
  includeNull,
  onRangeChange,
  onIncludeNullChange,
}: {
  floor: number;
  ceil: number;
  min: number;
  max: number;
  includeNull: boolean;
  onRangeChange: (min: number, max: number) => void;
  onIncludeNullChange: (v: boolean) => void;
}) {
  const minId = useId();
  const maxId = useId();
  const includeId = useId();
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-moss-600">
        Year range
      </legend>
      <div className="flex items-center gap-2">
        <label htmlFor={minId} className="sr-only">
          From year
        </label>
        <input
          id={minId}
          type="number"
          min={floor}
          max={ceil}
          value={min}
          step={1}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onRangeChange(v, max);
          }}
          className="w-full rounded-md border border-forest-200 bg-cream-50 px-2 py-1.5 text-sm text-bark-700 tabular-nums hover:border-forest-300 focus:border-forest-500"
        />
        <span className="text-xs text-moss-600">to</span>
        <label htmlFor={maxId} className="sr-only">
          To year
        </label>
        <input
          id={maxId}
          type="number"
          min={floor}
          max={ceil}
          value={max}
          step={1}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onRangeChange(min, v);
          }}
          className="w-full rounded-md border border-forest-200 bg-cream-50 px-2 py-1.5 text-sm text-bark-700 tabular-nums hover:border-forest-300 focus:border-forest-500"
        />
      </div>
      <div className="mt-1 text-[11px] text-moss-600">
        Bounds: {floor}–{ceil}
      </div>
      <label
        htmlFor={includeId}
        className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-bark-700"
      >
        <input
          id={includeId}
          type="checkbox"
          checked={includeNull}
          onChange={(e) => onIncludeNullChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-forest-300 text-forest-600 focus:ring-forest-500"
        />
        Include records with no year
      </label>
    </fieldset>
  );
}
