/**
 * Glue for running inside the insectid.org (Wix) iframe.
 *
 * Direction parent → app: Wix page code (see wix/indiana-insects.page.js)
 * copies the parent page's query string onto the iframe `src`, so the app just
 * reads its own `window.location.search`.
 *
 * Direction app → parent: on every filter change we post the current params
 * to `window.parent`; the Wix page code mirrors them into the address bar so
 * the browser URL is always a shareable deep link. The "Copy link" button
 * builds the parent-page URL directly, so sharing works even if the parent
 * page code isn't installed.
 */

/** Public page that embeds the dashboard. Links are shared against this. */
export const PARENT_PAGE_URL = "https://www.insectid.org/indiana-insects";

export const MESSAGE_SOURCE = "indd-dashboard";

export function isEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin access to window.top throws → we're framed.
    return true;
  }
}

/** URL to share for the given params: the parent page when framed, else this app. */
export function shareUrl(params: URLSearchParams): string {
  const qs = params.toString();
  const base = isEmbedded()
    ? PARENT_PAGE_URL
    : `${window.location.origin}${window.location.pathname}`;
  return qs ? `${base}?${qs}` : base;
}

/** Keep the app's own URL in sync (no history entry) and notify the parent. */
export function publishParams(params: URLSearchParams): void {
  if (typeof window === "undefined") return;
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, "", next);
  }
  if (isEmbedded()) {
    const payload: Record<string, string> = {};
    params.forEach((v, k) => {
      payload[k] = v;
    });
    // Filter params are public, non-sensitive state; "*" lets this work in
    // the Wix editor preview (different origin) as well as on insectid.org.
    window.parent.postMessage({ source: MESSAGE_SOURCE, type: "filters", params: payload }, "*");
  }
}
