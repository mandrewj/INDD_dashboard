"use client";

import Image from "next/image";
import { gbifSearchUrlForTaxon } from "@/lib/citation";

/**
 * Small GBIF logo link — opens the Indiana-scoped occurrence search for a
 * given GBIF taxon key in a new tab. Mirrors the visual treatment of
 * <InatLink/> so the two icons sit next to each other consistently.
 */
export function GbifLink({
  taxonKey,
  speciesName,
}: {
  taxonKey: number;
  speciesName: string;
}) {
  const label = `Open GBIF Indiana occurrences for ${speciesName} in a new tab`;
  return (
    <a
      href={gbifSearchUrlForTaxon(taxonKey)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="ml-1.5 inline-flex h-4 w-4 shrink-0 translate-y-[1px] items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
    >
      <Image
        src="/images/gbif-logo.gif"
        alt=""
        width={16}
        height={16}
        unoptimized
        className="h-4 w-4 object-contain"
      />
    </a>
  );
}
