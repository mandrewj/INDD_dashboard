"use client";

import { memo, useDeferredValue, useId, useMemo, useState } from "react";
import { Check, ChevronDown, Link2, RotateCcw } from "lucide-react";
import { useLoadedData } from "@/lib/dataContext";
import { useFilterControls } from "@/lib/filterContext";
import { shareUrl } from "@/lib/embed";
import { isFilterActive } from "@/lib/filtering";
import { getTaxonIndex, optionsFor, type Option } from "@/lib/taxonIndex";

/**
 * One-row filter bar (wraps on narrow screens). Sticky at the top of the
 * iframe so filters stay reachable while scrolling through the charts, and
 * leaves the full width for charts — the embed on insectid.org is ~1200px.
 */
export function FilterBar() {
  const { records, dictionaries } = useLoadedData();
  const {
    filters,
    yearFloor,
    yearCeil,
    params,
    setOrder,
    setFamily,
    setGenus,
    setSpecies,
    setCounty,
    setYearRange,
    setIncludeNullYear,
    reset,
    isUpdating,
  } = useFilterControls();

  // Built once per data load: taxon hierarchy, counts, label-sorted ids.
  const idx = useMemo(() => getTaxonIndex(records, dictionaries), [records, dictionaries]);
  const { orderId, familyId, genusId, speciesId } = filters;

  const orderOptions = useMemo(
    () => optionsFor(idx.sorted.order, dictionaries.order, idx.counts.order, null),
    [idx, dictionaries.order],
  );
  // Cascade: families under the order; genera under the family (or order).
  const familyOptions = useMemo(() => {
    const allowed = orderId === null ? null : new Set(idx.familiesByOrder.get(orderId) ?? []);
    return optionsFor(idx.sorted.family, dictionaries.family, idx.counts.family, allowed);
  }, [idx, dictionaries.family, orderId]);
  const genusOptions = useMemo(() => {
    let allowed: Set<number> | null = null;
    if (familyId !== null) {
      allowed = new Set(idx.generaByFamily.get(familyId) ?? []);
      if (orderId !== null) {
        const inOrder = new Set(idx.generaByOrder.get(orderId) ?? []);
        for (const g of allowed) if (!inOrder.has(g)) allowed.delete(g);
      }
    } else if (orderId !== null) {
      allowed = new Set(idx.generaByOrder.get(orderId) ?? []);
    }
    return optionsFor(idx.sorted.genus, dictionaries.genus, idx.counts.genus, allowed);
  }, [idx, dictionaries.genus, orderId, familyId]);
  const speciesOptions = useMemo(() => {
    if (genusId === null && speciesId === null) return [];
    const allowed = new Set(genusId === null ? [] : (idx.speciesByGenus.get(genusId) ?? []));
    // A species reached by deep link / table click may sit outside the genus
    // cascade (records without a genus): keep it listed.
    if (speciesId !== null) allowed.add(speciesId);
    return optionsFor(idx.sorted.species, dictionaries.species, idx.counts.species, allowed);
  }, [idx, dictionaries.species, genusId, speciesId]);
  const countyOptions = useMemo(() => {
    const list = optionsFor(idx.sorted.county, dictionaries.county, idx.counts.county, null);
    // Records with no derivable county (reachable from the map's caveat link).
    list.push({ id: 0, label: "Unknown / unmapped", count: idx.counts.county[0] ?? 0 });
    return list;
  }, [idx, dictionaries.county]);

  // Long option lists (thousands of genera/species) are rebuilt in the
  // background: the chosen value shows immediately; the lists catch up.
  const familyList = useDeferredValue(familyOptions);
  const genusList = useDeferredValue(genusOptions);
  const speciesList = useDeferredValue(speciesOptions);

  const active = isFilterActive(filters, yearFloor, yearCeil);
  const showSpecies = filters.genusId !== null || filters.speciesId !== null;

  return (
    <form
      className="flex flex-wrap items-end gap-x-3 gap-y-2"
      onSubmit={(e) => e.preventDefault()}
      aria-label="Filter occurrences"
    >
      <SelectField label="Order" value={filters.orderId} onChange={setOrder} options={orderOptions} placeholder="All orders" />
      <SelectField
        label="Family"
        value={filters.familyId}
        onChange={setFamily}
        options={familyList}
        placeholder="All families"
      />
      <SelectField label="Genus" value={filters.genusId} onChange={setGenus} options={genusList} placeholder="All genera" />
      {showSpecies ? (
        <SelectField
          label="Species"
          value={filters.speciesId}
          onChange={setSpecies}
          options={speciesList}
          placeholder="All species"
        />
      ) : null}
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
      <div className="ml-auto flex items-center gap-2 pb-0.5">
        <span
          aria-live="polite"
          className={`text-[11px] text-moss-600 transition-opacity ${isUpdating ? "opacity-100" : "opacity-0"}`}
        >
          {isUpdating ? "Updating…" : ""}
        </span>
        {active ? (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-md border border-forest-200 bg-cream-50 px-2 py-1 text-xs text-forest-700 hover:bg-cream-100"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Reset
          </button>
        ) : null}
        <CopyLink url={() => shareUrl(params)} />
      </div>
    </form>
  );
}

// Memoized: a filter change re-renders only the dropdowns whose options or
// value changed (the genus list alone can hold thousands of <option>s).
const SelectField = memo(function SelectField({
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
  const on = value !== null;
  return (
    <div className="min-w-[8.5rem] flex-1 basis-[8.5rem] lg:max-w-[12rem]">
      <label htmlFor={id} className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-moss-600">
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
          className={`w-full appearance-none rounded-md border py-1.5 pl-2 pr-7 text-xs hover:border-forest-300 focus:border-forest-500 ${
            on ? "border-forest-400 bg-forest-50 font-medium text-forest-800" : "border-forest-200 bg-cream-50 text-bark-700"
          }`}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => {
            const display = o.id === 0 && unknownOptionLabel ? unknownOptionLabel : o.label;
            return (
              <option key={o.id} value={o.id}>
                {display} ({o.count.toLocaleString()})
              </option>
            );
          })}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-forest-500" />
      </div>
    </div>
  );
});

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
  const input =
    "w-[4.5rem] rounded-md border border-forest-200 bg-cream-50 px-1.5 py-1.5 text-xs text-bark-700 tabular-nums hover:border-forest-300 focus:border-forest-500";
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-moss-600">Years</legend>
      <div className="flex items-center gap-1.5">
        <label htmlFor={minId} className="sr-only">From year</label>
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
          className={input}
        />
        <span className="text-xs text-moss-600">–</span>
        <label htmlFor={maxId} className="sr-only">To year</label>
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
          className={input}
        />
        <label htmlFor={includeId} className="ml-1 inline-flex cursor-pointer items-center gap-1 text-[11px] text-bark-700" title="Include records with no year">
          <input
            id={includeId}
            type="checkbox"
            checked={includeNull}
            onChange={(e) => onIncludeNullChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-forest-300 text-forest-600 focus:ring-forest-500"
          />
          undated
        </label>
      </div>
    </fieldset>
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
          // clipboard-write permission; fall back to execCommand.
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
      className="inline-flex items-center gap-1.5 rounded-md border border-forest-200 bg-cream-50 px-2 py-1 text-xs text-forest-700 hover:bg-cream-100"
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
