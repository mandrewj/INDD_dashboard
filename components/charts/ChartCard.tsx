import type { ReactNode } from "react";

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
  children: ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  controls,
  caveat,
  explainer,
  children,
}: ChartCardProps) {
  const id = `chart-${slug(title)}`;
  return (
    <section id={slug(title)} aria-labelledby={id} className="nature-card p-5 sm:p-6">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id={id} className="font-serif text-lg font-semibold text-forest-800">
            {title}
          </h3>
          {subtitle ? <p className="mt-1 text-xs text-moss-700">{subtitle}</p> : null}
        </div>
        {controls ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}
      </header>

      {children}

      {caveat || explainer ? (
        <div className="mt-3 border-t border-forest-100 pt-3 text-[11px] text-bark-500">
          {caveat ? <p>{caveat}</p> : null}
          {explainer ? (
            <details className="group mt-2">
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
                ? "bg-forest-600 px-2.5 py-1.5 font-medium text-cream-50"
                : "bg-transparent px-2.5 py-1.5 text-forest-700 hover:bg-cream-200"
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
