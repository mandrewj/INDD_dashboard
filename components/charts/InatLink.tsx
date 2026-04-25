"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  inatNameSearchUrl,
  inatTaxonUrl,
  lookupInatTaxonId,
  readCachedInatTaxonId,
} from "@/lib/inaturalist";

type Status = "idle" | "loading" | "resolved" | "miss";

/**
 * Tiny "iNat" pill rendered next to the species name. Lookup is lazy:
 *   - Hover / focus → kicks off the API call (prefetch).
 *   - Click → if already resolved, the anchor's default behavior opens it.
 *             If still resolving, intercept, open a placeholder tab, and
 *             redirect that tab when the lookup finishes.
 *   - Failed lookup → falls back to iNat's name-search URL.
 */
export function InatLink({ speciesName }: { speciesName: string }) {
  const [taxonId, setTaxonId] = useState<number | null>(() => {
    const cached = readCachedInatTaxonId(speciesName);
    return cached === undefined ? null : cached;
  });
  const [status, setStatus] = useState<Status>(() => {
    const cached = readCachedInatTaxonId(speciesName);
    if (cached === undefined) return "idle";
    return cached === null ? "miss" : "resolved";
  });

  // Hydration safety: re-read cache on mount in case the SSR pass had no
  // window. (No-op on client-only renders.)
  useEffect(() => {
    if (status !== "idle") return;
    const cached = readCachedInatTaxonId(speciesName);
    if (cached === undefined) return;
    setTaxonId(cached);
    setStatus(cached === null ? "miss" : "resolved");
  }, [speciesName, status]);

  const resolve = useCallback(async (): Promise<{ url: string; ok: boolean }> => {
    setStatus("loading");
    const id = await lookupInatTaxonId(speciesName);
    if (id !== null) {
      setTaxonId(id);
      setStatus("resolved");
      return { url: inatTaxonUrl(id), ok: true };
    }
    setStatus("miss");
    return { url: inatNameSearchUrl(speciesName), ok: false };
  }, [speciesName]);

  const prefetch = useCallback(() => {
    if (status === "idle") void resolve();
  }, [status, resolve]);

  const href =
    taxonId !== null
      ? inatTaxonUrl(taxonId)
      : inatNameSearchUrl(speciesName);

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // If already resolved (cache hit or earlier prefetch), let the anchor open.
    if (status === "resolved" || status === "miss") return;

    // Otherwise we need to fetch first, but popup blockers will fire if we
    // open after an async gap. Open a placeholder tab synchronously here,
    // then point it at the resolved URL once the lookup finishes.
    e.preventDefault();
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");
    void resolve().then(({ url }) => {
      if (popup && !popup.closed) popup.location.href = url;
    });
  };

  const label =
    status === "loading"
      ? "Looking up on iNaturalist…"
      : `Open iNaturalist observations for ${speciesName} in a new tab`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onClick={onClick}
      aria-label={label}
      title={label}
      data-status={status}
      className="ml-1.5 inline-flex h-4 w-4 shrink-0 translate-y-[1px] items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
    >
      <Image
        src="/images/inaturalist-logo.png"
        alt=""
        width={16}
        height={16}
        className={`h-4 w-4 object-contain ${status === "loading" ? "animate-pulse" : ""}`}
      />
    </a>
  );
}
