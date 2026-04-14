import { z } from "zod";
import type {
  CharacterDraft,
  CharacterIdentitySourceCitation,
  CharacterSourceBundle,
  CharacterContinuityPolicy,
  ResearchConfig,
  PremiseDivergence,
} from "@worldforge/shared";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { createModel } from "../ai/index.js";
import { webSearch, type SearchConfig } from "../lib/web-search.js";
import { clampTokens } from "../lib/clamp.js";

const powerProfileSchema = z.object({
  attack: z.string().min(1),
  speed: z.string().min(1),
  durability: z.string().min(1),
  range: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  vulnerabilities: z.array(z.string()).default([]),
  uncertaintyNotes: z.array(z.string()).default([]),
});

const knownIpCharacterProfileSchema = z.object({
  summary: z.string().min(1),
  selfImage: z
    .string()
    .min(1)
    .describe("How this character sees themselves in one concrete sentence."),
  socialRoles: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe("Concrete in-world roles, titles, or social positions. Never use generic labels like npc."),
  facts: z.array(z.string()).min(2).max(6),
  abilities: z.array(z.string()).min(2).max(8),
  constraints: z.array(z.string()).max(5).default([]),
  signatureMoves: z.array(z.string()).max(5).default([]),
  strongPoints: z.array(z.string()).max(6).default([]),
  vulnerabilities: z.array(z.string()).max(5).default([]),
  protectedCore: z.array(z.string()).min(2).max(6),
  mutableSurface: z.array(z.string()).max(5).default([]),
  changePressureNotes: z.array(z.string()).max(5).default([]),
  powerProfile: powerProfileSchema,
});

const looseKnownIpCharacterProfileSchema = z.object({}).passthrough();

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
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

function cappedStrings(values: Array<string | null | undefined>, max: number): string[] {
  return dedupeStrings(values).slice(0, max);
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return firstNonEmpty(
    stringFromUnknown(record.value),
    stringFromUnknown(record.text),
    stringFromUnknown(record.content),
    stringFromUnknown(record.description),
    stringFromUnknown(record.label),
    stringFromUnknown(record.name),
    stringFromUnknown(record.title),
  );
}

function flattenToStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return dedupeStrings(value.flatMap((item) => {
      const asString = stringFromUnknown(item);
      return asString ? [asString] : flattenToStrings(item);
    }));
  }

  const asString = stringFromUnknown(value);
  if (asString) {
    return [asString];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return dedupeStrings(
    Object.values(value as Record<string, unknown>).flatMap((nested) => flattenToStrings(nested)),
  );
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function fieldFromRecord(
  record: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function stringFieldFromRecord(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  return firstNonEmpty(...keys.map((key) => stringFromUnknown(record[key])));
}

function arrayFieldFromRecord(
  record: Record<string, unknown>,
  ...keys: string[]
): string[] {
  return dedupeStrings(keys.flatMap((key) => flattenToStrings(record[key])));
}

function missingRequiredFields(error: z.ZodError): string[] {
  return dedupeStrings(
    error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean),
  );
}

function describeZodIssues(error: z.ZodError): string[] {
  return dedupeStrings(
    error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .filter(Boolean),
  );
}

async function repairKnownIpCharacterProfile(opts: {
  rawObject: Record<string, unknown>;
  missingFields: string[];
  draft: CharacterDraft;
  franchise: string;
  role: ResolvedRole;
  premise: string;
  premiseDivergence?: PremiseDivergence | null;
  searchDigest: string;
}): Promise<z.infer<typeof knownIpCharacterProfileSchema>> {
  let currentRaw = opts.rawObject;
  let currentFailures = opts.missingFields;
  let lastError: z.ZodError | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const { object: rawRepairObject } = await generateObject({
      model: createModel(opts.role.provider),
      schema: looseKnownIpCharacterProfileSchema,
      prompt: `You are repairing a malformed known-IP character grounding payload for WorldForge.

Franchise: ${opts.franchise}
Character: ${opts.draft.identity.displayName}
Current world premise: ${opts.premise}
Current authored persona: ${opts.draft.profile.personaSummary}
Current authored goals: ${[...opts.draft.motivations.shortTermGoals, ...opts.draft.motivations.longTermGoals].join("; ") || "(none)"}
${buildPremiseDivergenceNote(opts.premiseDivergence)}

Search results:
${opts.searchDigest}

Malformed raw payload:
${JSON.stringify(currentRaw, null, 2)}

Repair task:
- Reformat and complete this into the exact target schema.
- Remaining validation failures that MUST be fixed: ${currentFailures.join(", ")}.
- Use only facts supported by the raw payload and search results.
- summary must be a concise canon-grounded overview.
- selfImage may appear either as top-level selfImage or nested inside identity.selfImage.
- socialRoles must be concrete in-world roles/titles, never npc/player/character.
- abilities may be either a flat array or an object with grouped fields like traits/core/signature/techniques.
      - Required minimums matter: facts >= 2, abilities >= 2, socialRoles >= 1, protectedCore >= 2.
      - protectedCore must name stable identity anchors that should resist change.
      - powerProfile.attack/speed/durability/range must all be concrete one-line strings.
      - Do not output extra keys.`,
      temperature: Math.min(opts.role.temperature, 0.2),
      maxOutputTokens: clampTokens(opts.role.maxTokens),
    });

    try {
      return normalizeKnownIpCharacterProfile(rawRepairObject, opts.draft);
    } catch (error) {
      if (!(error instanceof z.ZodError)) {
        throw error;
      }

      lastError = error;
      currentRaw = recordFromUnknown(rawRepairObject);
      currentFailures = describeZodIssues(error);

      if (attempt === 3) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("Known-IP repair failed unexpectedly.");
}

function normalizeKnownIpCharacterProfile(
  raw: z.infer<typeof looseKnownIpCharacterProfileSchema>,
  draft: CharacterDraft,
): z.infer<typeof knownIpCharacterProfileSchema> {
  const rawRecord = recordFromUnknown(raw);
  const identityRecord = recordFromUnknown(fieldFromRecord(rawRecord, "identity", "characterIdentity"));
  const powerRecord = recordFromUnknown(
    fieldFromRecord(rawRecord, "powerProfile", "power", "combatProfile", "combat"),
  );
  const facts = cappedStrings(arrayFieldFromRecord(rawRecord, "facts", "canonFacts", "keyFacts"), 6);
  const abilities = cappedStrings([
    ...arrayFieldFromRecord(rawRecord, "abilities"),
    ...arrayFieldFromRecord(rawRecord, "signatureMoves"),
  ], 8);
  const strongPoints = cappedStrings(arrayFieldFromRecord(rawRecord, "strongPoints", "strengths"), 6);
  const constraints = cappedStrings([
    ...arrayFieldFromRecord(rawRecord, "constraints", "limits", "restrictions"),
    ...arrayFieldFromRecord(powerRecord, "constraints", "limits", "restrictions"),
  ], 5);
  const vulnerabilities = cappedStrings([
    ...arrayFieldFromRecord(rawRecord, "vulnerabilities", "weaknesses"),
    ...arrayFieldFromRecord(powerRecord, "vulnerabilities", "weaknesses"),
  ], 5);
  const uncertaintyNotes = cappedStrings(arrayFieldFromRecord(
    powerRecord,
    "uncertaintyNotes",
    "uncertainty",
    "uncertainties",
  ), 5);

  const normalized = {
    summary: firstNonEmpty(
      stringFieldFromRecord(rawRecord, "summary", "overview", "profileSummary", "profile", "description"),
    ),
    selfImage: firstNonEmpty(
      stringFieldFromRecord(rawRecord, "selfImage", "selfConcept", "selfPerception"),
      stringFieldFromRecord(identityRecord, "selfImage", "selfConcept", "selfPerception"),
      draft.identity.behavioralCore?.selfImage,
    ),
    socialRoles: cappedStrings([
      ...arrayFieldFromRecord(rawRecord, "socialRoles", "roles", "positions", "titles"),
      ...arrayFieldFromRecord(identityRecord, "socialRoles", "roles", "positions", "titles"),
    ], 5),
    facts,
    abilities,
    constraints,
    signatureMoves: cappedStrings(
      arrayFieldFromRecord(rawRecord, "signatureMoves", "signatureTechniques", "signatureAbilities"),
      5,
    ),
    strongPoints,
    vulnerabilities,
    protectedCore: cappedStrings(
      arrayFieldFromRecord(rawRecord, "protectedCore", "identityAnchors", "coreValues"),
      6,
    ),
    mutableSurface: cappedStrings(
      arrayFieldFromRecord(rawRecord, "mutableSurface", "adaptableSurface"),
      5,
    ),
    changePressureNotes: cappedStrings(
      arrayFieldFromRecord(rawRecord, "changePressureNotes", "pressureNotes"),
      5,
    ),
    powerProfile: {
      attack: firstNonEmpty(
        stringFieldFromRecord(powerRecord, "attack", "offense", "attackPower"),
        stringFieldFromRecord(rawRecord, "attack", "offense", "attackPower"),
      ),
      speed: firstNonEmpty(
        stringFieldFromRecord(powerRecord, "speed", "mobility", "reactionSpeed"),
        stringFieldFromRecord(rawRecord, "speed", "mobility", "reactionSpeed"),
      ),
      durability: firstNonEmpty(
        stringFieldFromRecord(powerRecord, "durability", "defense", "survivability"),
        stringFieldFromRecord(rawRecord, "durability", "defense", "survivability"),
      ),
      range: firstNonEmpty(
        stringFieldFromRecord(powerRecord, "range", "engagementRange"),
        stringFieldFromRecord(rawRecord, "range", "engagementRange"),
      ),
      strengths: cappedStrings([
        ...arrayFieldFromRecord(powerRecord, "strengths"),
        ...strongPoints,
      ], 6),
      constraints,
      vulnerabilities,
      uncertaintyNotes,
    },
  };

  const parsed = knownIpCharacterProfileSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  throw parsed.error;
}

function buildSearchConfig(research: ResearchConfig, role: ResolvedRole): SearchConfig {
  return {
    provider: research.searchProvider,
    braveApiKey: research.braveApiKey,
    zaiApiKey: research.zaiApiKey,
    llmProvider: role.provider,
  };
}

function buildPremiseDivergenceNote(premiseDivergence: PremiseDivergence | null | undefined): string {
  if (!premiseDivergence) {
    return "No divergence artifact was provided. Stay fully canonical.";
  }

  const changedFacts = premiseDivergence.changedCanonFacts.length > 0
    ? premiseDivergence.changedCanonFacts.map((fact) => `- ${fact}`).join("\n")
    : "- No explicit canon changes were listed.";
  const directives = premiseDivergence.currentStateDirectives.length > 0
    ? premiseDivergence.currentStateDirectives.map((fact) => `- ${fact}`).join("\n")
    : "- Preserve canon conservatively.";

  return `Premise divergence mode: ${premiseDivergence.mode}
Changed canon facts:
${changedFacts}
Current world-state directives:
${directives}`;
}

function buildCanonSources(
  results: Array<{ title: string; description: string; url: string }>,
): CharacterIdentitySourceCitation[] {
  return dedupeStrings(
    results.flatMap((result) => [
      result.title.trim() ? `${result.title}|||${result.description.trim() || result.url}` : null,
    ]),
  )
    .slice(0, 4)
    .map((entry) => {
      const [label, excerpt] = entry.split("|||");
      return {
        kind: "canon" as const,
        label,
        excerpt,
      };
    });
}

function mergeSourceBundle(
  existing: CharacterDraft["sourceBundle"],
  canonSources: CharacterIdentitySourceCitation[],
): CharacterSourceBundle {
  const existingCanon = existing?.canonSources ?? [];
  const existingSecondary = existing?.secondarySources ?? [];

  return {
    canonSources: dedupeSourceCitations([...existingCanon, ...canonSources]),
    secondarySources: existingSecondary,
    synthesis: {
      owner: existing?.synthesis.owner ?? "WorldForge",
      strategy: "known-ip-worldgen-character-research",
      notes: dedupeStrings([
        ...(existing?.synthesis.notes ?? []),
        "Key known-IP worldgen NPC was grounded through per-character canon research before persistence.",
      ]),
    },
  };
}

function dedupeSourceCitations(
  citations: CharacterIdentitySourceCitation[],
): CharacterIdentitySourceCitation[] {
  const seen = new Set<string>();
  const result: CharacterIdentitySourceCitation[] = [];

  for (const citation of citations) {
    const label = citation.label.trim();
    const excerpt = citation.excerpt.trim();
    if (!label || !excerpt) {
      continue;
    }

    const key = `${citation.kind}:${label.toLowerCase()}:${excerpt.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({
      kind: citation.kind,
      label,
      excerpt,
    });
  }

  return result;
}

function buildContinuity(
  profile: z.infer<typeof knownIpCharacterProfileSchema>,
  existing: CharacterDraft["continuity"],
): CharacterContinuityPolicy {
  return {
    identityInertia: existing?.identityInertia ?? "anchored",
    protectedCore: dedupeStrings([
      ...(existing?.protectedCore ?? []),
      ...profile.protectedCore,
    ]),
    mutableSurface: dedupeStrings([
      ...(existing?.mutableSurface ?? []),
      ...profile.mutableSurface,
    ]),
    changePressureNotes: dedupeStrings([
      ...(existing?.changePressureNotes ?? []),
      ...profile.changePressureNotes,
    ]),
  };
}

export async function enrichKnownIpWorldgenNpcDraft(opts: {
  draft: CharacterDraft;
  franchise: string;
  role: ResolvedRole;
  research: ResearchConfig | undefined;
  premise: string;
  premiseDivergence?: PremiseDivergence | null;
}): Promise<CharacterDraft> {
  if (!opts.research?.enabled) {
    throw new Error(
      `Known-IP key NPC grounding requires research to be enabled (${opts.draft.identity.displayName}).`,
    );
  }

  const query = `${opts.franchise} ${opts.draft.identity.displayName} abilities powers personality affiliations weaknesses`;
  const searchResults = await webSearch(
    query,
    buildSearchConfig(opts.research, opts.role),
    Math.min(6, Math.max(4, opts.research.maxSearchSteps ?? 6)),
  );

  if (searchResults.length === 0) {
    throw new Error(
      `No canon search results for key known-IP NPC "${opts.draft.identity.displayName}" in ${opts.franchise}.`,
    );
  }

  const searchDigest = searchResults
    .map((result) => `- ${result.title}: ${result.description} (${result.url})`)
    .join("\n");

  const { object: rawObject } = await generateObject({
    model: createModel(opts.role.provider),
    schema: looseKnownIpCharacterProfileSchema,
    prompt: `You are grounding a canonical character for WorldForge worldgen.

Franchise: ${opts.franchise}
Character: ${opts.draft.identity.displayName}
Current world premise: ${opts.premise}
Current authored persona: ${opts.draft.profile.personaSummary}
Current authored goals: ${[...opts.draft.motivations.shortTermGoals, ...opts.draft.motivations.longTermGoals].join("; ") || "(none)"}
${buildPremiseDivergenceNote(opts.premiseDivergence)}

Search results:
${searchDigest}

Task:
- Extract canon-grounded facts for this character.
- Preserve canon conservatively while adapting only to the provided current world state.
- Return concrete abilities, signature moves, constraints, vulnerabilities, and power-profile assessments.
- Return selfImage as the character's internal self-conception, not a paraphrase of the outward persona blurb.
- socialRoles must be real titles/functions like teacher, clan heir, special grade sorcerer, commander. Never output generic labels like npc or character.
- Do not invent feats that are absent from the search evidence.
- Keep the output terse, concrete, and usable as the authoritative character grounding payload.`,
    temperature: Math.min(opts.role.temperature, 0.3),
    maxOutputTokens: clampTokens(opts.role.maxTokens),
  });

  let object: z.infer<typeof knownIpCharacterProfileSchema>;
  try {
    object = normalizeKnownIpCharacterProfile(rawObject, opts.draft);
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      throw error;
    }

    object = await repairKnownIpCharacterProfile({
      rawObject: recordFromUnknown(rawObject),
      missingFields: missingRequiredFields(error),
      draft: opts.draft,
      franchise: opts.franchise,
      role: opts.role,
      premise: opts.premise,
      premiseDivergence: opts.premiseDivergence,
      searchDigest,
    });
  }

  const canonSources = buildCanonSources(searchResults);
  if (canonSources.length === 0) {
    throw new Error(
      `Known-IP character research produced no usable canon sources for "${opts.draft.identity.displayName}".`,
    );
  }

  const sourceBundle = mergeSourceBundle(opts.draft.sourceBundle, canonSources);
  const continuity = buildContinuity(object, opts.draft.continuity);
  const hardConstraints = dedupeStrings([
    ...(opts.draft.identity.baseFacts?.hardConstraints ?? []),
    ...object.constraints,
    ...object.powerProfile.constraints,
  ]);
  const specialties = dedupeStrings([
    ...opts.draft.capabilities.specialties,
    ...object.signatureMoves,
  ]);

  const enrichedDraft: CharacterDraft = {
    ...opts.draft,
    identity: {
      ...opts.draft.identity,
      baseFacts: {
        biography:
          opts.draft.identity.baseFacts?.biography
          || opts.draft.profile.backgroundSummary
          || object.summary,
        socialRole: dedupeStrings(object.socialRoles),
        hardConstraints,
      },
      behavioralCore: {
        motives: opts.draft.identity.behavioralCore?.motives ?? [],
        pressureResponses: opts.draft.identity.behavioralCore?.pressureResponses ?? [],
        taboos: opts.draft.identity.behavioralCore?.taboos ?? [],
        attachments: opts.draft.identity.behavioralCore?.attachments ?? [],
        selfImage: object.selfImage,
      },
      liveDynamics: opts.draft.identity.liveDynamics,
    },
    capabilities: {
      ...opts.draft.capabilities,
      specialties,
    },
    sourceBundle,
    continuity,
    grounding: {
      summary: object.summary,
      facts: cappedStrings(object.facts, 6),
      abilities: cappedStrings(object.abilities, 8),
      constraints: cappedStrings([
        ...object.constraints,
        ...object.powerProfile.constraints,
      ], 5),
      signatureMoves: cappedStrings(object.signatureMoves, 5),
      strongPoints: cappedStrings([
        ...object.strongPoints,
        ...object.powerProfile.strengths,
      ], 6),
      vulnerabilities: cappedStrings([
        ...object.vulnerabilities,
        ...object.powerProfile.vulnerabilities,
      ], 5),
      uncertaintyNotes: cappedStrings([
        ...object.powerProfile.uncertaintyNotes,
        "Known-IP key NPC grounding is based on per-character canon research gathered during worldgen.",
      ], 5),
      powerProfile: {
        ...object.powerProfile,
        strengths: cappedStrings(object.powerProfile.strengths, 6),
        constraints: cappedStrings(object.powerProfile.constraints, 5),
        vulnerabilities: cappedStrings(object.powerProfile.vulnerabilities, 5),
        uncertaintyNotes: cappedStrings(object.powerProfile.uncertaintyNotes, 5),
      },
      sources: canonSources,
    },
  };

  return enrichedDraft;
}
