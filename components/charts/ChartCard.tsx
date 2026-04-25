import type { ReactNode } from "react";

export interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  controls?: ReactNode;
  /** Surface text describing data gaps or caveats that affect this chart. */
  caveat?: ReactNode;
  children: ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  controls,
  caveat,
  children,
}: ChartCardProps) {
  return (
    <section
      aria-labelledby={`chart-${slug(title)}`}
      className="nature-card nature-card-accent p-5 sm:p-6"
    >
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3
            id={`chart-${slug(title)}`}
            className="leaf-rule font-serif text-lg font-semibold text-forest-800"
          >
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-2 text-xs text-moss-700">{subtitle}</p>
          ) : null}
        </div>
        {controls ? <div className="flex items-center gap-2">{controls}</div> : null}
      </header>

      {children}

      {caveat ? (
        <p className="mt-3 border-t border-forest-100 pt-3 text-[11px] text-bark-500">
          {caveat}
        </p>
      ) : null}
    </section>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
