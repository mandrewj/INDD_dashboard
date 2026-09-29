"use client";

import { useRef, useState, type ReactNode } from "react";
import { ImageDown, Loader2 } from "lucide-react";
import { exportFigure, slugify } from "@/lib/figureExport";
import { shareUrl } from "@/lib/embed";
import { useFilters } from "@/lib/filterContext";
import { scopeText, useScope } from "@/lib/scope";

export interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  controls?: ReactNode;
  /** Surface text describing data gaps or caveats that affect this chart. */
  caveat?: ReactNode;
  /**
   * Collapsible "How to read this" notes — what the chart shows, how it's
   * computed, and questions to ask of it. Written for classroom/workshop use.
   */
  explainer?: ReactNode;
  /** The view compares all counties, so the county filter doesn't apply. */
  ignoreCounty?: boolean;
  /** Extra text for exported captions (defaults to the subtitle's text). */
  exportCaption?: string;
  className?: string;
  children: ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  controls,
  caveat,
  explainer,
  ignoreCounty = false,
  exportCaption,
  className = "",
  children,
}: ChartCardProps) {
  const id = `chart-${slug(title)}`;
  const scope = useScope(ignoreCounty);
  const figureRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  return (
    <section id={slug(title)} aria-labelledby={id} className={`nature-card flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <header className="mb-2">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0">
            <h3 id={id} className="font-serif text-base font-semibold leading-tight text-forest-800 sm:text-lg">
              {title}
            </h3>
            <p className="mt-0.5 text-[11px] text-moss-600">
              <span className="rounded bg-forest-50 px-1.5 py-0.5 font-medium text-forest-800">
                {scope.taxon}
              </span>{" "}
              · {scope.place}
              {scope.years ? ` · ${scope.years}` : ""}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            {controls}
            <ExportButton
              figureRef={figureRef}
              meta={() => ({
                title,
                scope: scopeText(scope),
                caption: exportCaption ?? subtitleRef.current?.textContent ?? "",
              })}
            />
          </div>
        </div>
        {subtitle ? (
          <p ref={subtitleRef} className="mt-1.5 text-xs text-moss-700">
            {subtitle}
          </p>
        ) : null}
      </header>

      <div ref={figureRef} className="min-w-0 flex-1 bg-cream-50">
        {children}
      </div>

      {caveat || explainer ? (
        <div className="mt-3 border-t border-forest-100 pt-2 text-[11px] text-bark-500">
          {caveat ? <p>{caveat}</p> : null}
          {explainer ? (
            <details className="group mt-1">
              <summary className="cursor-pointer select-none text-xs font-medium text-forest-700 hover:text-forest-800">
                How to read this
              </summary>
              <div className="mt-2 max-w-3xl space-y-2 text-xs leading-relaxed text-bark-600">
                {explainer}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ExportButton({
  figureRef,
  meta,
}: {
  figureRef: React.RefObject<HTMLDivElement>;
  meta: () => { title: string; scope: string; caption: string };
}) {
  const { params } = useFilters();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      data-export-exclude
      disabled={busy}
      title={error ? "Export failed — try again" : "Download this figure as a captioned PNG"}
      aria-label="Download figure as PNG"
      onClick={async () => {
        const node = figureRef.current;
        if (!node) return;
        setBusy(true);
        setError(false);
        try {
          const m = meta();
          await exportFigure(node, {
            ...m,
            url: shareUrl(params),
            filename: `indiana-insects_${slugify(m.title)}_${slugify(m.scope)}.png`,
          });
        } catch (e) {
          console.error("Figure export failed", e);
          setError(true);
        } finally {
          setBusy(false);
        }
      }}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-cream-100 disabled:opacity-60 ${
        error ? "border-ok-vermillion text-ok-vermillion" : "border-forest-200 text-forest-700"
      }`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImageDown className="h-3.5 w-3.5" aria-hidden />}
      <span className="hidden xl:inline">PNG</span>
    </button>
  );
}

/** Segmented button group used by chart controls. */
export function Toggle<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-md border border-forest-200 bg-cream-50 text-xs"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={
              active
                ? "bg-forest-600 px-2 py-1 font-medium text-cream-50"
                : "bg-transparent px-2 py-1 text-forest-700 hover:bg-cream-200"
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center rounded-md border border-dashed border-forest-200 bg-cream-50 text-sm text-moss-700">
      {children ?? "No records match the current filters."}
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Shared Recharts styling so every chart reads as one system. */
export const AXIS_TICK = { fill: "#5f6360", fontSize: 11 } as const;
export const AXIS_STROKE = "#D9DDDF";
export const GRID_STROKE = "#EEF1F2";
export const TOOLTIP_STYLE = {
  background: "#FFFFFF",
  border: "1px solid #D9DDDF",
  borderRadius: 8,
  fontSize: 12,
  color: "#080808",
} as const;

/** Okabe-Ito, fixed order for comparison series (validated as a 4-set). */
export const SERIES_COLORS = ["#0072B2", "#E69F00", "#009E73", "#CC79A7"] as const;
