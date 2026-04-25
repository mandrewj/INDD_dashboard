/**
 * Source citation for the GBIF occurrence download backing the dashboard.
 * Update both fields together when regenerating from a fresh download.
 *
 * The GBIF "Cite this download" snippet is generated on the download page.
 * We render the human-readable form in the footer and link to the DOI.
 */
export const GBIF_DOI_URL = "https://doi.org/10.15468/dl.3r8a5v";
export const GBIF_DOI = "10.15468/dl.3r8a5v";
export const GBIF_DOWNLOAD_DATE = "2026-04-25";

export const GBIF_CITATION =
  `GBIF.org (${GBIF_DOWNLOAD_DATE}). GBIF Occurrence Download ${GBIF_DOI_URL}`;

/**
 * Build a GBIF occurrence search URL for a given GBIF taxon key, scoped to
 * Indiana and present occurrences only — matches the dashboard's filter.
 */
export function gbifSearchUrlForTaxon(taxonKey: number): string {
  const params = new URLSearchParams({
    taxon_key: String(taxonKey),
    state_province: "Indiana",
    occurrence_status: "present",
  });
  return `https://www.gbif.org/occurrence/search?${params.toString()}`;
}
