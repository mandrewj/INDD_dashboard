"use client";

import { useMemo } from "react";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { useLoadedData } from "@/lib/dataContext";
import { useFilteredRecords } from "@/lib/filterContext";
import { FIELD } from "@/lib/types";
import { ChartCard } from "./ChartCard";

// Okabe-Ito (colorblind-safe) — assigned to top orders by frequency.
const OKABE_ITO = [
  "#0072B2", // blue
  "#E69F00", // orange
  "#009E73", // green
  "#CC79A7", // purple
  "#56B4E9", // sky blue
  "#D55E00", // vermillion
  "#F0E442", // yellow
  "#000000", // black
] as const;
const OTHER_COLOR = "#8E8676"; // muted bark

const TOP_ORDERS = 10;
const TOP_FAMILIES_PER_ORDER = 6;

interface FamilyLeaf {
  name: string;
  size: number;
  color: string;
  orderName: string;
  pct: number; // of all records on the chart
}

interface OrderNode {
  name: string;
  color: string;
  total: number;
  children: FamilyLeaf[];
}

export function TaxonomicComposition() {
  const { dictionaries } = useLoadedData();
  const filtered = useFilteredRecords();

  const { tree, totalShown, totalAll, ordersOmitted, familiesOmitted } =
    useMemo(() => buildTree(filtered, dictionaries), [filtered, dictionaries]);

  return (
    <ChartCard
      title="Taxonomic composition"
      subtitle={
        <>
          {totalShown.toLocaleString()} of {totalAll.toLocaleString()} records
          {" "}grouped by order → family. Top {TOP_ORDERS} orders shown; smaller
          orders pooled into <span className="text-bark-500">Other orders</span>.
        </>
      }
      caveat={
        ordersOmitted > 0 || familiesOmitted > 0
          ? `Pooled into "Other": ${ordersOmitted.toLocaleString()} orders beyond the top ${TOP_ORDERS}, and within each order any families beyond the top ${TOP_FAMILIES_PER_ORDER}.`
          : "All orders and families fit; nothing was pooled."
      }
    >
      <div
        className="h-[420px] w-full"
        role="img"
        aria-label={`Treemap of insect records partitioned by taxonomic order then family. Top order: ${tree[0]?.name ?? "—"}.`}
      >
        {tree.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={tree.map((order) => ({
                name: order.name,
                children: order.children.map((c) => ({
                  name: c.name,
                  size: c.size,
                  fill: c.color,
                  orderName: c.orderName,
                  pct: c.pct,
                })),
              }))}
              dataKey="size"
              isAnimationActive={false}
              stroke="#FFFFFF"
              content={<TreemapCell />}
            >
              <Tooltip content={<TreemapTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        )}
      </div>

      <Legend tree={tree} />
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------

interface DictBundle {
  order: readonly string[];
  family: readonly string[];
}

function buildTree(
  records: ReadonlyArray<readonly (number | null)[]>,
  dictionaries: DictBundle,
): {
  tree: OrderNode[];
  totalShown: number;
  totalAll: number;
  ordersOmitted: number;
  familiesOmitted: number;
} {
  // Order id → (family id → count)
  const byOrder = new Map<number, Map<number, number>>();
  let totalAll = 0;
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    const oId = r[FIELD.ORDER] as number;
    const fId = r[FIELD.FAMILY] as number;
    if (oId === 0) continue; // skip uncategorized order
    totalAll++;
    let m = byOrder.get(oId);
    if (!m) {
      m = new Map<number, number>();
      byOrder.set(oId, m);
    }
    m.set(fId, (m.get(fId) ?? 0) + 1);
  }

  // Sort orders by total descending, take top N
  const orderTotals = [...byOrder.entries()]
    .map(([oId, fams]) => {
      let t = 0;
      for (const v of fams.values()) t += v;
      return { oId, total: t, fams };
    })
    .sort((a, b) => b.total - a.total);

  const top = orderTotals.slice(0, TOP_ORDERS);
  const rest = orderTotals.slice(TOP_ORDERS);
  const ordersOmitted = rest.length;
  const restTotal = rest.reduce((s, r) => s + r.total, 0);

  let totalShown = 0;
  let familiesOmitted = 0;

  const tree: OrderNode[] = top.map((entry, idx) => {
    const orderName = dictionaries.order[entry.oId] ?? "(unknown)";
    const baseColor = OKABE_ITO[idx % OKABE_ITO.length] ?? OTHER_COLOR;

    const fams = [...entry.fams.entries()]
      .map(([fId, n]) => ({
        fId,
        name:
          fId === 0
            ? `${orderName} (unknown family)`
            : (dictionaries.family[fId] ?? "(unknown)"),
        n,
      }))
      .sort((a, b) => b.n - a.n);

    const topFams = fams.slice(0, TOP_FAMILIES_PER_ORDER);
    const restFams = fams.slice(TOP_FAMILIES_PER_ORDER);
    if (restFams.length > 0) familiesOmitted += restFams.length;
    const restFamTotal = restFams.reduce((s, f) => s + f.n, 0);

    const children: FamilyLeaf[] = topFams.map((f, j) => ({
      name: f.name,
      size: f.n,
      color: lighten(baseColor, j / Math.max(1, TOP_FAMILIES_PER_ORDER) * 0.45),
      orderName,
      pct: 0, // assigned after totalShown known
    }));
    if (restFamTotal > 0) {
      children.push({
        name: `Other ${orderName.toLowerCase()} families`,
        size: restFamTotal,
        color: lighten(baseColor, 0.55),
        orderName,
        pct: 0,
      });
    }

    const orderTotal = entry.total;
    totalShown += orderTotal;

    return {
      name: orderName,
      color: baseColor,
      total: orderTotal,
      children,
    };
  });

  if (restTotal > 0) {
    totalShown += restTotal;
    tree.push({
      name: "Other orders",
      color: OTHER_COLOR,
      total: restTotal,
      children: [
        {
          name: `${ordersOmitted} smaller orders`,
          size: restTotal,
          color: OTHER_COLOR,
          orderName: "Other orders",
          pct: 0,
        },
      ],
    });
  }

  // Backfill pct on each leaf
  for (const order of tree) {
    for (const leaf of order.children) {
      leaf.pct = totalShown > 0 ? (100 * leaf.size) / totalShown : 0;
    }
  }

  return { tree, totalShown, totalAll, ordersOmitted, familiesOmitted };
}

// ---------------------------------------------------------------------------

interface TreemapCellPayload {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  fill?: string;
  size?: number;
  orderName?: string;
  pct?: number;
  depth?: number;
  index?: number;
  root?: { children?: Array<{ name?: string; children?: unknown[] }> };
}

function TreemapCell(props: unknown) {
  const p = props as TreemapCellPayload;
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const width = p.width ?? 0;
  const height = p.height ?? 0;

  // Recharts calls this for every node (root, branch, leaf). We only want
  // visual rectangles for leaves (depth >= 2).
  const depth = p.depth ?? 0;
  const isLeaf = depth >= 2;
  if (!isLeaf) {
    // Render a transparent rect so children paint on top, but draw the order
    // label if there's room and we're at depth 1 (an order).
    if (depth === 1) {
      return (
        <g>
          <rect x={x} y={y} width={width} height={height} fill="transparent" stroke="#FFFFFF" strokeWidth={2} />
          {width > 80 && height > 24 ? (
            <text
              x={x + 6}
              y={y + 14}
              fill="#080808"
              fontSize={11}
              fontWeight={600}
              style={{ pointerEvents: "none" }}
            >
              {p.name}
            </text>
          ) : null}
        </g>
      );
    }
    return <g />;
  }

  const fill = p.fill ?? "#888";
  const labelColor = textColorOn(fill);
  const showLabel = width > 60 && height > 28;
  const showCount = width > 90 && height > 44;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="#FFFFFF"
        strokeWidth={1}
      />
      {showLabel ? (
        <text
          x={x + 6}
          y={y + 14}
          fill={labelColor}
          fontSize={10}
          style={{ pointerEvents: "none" }}
        >
          {truncate(p.name ?? "", Math.floor(width / 6))}
        </text>
      ) : null}
      {showCount ? (
        <text
          x={x + 6}
          y={y + 28}
          fill={labelColor}
          fontSize={10}
          style={{ pointerEvents: "none", opacity: 0.85 }}
        >
          {(p.size ?? 0).toLocaleString()}
        </text>
      ) : null}
    </g>
  );
}

interface TooltipPayload {
  payload?: TreemapCellPayload;
}

function TreemapTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p || p.depth !== 2) return null;
  return (
    <div className="rounded-md border border-forest-200 bg-cream-50 p-3 text-xs text-bark-700 shadow-leaf">
      <div className="text-[10px] uppercase tracking-wider text-moss-600">
        {p.orderName}
      </div>
      <div className="mt-0.5 font-serif text-sm font-semibold text-forest-800">
        {p.name}
      </div>
      <div className="mt-1 tabular-nums">
        {(p.size ?? 0).toLocaleString()} records
        <span className="ml-2 text-moss-600">({(p.pct ?? 0).toFixed(1)}%)</span>
      </div>
    </div>
  );
}

function Legend({ tree }: { tree: OrderNode[] }) {
  if (tree.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-bark-700">
      {tree.map((o) => (
        <div key={o.name} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-sm"
            style={{ background: o.color }}
          />
          <span>{o.name}</span>
          <span className="text-moss-600 tabular-nums">{o.total.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-forest-200 bg-cream-50 text-sm text-moss-700">
      No records match the current filters.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color helpers

/** Lighten a hex/css color toward cream. amount in [0,1]. */
function lighten(color: string, amount: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const target = [251, 248, 241]; // cream-50
  const t = Math.max(0, Math.min(1, amount));
  const out = [
    Math.round(rgb[0] + (target[0]! - rgb[0]) * t),
    Math.round(rgb[1] + (target[1]! - rgb[1]) * t),
    Math.round(rgb[2] + (target[2]! - rgb[2]) * t),
  ];
  return `rgb(${out[0]}, ${out[1]}, ${out[2]})`;
}

function parseColor(c: string): [number, number, number] | null {
  if (c.startsWith("#")) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0]! + hex[0]!, 16),
        parseInt(hex[1]! + hex[1]!, 16),
        parseInt(hex[2]! + hex[2]!, 16),
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }
  const m = c.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function textColorOn(bg: string): string {
  const rgb = parseColor(bg);
  if (!rgb) return "#080808";
  // WCAG luminance approximation
  const [r, g, b] = rgb;
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? "#080808" : "#FFFFFF";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return "…";
  return s.slice(0, max - 1) + "…";
}
