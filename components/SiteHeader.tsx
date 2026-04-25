import Image from "next/image";
import type { Precomputed } from "@/lib/types";

export function SiteHeader({ precomputed }: { precomputed: Precomputed }) {
  return (
    <header className="border-b border-forest-100 bg-cream-50/70 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <Image
            src="/images/ahasverus-icon.png"
            alt=""
            width={64}
            height={64}
            priority
            className="h-14 w-14 shrink-0 sm:h-16 sm:w-16"
          />
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-moss-600">
              Field Guide · Insect Diversity and Diagnostics Lab
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-forest-800 sm:text-4xl">
              Indiana Insect Biodiversity
            </h1>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <HeaderStat label="Records" value={precomputed.totalRecords.toLocaleString()} />
          <HeaderStat label="Taxa (species)" value={precomputed.uniqueSpecies.toLocaleString()} />
          <HeaderStat
            label="Date range"
            value={`${precomputed.yearObservedMin}–${precomputed.yearObservedMax}`}
          />
        </dl>
      </div>
      <div className="botanical-divider" aria-hidden />
    </header>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-moss-600">{label}</dt>
      <dd className="font-serif text-lg text-forest-700 tabular-nums">{value}</dd>
    </div>
  );
}
