"use client";

import { useMemo, useState } from "react";
import { useLoadedData } from "@/lib/dataContext";
import { useFilteredRecords, useFilters } from "@/lib/filterContext";
import { viridis } from "@/lib/colorscale";
import { FIELD, type Dictionaries } from "@/lib/types";
import { ChartCard } from "./ChartCard";

type Mode = "orders" | "families" | "species";
type Norm = "row" | "absolute";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const TOP_ORDERS = 14;
const TOP_DRILLDOWN = 10;

interface HeatRow {
  /** Stable id for keys (group dictionary id, or -1 for the parent row). */
  id: number;
  label: string;
  italic: boolean;
  /** True when this row is an aggregate "All <parent>" header row. */
  isParent: boolean;
  monthly: number[];
  total: number;
  rowMax: number;
}

export function SeasonalityHeatmap() {
  const { dictionaries } = useLoadedData();
  const { filters } = useFilters();
  const filtered = useFilteredRecords();
  const [norm, setNorm] = useState<Norm>("row");
  const [hovered, setHovered] = useState<{ row: string; month: number; n: number } | null>(null);

  const view = useMemo(
    () => deriveView(filters, dictionaries),
    [filters, dictionaries],
  );

  const { rows, totalShown, missingMonth, missingMonthForShown, absoluteMax } =
    useMemo(
      () => buildRows(filtered, view, dictionaries),
      [filtered, view, dictionaries],
    );

  return (
    <ChartCard
      title={`Seasonality${view.titleSuffix}`}
      subtitle={
        <>
          {totalShown.toLocaleString()} records across {dataRowCount(rows)}{" "}
          {view.rowNoun}, broken down by collection month.
          {view.subtitleHint ? <> {view.subtitleHint}</> : null}
        </>
      }
      controls={<NormToggle value={norm} onChange={setNorm} />}
      caveat={
        <>
          {missingMonth > 0
            ? `${missingMonth.toLocaleString()} record${missingMonth === 1 ? "" : "s"} have a year but no month and aren't represented (≈ ${missingMonthForShown.toLocaleString()} attributable to the rows shown).`
            : "All filtered records placed in a month."}
          {" "}
          {norm === "row"
            ? "Per-row mode: each row is normalized to its own peak — useful for comparing the seasonal shape of groups of very different sizes."
            : "Absolute mode: every cell uses the same scale — useful for comparing magnitude across rows."}
        </>
      }
    >
      <div
        role="img"
        aria-label={`Heatmap of monthly insect record counts for ${dataRowCount(rows)} ${view.rowNoun}, ${norm === "row" ? "row-normalized" : "with shared color scale"}.`}
      >
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <Grid rows={rows} norm={norm} absoluteMax={absoluteMax} onHover={setHovered} />
        )}
      </div>

      {hovered ? (
        <div
          role="tooltip"
          className="mt-3 inline-flex items-baseline gap-2 rounded-md border border-forest-200 bg-cream-50 px-3 py-1.5 text-xs text-bark-700"
        >
          <span className="font-serif text-sm font-semibold text-forest-800">
            {hovered.row}
          </span>
          <span className="text-moss-700">{MONTHS[hovered.month]}</span>
          <span className="tabular-nums">{hovered.n.toLocaleString()} records</span>
        </div>
      ) : null}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Mode resolution

interface ViewSpec {
  mode: Mode;
  /** Field on RecordTuple to group rows by. */
  groupField: typeof FIELD.ORDER | typeof FIELD.FAMILY | typeof FIELD.SPECIES;
  /** Dictionary used to resolve group-id → label. */
  groupLabels: readonly string[];
  /** Italicize labels (binomial-nomenclature convention for species). */
  italicLabels: boolean;
  /** Max number of rows shown (excluding any parent row). */
  topN: number;
  /** When non-null, prepend an aggregate "All <parent>" row. */
  parentLabel: string | null;
  /** Suffix for the chart title (e.g. " · Coleoptera"). */
  titleSuffix: string;
  /** Singular noun for "rows": "orders", "families", "species". */
  rowNoun: string;
  /** Additional subtitle hint about the drill-down. */
  subtitleHint: string | null;
}

function deriveView(
  filters: { orderId: number | null; familyId: number | null; genusId: number | null },
  dictionaries: Dictionaries,
): ViewSpec {
  // Most-specific filter wins.
  if (filters.genusId !== null) {
    const genusName = dictionaries.genus[filters.genusId] ?? "(unknown)";
    return {
      mode: "species",
      groupField: FIELD.SPECIES,
      groupLabels: dictionaries.species,
      italicLabels: true,
      topN: TOP_DRILLDOWN,
      parentLabel: null,
      titleSuffix: ` · ${genusName}`,
      rowNoun: "species",
      subtitleHint: `Top ${TOP_DRILLDOWN} species in genus ${genusName}.`,
    };
  }
  if (filters.familyId !== null) {
    const familyName = dictionaries.family[filters.familyId] ?? "(unknown)";
    return {
      mode: "species",
      groupField: FIELD.SPECIES,
      groupLabels: dictionaries.species,
      italicLabels: true,
      topN: TOP_DRILLDOWN,
      parentLabel: null,
      titleSuffix: ` · ${familyName}`,
      rowNoun: "species",
      subtitleHint: `Top ${TOP_DRILLDOWN} species in family ${familyName}.`,
    };
  }
  if (filters.orderId !== null) {
    const orderName = dictionaries.order[filters.orderId] ?? "(unknown)";
    return {
      mode: "families",
      groupField: FIELD.FAMILY,
      groupLabels: dictionaries.family,
      italicLabels: false,
      topN: TOP_DRILLDOWN,
      parentLabel: orderName,
      titleSuffix: ` · ${orderName}`,
      rowNoun: "families",
      subtitleHint: `Top ${TOP_DRILLDOWN} families in order ${orderName}.`,
    };
  }
  return {
    mode: "orders",
    groupField: FIELD.ORDER,
    groupLabels: dictionaries.order,
    italicLabels: false,
    topN: TOP_ORDERS,
    parentLabel: null,
    titleSuffix: "",
    rowNoun: "orders",
    subtitleHint: null,
  };
}

// ---------------------------------------------------------------------------
// Aggregation

function buildRows(
  filtered: ReadonlyArray<readonly (number | null)[]>,
  view: ViewSpec,
  dictionaries: Dictionaries,
): {
  rows: HeatRow[];
  totalShown: number;
  missingMonth: number;
  missingMonthForShown: number;
  absoluteMax: number;
} {
  const byGroup = new Map<number, number[]>();
  const parentMonthly: number[] | null =
    view.parentLabel !== null ? new Array(12).fill(0) : null;
  let parentTotal = 0;
  let totalRecordsCounted = 0;
  let totalMissingMonth = 0;

  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i]!;
    const oId = r[FIELD.ORDER] as number;
    if (oId === 0) continue; // skip records with no order regardless of mode
    totalRecordsCounted++;
    const m = r[FIELD.MONTH] as number | null;
    if (m === null) totalMissingMonth++;

    if (parentMonthly !== null) {
      parentTotal++;
      if (m !== null) parentMonthly[m - 1] = (parentMonthly[m - 1] ?? 0) + 1;
    }

    const groupId = r[view.groupField] as number;
    if (groupId === 0) continue; // skip rows for the unidentified bucket

    let arr = byGroup.get(groupId);
    if (!arr) {
      arr = new Array(12).fill(0);
      byGroup.set(groupId, arr);
    }
    if (m !== null) arr[m - 1] = (arr[m - 1] ?? 0) + 1;
  }

  const dataRows: HeatRow[] = [];
  for (const [id, monthly] of byGroup) {
    let total = 0;
    let rowMax = 0;
    for (const v of monthly) {
      total += v;
      if (v > rowMax) rowMax = v;
    }
    dataRows.push({
      id,
      label: view.groupLabels[id] ?? "(unknown)",
      italic: view.italicLabels,
      isParent: false,
      monthly,
      total,
      rowMax,
    });
  }
  dataRows.sort((a, b) => b.total - a.total);
  const top = dataRows.slice(0, view.topN);

  const rows: HeatRow[] = [];
  if (parentMonthly !== null && view.parentLabel !== null && parentTotal > 0) {
    let rowMax = 0;
    for (const v of parentMonthly) if (v > rowMax) rowMax = v;
    rows.push({
      id: -1,
      label: `All ${view.parentLabel}`,
      italic: false,
      isParent: true,
      monthly: parentMonthly,
      total: parentTotal,
      rowMax,
    });
  }
  for (const r of top) rows.push(r);

  // For row-normalized rendering we use rowMax per row; for absolute we need
  // the global max across the *data* rows (not the parent, which would
  // dominate the scale and wash everything else out).
  let absoluteMax = 0;
  for (const r of rows) {
    if (r.isParent) continue;
    if (r.rowMax > absoluteMax) absoluteMax = r.rowMax;
  }
  // Fallback: if the only row is a parent (no children), use it.
  if (absoluteMax === 0) {
    for (const r of rows) {
      if (r.rowMax > absoluteMax) absoluteMax = r.rowMax;
    }
  }

  const totalShown = top.reduce((s, r) => s + r.total, 0);
  const missingMonthForShown =
    totalRecordsCounted > 0
      ? Math.round((totalMissingMonth * totalShown) / totalRecordsCounted)
      : 0;

  // Reference dictionaries to keep TS happy when none of the labels are used
  // outside groupLabels (just a noop access).
  void dictionaries;

  return {
    rows,
    totalShown,
    missingMonth: totalMissingMonth,
    missingMonthForShown,
    absoluteMax,
  };
}

function dataRowCount(rows: readonly HeatRow[]): number {
  let n = 0;
  for (const r of rows) if (!r.isParent) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Rendering

const ROW_LABEL_W = 140;
const COL_W = 46;
const ROW_H = 28;
const TOP_LABEL_H = 22;
const PARENT_GAP = 6;

function Grid({
  rows,
  norm,
  absoluteMax,
  onHover,
}: {
  rows: HeatRow[];
  norm: Norm;
  absoluteMax: number;
  onHover: (h: { row: string; month: number; n: number } | null) => void;
}) {
  const hasParent = rows.length > 0 && rows[0]!.isParent;
  const dataRowsCount = hasParent ? rows.length - 1 : rows.length;
  const height =
    TOP_LABEL_H +
    ROW_H * rows.length +
    (hasParent ? PARENT_GAP : 0) +
    4;
  const width = ROW_LABEL_W + COL_W * 12 + 8;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ minWidth: width, maxWidth: 760 }}
      >
        {/* Month labels */}
        {MONTHS.map((m, i) => (
          <text
            key={m}
            x={ROW_LABEL_W + COL_W * i + COL_W / 2}
            y={TOP_LABEL_H - 6}
            fontSize={10}
            fill="#5f6360"
            textAnchor="middle"
          >
            {m}
          </text>
        ))}

        {rows.map((row, rIdx) => {
          const denom = norm === "row" ? row.rowMax : absoluteMax;
          const yOffset =
            TOP_LABEL_H +
            ROW_H * rIdx +
            (hasParent && rIdx > 0 ? PARENT_GAP : 0);
          return (
            <g key={`${row.isParent ? "P" : "D"}-${row.id}`} transform={`translate(0, ${yOffset})`}>
              {/* Row label */}
              <text
                x={ROW_LABEL_W - 8}
                y={ROW_H / 2 + 3}
                fontSize={11}
                fill={row.isParent ? "#080808" : "#080808"}
                fontWeight={row.isParent ? 700 : 400}
                fontStyle={row.italic ? "italic" : "normal"}
                textAnchor="end"
              >
                {truncateLabel(row.label, 22)}
              </text>
              <text
                x={ROW_LABEL_W - 8}
                y={ROW_H / 2 + 16}
                fontSize={9}
                fill="#5f6360"
                textAnchor="end"
              >
                {row.total.toLocaleString()}
              </text>

              {row.monthly.map((n, mIdx) => {
                const t = denom > 0 ? n / denom : 0;
                const fill = n === 0 ? "#F1F3F5" : viridis(t);
                return (
                  <rect
                    key={mIdx}
                    x={ROW_LABEL_W + COL_W * mIdx + 1}
                    y={1}
                    width={COL_W - 2}
                    height={ROW_H - 4}
                    rx={2}
                    fill={fill}
                    stroke={row.isParent ? "#080808" : "#FFFFFF"}
                    strokeWidth={row.isParent ? 1 : 1}
                    onMouseEnter={() => onHover({ row: row.label, month: mIdx, n })}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover({ row: row.label, month: mIdx, n })}
                    onBlur={() => onHover(null)}
                    tabIndex={0}
                    role="img"
                    aria-label={`${row.label} in ${MONTHS[mIdx]}: ${n.toLocaleString()} records`}
                    style={{ cursor: "default", outline: "none" }}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Caption stripe under parent row */}
        {hasParent ? (
          <line
            x1={0}
            x2={width}
            y1={TOP_LABEL_H + ROW_H + PARENT_GAP / 2}
            y2={TOP_LABEL_H + ROW_H + PARENT_GAP / 2}
            stroke="#E5E7EB"
            strokeWidth={1}
          />
        ) : null}

        {dataRowsCount === 0 && hasParent ? (
          <text
            x={ROW_LABEL_W + (COL_W * 12) / 2}
            y={TOP_LABEL_H + ROW_H + PARENT_GAP + ROW_H / 2}
            fontSize={11}
            fill="#5f6360"
            textAnchor="middle"
          >
            No records below this group are identified to a finer rank.
          </text>
        ) : null}
      </svg>
    </div>
  );
}

function NormToggle({ value, onChange }: { value: Norm; onChange: (v: Norm) => void }) {
  return (
    <div
      role="group"
      aria-label="Heatmap normalization"
      className="inline-flex overflow-hidden rounded-md border border-forest-200 bg-cream-50 text-xs"
    >
      {(["row", "absolute"] as const).map((m) => {
        const active = m === value;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={active}
            className={
              active
                ? "bg-forest-600 px-3 py-1.5 font-medium text-cream-50"
                : "bg-transparent px-3 py-1.5 text-forest-700 hover:bg-cream-200"
            }
          >
            {m === "row" ? "Per-row" : "Absolute"}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-forest-200 bg-cream-50 text-sm text-moss-700">
      No records match the current filters.
    </div>
  );
}

function truncateLabel(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return "…";
  return s.slice(0, max - 1) + "…";
}
