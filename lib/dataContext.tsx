"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Dictionaries, RecordTuple } from "./types";
import precomputed from "@/public/data/precomputed.json";

// Use a value that changes whenever the data is rebuilt — totalRecords plus
// the year filter ceiling make a stable, build-bound version key without
// requiring a separate manifest file.
const precomputedVersion = `${precomputed.totalRecords}-${precomputed.yearFilterCeil}`;

/** Minimal GeoJSON shape we need (counties only; Polygon or MultiPolygon). */
export interface CountyFeature {
  type: "Feature";
  properties: { name: string; fips: string; geoid: string };
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
}

export interface CountyFeatureCollection {
  type: "FeatureCollection";
  features: CountyFeature[];
}

interface LoadedData {
  records: RecordTuple[];
  dictionaries: Dictionaries;
  counties: CountyFeatureCollection;
}

type DataState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LoadedData };

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Cache-bust on the precomputed totalRecords value — when the data
        // is rebuilt, this changes too, so the URL changes and we sidestep
        // any stale browser/CDN cache. (force-cache here would re-use a
        // possibly-broken prior response across reloads.)
        const v = String(precomputedVersion);
        const [recRes, dictRes, geoRes] = await Promise.all([
          fetch(`/data/records.json?v=${v}`),
          fetch(`/data/dictionaries.json?v=${v}`),
          fetch(`/data/in-counties.geojson?v=${v}`),
        ]);
        if (!recRes.ok) throw new Error(`records.json HTTP ${recRes.status}`);
        if (!dictRes.ok) throw new Error(`dictionaries.json HTTP ${dictRes.status}`);
        if (!geoRes.ok) throw new Error(`in-counties.geojson HTTP ${geoRes.status}`);
        const recJson = (await recRes.json()) as { records: RecordTuple[] };
        const dictJson = (await dictRes.json()) as Dictionaries;
        const geoJson = (await geoRes.json()) as CountyFeatureCollection;
        if (cancelled) return;
        setState({
          status: "ready",
          data: {
            records: recJson.records,
            dictionaries: dictJson,
            counties: geoJson,
          },
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => state, [state]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataState(): DataState {
  const ctx = useContext(DataContext);
  if (ctx === null) throw new Error("useDataState must be used within DataProvider");
  return ctx;
}

/** Convenience hook that throws if data is not ready — use inside a Suspense /
 *  loaded-only subtree (we render a sibling for loading/error states). */
export function useLoadedData(): LoadedData {
  const s = useDataState();
  if (s.status !== "ready") {
    throw new Error("useLoadedData called before data was ready");
  }
  return s.data;
}
