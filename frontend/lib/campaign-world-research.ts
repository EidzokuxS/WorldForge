export interface CampaignWorldResearchPresentation {
  interpretation: string;
  tonalNotes: string[];
  ambiguityNotes: string[];
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string =>
    typeof item === "string" && item.trim().length > 0
  );
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function presentCampaignWorldResearchSummary(
  value: string | null,
): CampaignWorldResearchPresentation | null {
  if (value === null) return null;
  const prose = value.trim();
  let decoded: unknown;
  try {
    decoded = JSON.parse(prose);
  } catch {
    return { interpretation: prose, tonalNotes: [], ambiguityNotes: [] };
  }

  if (typeof decoded === "string") {
    return { interpretation: decoded.trim(), tonalNotes: [], ambiguityNotes: [] };
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    return {
      interpretation: "Research context was saved without a player-facing interpretation.",
      tonalNotes: [],
      ambiguityNotes: [],
    };
  }

  const summary = decoded as Record<string, unknown>;
  const interpretationSummary = nonEmptyString(summary.interpretationSummary);
  const franchise = nonEmptyString(summary.franchise);
  const keyFacts = stringList(summary.keyFacts);
  const interpretation = interpretationSummary ?? (
    franchise && keyFacts.length > 0
      ? `${franchise}: ${keyFacts.join(" ")}`
      : "Research context was saved without a player-facing interpretation."
  );

  return {
    interpretation,
    tonalNotes: stringList(summary.tonalNotes),
    ambiguityNotes: stringList(summary.ambiguityNotes),
  };
}
