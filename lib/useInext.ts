"use client";

import { useEffect, useRef, useState } from "react";
import type {
  InextGroupInput,
  InextGroupResult,
  InextRequest,
  InextResponse,
} from "./inext.worker";

export interface InextState {
  groups: InextGroupResult[] | null;
  /** True while bootstrap bands are still being computed. */
  bandsPending: boolean;
}

/**
 * Compute iNEXT curves for `groups` in a Web Worker. Results for superseded
 * requests are dropped, so rapid filter changes never render stale curves.
 */
export function useInext(
  groups: InextGroupInput[],
  { B = 50, endpoint = null }: { B?: number; endpoint?: number | null } = {},
): InextState {
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const [state, setState] = useState<InextState>({ groups: null, bandsPending: false });

  useEffect(() => {
    const w = new Worker(new URL("./inext.worker.ts", import.meta.url));
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<InextResponse>) => {
      if (e.data.id !== reqId.current) return;
      setState({ groups: e.data.groups, bandsPending: e.data.phase === "point" && B > 0 });
    };
    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, [B]);

  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    const id = ++reqId.current;
    setState((s) => ({ groups: s.groups, bandsPending: B > 0 }));
    // Copy (not transfer) the counts: callers keep them memoized.
    const req: InextRequest = { id, groups, B, endpoint };
    w.postMessage(req);
  }, [groups, B, endpoint]);

  return state;
}
