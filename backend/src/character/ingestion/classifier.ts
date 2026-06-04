import type { IpResearchContext, PremiseDivergence } from "@worldforge/shared";
import type { IngestionSources, IngestionClassification } from "./types.js";

function nameMatches(candidate: string, canonicalNames: string[]): boolean {
  const lower = candidate.trim().toLowerCase();
  if (!lower) return false;
  return canonicalNames.some((n) => n.trim().toLowerCase() === lower);
}

function findNameInArchetype(
  archetype: string,
  canonicalNames: string[],
): string | null {
  const lower = archetype.toLowerCase();
  const match = canonicalNames.find((n) => lower.includes(n.toLowerCase()));
  return match ?? null;
}

export function classifyCanonicalStatus(opts: {
  sources: IngestionSources;
  ipContext: IpResearchContext | null;
  premiseDivergence: PremiseDivergence | null;
}): IngestionClassification {
  const { sources, ipContext, premiseDivergence } = opts;
  const canonicalNames = ipContext?.canonicalNames?.characters ?? [];
  const excluded = ipContext?.excludedCharacters ?? [];

  const candidateName =
    sources.displayName ??
    (sources.archetype
      ? findNameInArchetype(sources.archetype, canonicalNames)
      : null);

  const hasCanonMatch =
    candidateName != null && nameMatches(candidateName, canonicalNames);

  let canonicalStatus: IngestionClassification["canonicalStatus"];
  if (hasCanonMatch) {
    canonicalStatus = excluded.some(
      (e) => e.toLowerCase() === candidateName!.toLowerCase(),
    )
      ? "known_ip_diverged"
      : "known_ip_canonical";
  } else if (sources.card) {
    canonicalStatus = "imported";
  } else {
    canonicalStatus = "original";
  }

  return {
    canonicalStatus,
    franchise: ipContext?.franchise ?? null,
    ipContext: ipContext ?? null,
    premiseDivergence: premiseDivergence ?? null,
  };
}
