// Velo page code for https://www.insectid.org/indiana-insects
//
// Passes deep-link params from the insectid.org URL down into the dashboard
// iframe, and mirrors the dashboard's filter state back up into the address
// bar so the browser URL is always shareable. See README → "Embedding in
// insectid.org" for setup.
//
//   https://www.insectid.org/indiana-insects?taxon=Carabidae&county=Tippecanoe
//
// Setup: in the Wix editor turn on Dev Mode, select the dashboard's Embed
// element and set its ID (Properties panel) to `dashboard` — or change
// EMBED_ID below — then paste this file into the page's code panel and publish.

import wixLocationFrontend from "wix-location-frontend";

const APP_URL = "https://indd-dashboard.vercel.app/";
const EMBED_ID = "#dashboard";
const KEYS = ["taxon", "order", "family", "genus", "species", "county", "from", "to", "noyear"];

function toQuery(obj) {
  return KEYS.filter((k) => obj[k])
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`)
    .join("&");
}

$w.onReady(function () {
  const embed = $w(EMBED_ID);

  // Parent → dashboard. Only touch src when there's something to pass, so a
  // plain visit doesn't load the dashboard twice.
  const qs = toQuery(wixLocationFrontend.query);
  if (qs) embed.src = `${APP_URL}?${qs}`;

  // Dashboard → parent: keep the address bar in sync with the filters.
  embed.onMessage((event) => {
    const msg = event.data;
    if (!msg || msg.source !== "indd-dashboard" || msg.type !== "filters") return;
    const params = msg.params || {};
    if (toQuery(params) === toQuery(wixLocationFrontend.query)) return;
    wixLocationFrontend.queryParams.remove(KEYS);
    const next = {};
    for (const k of KEYS) if (params[k]) next[k] = String(params[k]);
    if (Object.keys(next).length > 0) wixLocationFrontend.queryParams.add(next);
  });
});
