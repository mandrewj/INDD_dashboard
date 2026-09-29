"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { useLoadedData } from "@/lib/dataContext";
import { useFilteredRecords, useFilters } from "@/lib/filterContext";
import { FIELD } from "@/lib/types";
import { ChartCard } from "./ChartCard";
import { GbifLink } from "./GbifLink";
import { InatLink } from "./InatLink";

interface SpeciesRow {
  speciesId: number;
  orderId: number;
  familyId: number;
  genusId: number;
  speciesName: string;
  familyName: string;
  /** GBIF speciesKey — null if missing (entries fall back to "speciesKey:N" labels). */
  gbifTaxonKey: number | null;
  observations: number;
  counties: number;
  firstYear: number | null;
  lastYear: number | null;
}

type SortKey = "species" | "family" | "observations" | "counties" | "lastYear";
type SortDir = "asc" | "desc";

const PAGE_OPTIONS = [50, 100, 200, "All"] as const;
type PageOption = (typeof PAGE_OPTIONS)[number];

export function TopSpeciesTable() {
  const { dictionaries } = useLoadedData();
  const filtered = useFilteredRecords();
  const { filters, setTaxon } = useFilters();

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sortKey, setSortKey] = useState<SortKey>("observations");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState<PageOption>(50);

  // Aggregate by speciesId. Skip unidentified (id 0).
  const allRows = useMemo<SpeciesRow[]>(() => {
    // Typed arrays indexed by species id (one pass, no per-record Map/Set).
    // Order/family/genus come from each species' first record — the GBIF
    // backbone gives a 1:1 species → family mapping.
    const nSp = dictionaries.species.length;
    const nC = dictionaries.county.length;
    const count = new Int32Array(nSp);
    const nCounties = new Int32Array(nSp);
    const seenCounty = new Uint8Array(nSp * nC);
    const firstYear = new Int32Array(nSp).fill(0x7fffffff);
    const lastYear = new Int32Array(nSp).fill(-1);
    const orderOf = new Int32Array(nSp);
    const familyOf = new Int32Array(nSp);
    const genusOf = new Int32Array(nSp);
    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i]!;
      const sp = r[FIELD.SPECIES];
      if (sp === 0) continue;
      if (count[sp]!++ === 0) {
        orderOf[sp] = r[FIELD.ORDER];
        familyOf[sp] = r[FIELD.FAMILY];
        genusOf[sp] = r[FIELD.GENUS];
      }
      const c = r[FIELD.COUNTY];
      if (c !== 0 && seenCounty[sp * nC + c] === 0) {
        seenCounty[sp * nC + c] = 1;
        nCounties[sp]!++;
      }
      const y = r[FIELD.YEAR];
      if (y !== null) {
        if (y < firstYear[sp]!) firstYear[sp] = y;
        if (y > lastYear[sp]!) lastYear[sp] = y;
      }
    }
    const rows: SpeciesRow[] = [];
    for (let speciesId = 1; speciesId < nSp; speciesId++) {
      if (count[speciesId] === 0) continue;
      const taxonKey = dictionaries.speciesKey[speciesId] ?? null;
      const familyId = familyOf[speciesId]!;
      const hasYear = lastYear[speciesId]! >= 0;
      rows.push({
        speciesId,
        orderId: orderOf[speciesId]!,
        familyId,
        genusId: genusOf[speciesId]!,
        speciesName: dictionaries.species[speciesId] ?? "(unknown)",
        familyName: familyId !== 0 ? (dictionaries.family[familyId] ?? "(unknown)") : "—",
        gbifTaxonKey: typeof taxonKey === "number" && taxonKey > 0 ? taxonKey : null,
        observations: count[speciesId]!,
        counties: nCounties[speciesId]!,
        firstYear: hasYear ? firstYear[speciesId]! : null,
        lastYear: hasYear ? lastYear[speciesId]! : null,
      });
    }
    return rows;
  }, [filtered, dictionaries.species, dictionaries.family, dictionaries.speciesKey, dictionaries.county.length]);

  const filteredRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (q === "") return allRows;
    return allRows.filter(
      (r) =>
        r.speciesName.toLowerCase().includes(q) ||
        r.familyName.toLowerCase().includes(q),
    );
  }, [allRows, deferredSearch]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "species":
          return dir * a.speciesName.localeCompare(b.speciesName);
        case "family":
          return dir * a.familyName.localeCompare(b.familyName);
        case "observations":
          return dir * (a.observations - b.observations);
        case "counties":
          return dir * (a.counties - b.counties);
        case "lastYear": {
          const ay = a.lastYear ?? -Infinity;
          const by = b.lastYear ?? -Infinity;
          return dir * (ay - by);
        }
      }
    });
    return arr;
  }, [filteredRows, sortKey, sortDir]);

  const visibleRows =
    pageSize === "All" ? sortedRows : sortedRows.slice(0, pageSize);

  const totalSpecies = allRows.length;
  const matchingSpecies = filteredRows.length;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Sensible defaults: numeric/year cols sort desc first, text cols asc.
      setSortDir(key === "species" || key === "family" ? "asc" : "desc");
    }
  }

  return (
    <ChartCard
      title="Species list"
      subtitle={
        <>
          {matchingSpecies.toLocaleString()}
          {deferredSearch.trim() !== "" ? (
            <>
              {" "}of {totalSpecies.toLocaleString()} species match “
              <span className="font-medium text-forest-700">{deferredSearch}</span>”
            </>
          ) : (
            <> identified species under the current filters</>
          )}
          . Showing {Math.min(visibleRows.length, matchingSpecies).toLocaleString()}.
        </>
      }
      controls={
        <div className="flex items-center gap-2">
          <SearchInput value={search} onChange={setSearch} />
          <PageSizeSelect value={pageSize} onChange={setPageSize} />
        </div>
      }
      caveat="Each row aggregates filtered records keyed on GBIF speciesKey. Records not identified to species are excluded. Click a name to filter the whole dashboard to that species."
    >
      <div className="max-h-[440px] overflow-auto rounded border border-forest-100">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-forest-200 bg-cream-50 text-left text-[10px] uppercase tracking-wider text-moss-700">
              <th className="px-1.5 py-1.5 font-medium">#</th>
              <Th
                label="Species"
                sortKey="species"
                active={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <Th
                label="Family"
                sortKey="family"
                active={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <Th
                label="Records"
                sortKey="observations"
                active={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <Th
                label="Counties"
                sortKey="counties"
                active={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <Th
                label="Years"
                sortKey="lastYear"
                active={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-moss-700">
                  No species match the current filters and search.
                </td>
              </tr>
            ) : (
              visibleRows.map((r, i) => (
                <tr
                  key={r.speciesId}
                  className="border-b border-forest-100/60 last:border-0 hover:bg-cream-100"
                >
                  <td className="px-1.5 py-1 tabular-nums text-moss-700">
                    {i + 1}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1 font-serif text-bark-700">
                    <span className="inline-flex items-baseline gap-x-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setTaxon(
                            filters.speciesId === r.speciesId
                              ? { orderId: null, familyId: null, genusId: null, speciesId: null }
                              : {
                                  orderId: r.orderId || null,
                                  familyId: r.familyId || null,
                                  genusId: r.genusId || null,
                                  speciesId: r.speciesId,
                                },
                          )
                        }
                        title={`Filter dashboard to ${r.speciesName}`}
                        className="text-left italic underline-offset-2 hover:text-forest-700 hover:underline"
                      >
                        {r.speciesName}
                      </button>
                      {r.gbifTaxonKey !== null ? (
                        <GbifLink
                          taxonKey={r.gbifTaxonKey}
                          speciesName={r.speciesName}
                        />
                      ) : null}
                      <InatLink speciesName={r.speciesName} />
                    </span>
                  </td>
                  <td className="px-1.5 py-1 text-bark-600">{r.familyName}</td>
                  <td className="px-1.5 py-1 text-right tabular-nums text-forest-800">
                    {r.observations.toLocaleString()}
                  </td>
                  <td className="px-1.5 py-1 text-right tabular-nums text-forest-800">
                    {r.counties.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1 text-right tabular-nums text-bark-600">
                    {r.firstYear === null || r.lastYear === null
                      ? "—"
                      : r.firstYear === r.lastYear
                        ? String(r.firstYear)
                        : `${r.firstYear}–${r.lastYear}`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

function Th({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-1.5 py-1.5 font-medium ${align === "right" ? "text-right" : ""}`}
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-forest-700 ${
          isActive ? "text-forest-800" : "text-moss-700"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        {isActive ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-forest-500"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search species or family"
        aria-label="Search species or family"
        className="w-44 rounded-md border border-forest-200 bg-cream-50 py-1.5 pl-7 pr-2 text-xs text-bark-700 hover:border-forest-300 focus:border-forest-500"
      />
    </div>
  );
}

function PageSizeSelect({
  value,
  onChange,
}: {
  value: PageOption;
  onChange: (v: PageOption) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-moss-700">
      <span className="sr-only">Rows shown</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "All" ? "All" : (Number(v) as PageOption));
        }}
        className="rounded-md border border-forest-200 bg-cream-50 py-1.5 pl-2 pr-7 text-xs text-bark-700 hover:border-forest-300 focus:border-forest-500"
      >
        {PAGE_OPTIONS.map((opt) => (
          <option key={String(opt)} value={String(opt)}>
            Top {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
