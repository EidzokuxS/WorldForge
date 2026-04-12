import type {
  CharacterContinuityPolicy,
  CharacterIdentitySourceCitation,
  CharacterSourceBundle,
} from "@worldforge/shared";

function normalizeCitation(
  citation: Partial<CharacterIdentitySourceCitation>,
  fallbackKind: CharacterIdentitySourceCitation["kind"],
): CharacterIdentitySourceCitation | null {
  const label = citation.label?.trim();
  const excerpt = citation.excerpt?.trim();
  if (!label || !excerpt) {
    return null;
  }

  return {
    kind: citation.kind ?? fallbackKind,
    label,
    excerpt,
  };
}

export function createCanonSource(
  citation: Partial<CharacterIdentitySourceCitation>,
): CharacterIdentitySourceCitation | null {
  return normalizeCitation(citation, "canon");
}

export function createSecondarySource(
  citation: Partial<CharacterIdentitySourceCitation>,
): CharacterIdentitySourceCitation | null {
  return normalizeCitation(citation, "card");
}

export function normalizeSourceBundle(
  bundle?: Partial<CharacterSourceBundle> | null,
): CharacterSourceBundle | undefined {
  if (!bundle) {
    return undefined;
  }

  const canonSources = (bundle.canonSources ?? [])
    .map((citation) => createCanonSource(citation))
    .filter((citation): citation is CharacterIdentitySourceCitation => citation !== null);
  const secondarySources = (bundle.secondarySources ?? [])
    .map((citation) => createSecondarySource(citation))
    .filter((citation): citation is CharacterIdentitySourceCitation => citation !== null);
  const owner = bundle.synthesis?.owner?.trim() ?? "";
  const strategy = bundle.synthesis?.strategy?.trim() ?? "";
  const notes = (bundle.synthesis?.notes ?? [])
    .map((note) => note.trim())
    .filter(Boolean);

  if (canonSources.length === 0 && secondarySources.length === 0 && !owner && !strategy && notes.length === 0) {
    return undefined;
  }

  return {
    canonSources,
    secondarySources,
    synthesis: {
      owner: owner || "worldforge",
      strategy: strategy || "worldforge-owned-synthesis",
      notes,
    },
  };
}

export function normalizeContinuity(
  continuity?: Partial<CharacterContinuityPolicy> | null,
): CharacterContinuityPolicy | undefined {
  if (!continuity) {
    return undefined;
  }

  const protectedCore = (continuity.protectedCore ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean);
  const mutableSurface = (continuity.mutableSurface ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean);
  const changePressureNotes = (continuity.changePressureNotes ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean);
  const identityInertia = continuity.identityInertia ?? "anchored";

  if (
    protectedCore.length === 0
    && mutableSurface.length === 0
    && changePressureNotes.length === 0
    && identityInertia === "anchored"
  ) {
    return undefined;
  }

  return {
    identityInertia,
    protectedCore,
    mutableSurface,
    changePressureNotes,
  };
}
