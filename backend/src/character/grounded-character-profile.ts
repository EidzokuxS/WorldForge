import type {
  CharacterDraft,
  CharacterGroundingProfile,
  CharacterIdentitySourceCitation,
  PowerProfile,
} from "@worldforge/shared";

interface GroundedProfileOptions {
  draft: CharacterDraft;
  summaryHint?: string | null;
  evidenceText?: string | null;
  evidenceKind?: CharacterIdentitySourceCitation["kind"];
  evidenceLabel?: string | null;
  extraSources?: CharacterIdentitySourceCitation[];
  uncertaintyNotes?: string[];
}

export function synthesizeGroundedCharacterProfile(
  options: GroundedProfileOptions,
): CharacterGroundingProfile | undefined {
  const facts = dedupeStrings([
    ...extractSentences(options.draft.identity.baseFacts?.biography),
    options.draft.profile.backgroundSummary,
    options.draft.socialContext.factionName ?? "",
    options.draft.socialContext.currentLocationName ?? "",
  ]);
  const abilities = dedupeStrings([
    ...options.draft.capabilities.skills.map((skill) => skill.name),
    ...options.draft.capabilities.specialties,
    ...options.draft.capabilities.traits,
  ]);
  const constraints = dedupeStrings([
    ...(options.draft.identity.baseFacts?.hardConstraints ?? []),
    ...options.draft.capabilities.flaws,
  ]);
  const signatureMoves = dedupeStrings([
    ...options.draft.capabilities.specialties,
    ...options.draft.loadout.signatureItems,
  ]);
  const strongPoints = dedupeStrings([
    ...options.draft.capabilities.traits,
    ...options.draft.capabilities.specialties,
  ]);
  const vulnerabilities = dedupeStrings([
    ...options.draft.capabilities.flaws,
    ...(options.draft.identity.liveDynamics?.currentStrains ?? []),
  ]);
  const uncertaintyNotes = dedupeStrings([
    ...(options.uncertaintyNotes ?? []),
    !options.evidenceText
      ? "No external research summary or imported evidence was available; this profile stays bounded to the stored draft."
      : "Power interpretation remains bounded to the available grounded evidence and may omit unstated feats.",
  ]);
  const sources = normalizeSources([
    ...(options.draft.sourceBundle?.canonSources ?? []),
    ...(options.draft.sourceBundle?.secondarySources ?? []),
    ...(options.extraSources ?? []),
    buildEvidenceSource(options),
  ]);
  const summary = buildSummary(options, facts);
  const powerProfile = buildPowerProfile({
    abilities,
    strongPoints,
    constraints,
    vulnerabilities,
    uncertaintyNotes,
  });

  if (
    !summary
    && facts.length === 0
    && abilities.length === 0
    && constraints.length === 0
    && sources.length === 0
  ) {
    return undefined;
  }

  return {
    summary,
    facts,
    abilities,
    constraints,
    signatureMoves,
    strongPoints,
    vulnerabilities,
    uncertaintyNotes,
    powerProfile,
    sources,
  };
}

function buildSummary(
  options: GroundedProfileOptions,
  facts: string[],
): string {
  const preferred = firstNonEmpty([
    options.summaryHint,
    options.draft.profile.backgroundSummary,
    options.draft.profile.personaSummary,
    facts[0],
  ]);

  return preferred
    ? preferred.trim()
    : `${options.draft.identity.displayName} grounded profile remains intentionally bounded.`;
}

function buildPowerProfile(input: {
  abilities: string[];
  strongPoints: string[];
  constraints: string[];
  vulnerabilities: string[];
  uncertaintyNotes: string[];
}): PowerProfile {
  return {
    attack: input.abilities.length > 0
      ? `Grounded around ${joinList(input.abilities.slice(0, 2))}.`
      : "No direct destructive feats are grounded; treat combat output as bounded and situational.",
    speed: input.strongPoints.length > 0
      ? `Operational tempo is inferred from ${joinList(input.strongPoints.slice(0, 2))}.`
      : "No direct speed feats are grounded beyond normal scene performance.",
    durability: input.constraints.length > 0
      ? `Durability remains bounded by ${joinList(input.constraints.slice(0, 2))}.`
      : "Durability is treated as bounded to the available grounded evidence.",
    range: input.abilities.length > 0
      ? `Effective range is situational and tied to ${joinList(input.abilities.slice(0, 2))}.`
      : "Range is situational and not strongly attested in the grounded inputs.",
    strengths: [...input.strongPoints],
    constraints: [...input.constraints],
    vulnerabilities: [...input.vulnerabilities],
    uncertaintyNotes: dedupeStrings([
      ...input.uncertaintyNotes,
      "Cross-context power conclusions stay bounded to these grounded cues rather than model intuition.",
    ]),
  };
}

function buildEvidenceSource(
  options: GroundedProfileOptions,
): CharacterIdentitySourceCitation | null {
  if (!options.evidenceText?.trim() || !options.evidenceLabel?.trim()) {
    return null;
  }

  return {
    kind: options.evidenceKind ?? "research",
    label: options.evidenceLabel.trim(),
    excerpt: options.evidenceText.trim().slice(0, 280),
  };
}

function normalizeSources(
  sources: Array<CharacterIdentitySourceCitation | null | undefined>,
): CharacterIdentitySourceCitation[] {
  const seen = new Set<string>();
  const normalized: CharacterIdentitySourceCitation[] = [];

  for (const source of sources) {
    if (!source) {
      continue;
    }

    const label = source.label.trim();
    const excerpt = source.excerpt.trim();
    if (!label || !excerpt) {
      continue;
    }

    const key = `${source.kind}:${label.toLowerCase()}:${excerpt.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    normalized.push({
      kind: source.kind,
      label,
      excerpt,
    });
  }

  return normalized;
}

function extractSentences(text: string | undefined): string[] {
  if (!text) {
    return [];
  }

  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value?.trim()) {
      return value.trim();
    }
  }

  return null;
}

function joinList(values: string[]): string {
  return values.join(" and ");
}
