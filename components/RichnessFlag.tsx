import { ArrowUpRight, Check, TrendingUp } from "lucide-react";
import type { RichnessCompleteness } from "@/lib/inext";

/**
 * Small inline flag telling readers whether a Chao1/Chao2 richness estimate
 * can be trusted yet, i.e. whether the accumulation curve is near flat.
 * See `richnessCompleteness` in lib/inext.ts (Chao et al. 2009). Always icon
 * + text, never colour alone.
 */
export function RichnessFlag({ rc, compact = false }: { rc: RichnessCompleteness; compact?: boolean }) {
  const s = rc.status;
  const Icon = s === "far-from-asymptote" ? ArrowUpRight : s === "rising" ? TrendingUp : Check;
  const text =
    s === "far-from-asymptote"
      ? compact
        ? "still steep"
        : "Curve still steep: likely an underestimate"
      : s === "rising"
        ? compact
          ? "flattening"
          : "Curve flattening: may still rise"
        : compact
          ? "near flat"
          : "Curve near flat: estimate stable";
  const tone =
    s === "far-from-asymptote" ? "text-ochre-600" : s === "rising" ? "text-bark-600" : "text-moss-600";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium leading-tight ${compact ? "whitespace-nowrap" : ""} ${tone}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {text}
    </span>
  );
}

/** Plain-text explanation for tooltips and export captions. */
export function richnessFlagTitle(rc: RichnessCompleteness, unit: string): string {
  const pct = Math.round(100 * rc.ratio);
  const g = Math.round(100 * rc.g);
  if (rc.status === "near-asymptote") {
    return `${pct}% of the estimated species have been recorded: the accumulation curve is close to flat.`;
  }
  const more = Number.isFinite(rc.extraNeeded)
    ? `~${Math.round(rc.extraNeeded).toLocaleString()} more ${unit} (${rc.extraRatio.toFixed(1)}× the current sample)`
    : "an unknown amount of extra sampling";
  const tail =
    rc.status === "far-from-asymptote"
      ? " That is beyond reliable extrapolation, so treat the estimate as a minimum: true richness is probably higher (unless singletons are misidentifications or strays, which inflate it)."
      : "";
  return `Only ${pct}% of the estimated species have been recorded; reaching ${g}% would take ${more} (Chao et al. 2009).${tail}`;
}
