/**
 * Lazy lookup of iNaturalist taxon IDs by Linnean species name.
 *
 * Strategy:
 *   - Each call hits https://api.inaturalist.org/v1/taxa?q=…&order_by=observations_count
 *     and takes the top result's id (the most-observed match — almost always
 *     the correct species when the search term is a binomial).
 *   - Results are cached in localStorage forever (keyed by species name).
 *   - Concurrent requests for the same name are deduped via an in-flight map.
 *   - Callers can choose between an "exact taxon" URL and a name-search
 *     fallback URL (used when lookup fails or hasn't happened yet).
 *
 * No backend involved — iNat's API supports CORS for browser callers.
 */

const CACHE_KEY = "indd-inat-taxon-cache-v1";

interface Cache {
  /** number = taxon id, null = lookup attempted and returned no usable hit. */
  [name: string]: number | null;
}

let memoryCache: Cache | null = null;
const inFlight = new Map<string, Promise<number | null>>();

function getCache(): Cache {
  if (memoryCache !== null) return memoryCache;
  if (typeof window === "undefined") {
    memoryCache = {};
    return memoryCache;
  }
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    memoryCache = raw ? (JSON.parse(raw) as Cache) : {};
  } catch {
    memoryCache = {};
  }
  return memoryCache;
}

function persist(cache: Cache): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage may be full or disabled; live with a memory-only cache.
  }
}

/**
 * Resolve a species name to an iNaturalist taxon id.
 * Returns null on miss / network failure / API error.
 */
export async function lookupInatTaxonId(speciesName: string): Promise<number | null> {
  const cache = getCache();
  if (Object.prototype.hasOwnProperty.call(cache, speciesName)) {
    return cache[speciesName] ?? null;
  }
  const existing = inFlight.get(speciesName);
  if (existing) return existing;

  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(
    speciesName,
  )}&order=desc&order_by=observations_count`;

  const promise = fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  })
    .then(async (res): Promise<number | null> => {
      if (!res.ok) return null;
      const json = (await res.json()) as { results?: Array<{ id?: unknown }> };
      const top = json.results?.[0];
      const id = typeof top?.id === "number" ? top.id : null;
      return id;
    })
    .catch(() => null)
    .then((id) => {
      cache[speciesName] = id;
      persist(cache);
      inFlight.delete(speciesName);
      return id;
    });

  inFlight.set(speciesName, promise);
  return promise;
}

/** URL pointing directly at an iNat taxon's observation map. */
export function inatTaxonUrl(taxonId: number): string {
  return `https://www.inaturalist.org/observations?subview=map&taxon_id=${taxonId}`;
}

/** Fallback: text search by species name (used while resolving / on miss). */
export function inatNameSearchUrl(speciesName: string): string {
  return `https://www.inaturalist.org/observations?subview=map&taxon_name=${encodeURIComponent(
    speciesName,
  )}`;
}

/** Synchronously read a previously-cached id for SSR-safe initial render. */
export function readCachedInatTaxonId(speciesName: string): number | null | undefined {
  const cache = getCache();
  return Object.prototype.hasOwnProperty.call(cache, speciesName)
    ? (cache[speciesName] ?? null)
    : undefined;
}
