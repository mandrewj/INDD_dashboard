/**
 * Deliberately minimal: the dashboard lives inside insectid.org, whose own
 * header already carries the InsectID logo and site navigation, and the KPI
 * row below repeats any headline numbers. So: one title, one line of context.
 */
export function SiteHeader() {
  return (
    <header className="mx-auto max-w-7xl px-6 pt-6">
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-forest-800 sm:text-3xl">
        Indiana Insect Biodiversity
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-moss-600">
        Explore every GBIF occurrence record of insects in Indiana, then ask how
        complete that picture is. Filter by taxon, county, or years; every chart
        and estimate updates together.
      </p>
    </header>
  );
}
