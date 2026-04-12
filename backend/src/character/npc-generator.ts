import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import type {
  CharacterDraft,
  CharacterIdentitySourceCitation,
} from "@worldforge/shared";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { buildV2CardSections } from "./v2-sections.js";
import { buildImportModeGuidance, normalizeImportedTags } from "./import-utils.js";
import type { CharacterImportMode } from "./import-utils.js";
import { fromLegacyScaffoldNpc } from "./record-adapters.js";
import { buildCharacterPromptContract } from "./prompt-contract.js";

const npcSchema = z.object({
  name: z.string(),
  race: z.string().max(100).default(""),
  gender: z.string().max(100).default(""),
  age: z.string().max(100).default(""),
  appearance: z.string().max(1000).default(""),
  backgroundSummary: z
    .string()
    .max(2000)
    .default("")
    .describe("Stable biography and world role facts that can lift into baseFacts."),
  personaSummary: z
    .string()
    .max(2000)
    .default("")
    .describe("Outward read, self-image, and behavioral cues that can lift into behavioralCore."),
  tags: z.array(z.string()).min(3).max(10),
  drives: z.array(z.string()).default([]),
  frictions: z.array(z.string()).default([]),
  shortTermGoals: z.array(z.string()).default([]),
  longTermGoals: z.array(z.string()).default([]),
  locationName: z.string(),
  factionName: z.string().nullable(),
});

type FlatGeneratedNpc = z.infer<typeof npcSchema>;

export type GeneratedNpc = CharacterDraft;

const NPC_DRAFT_CONTRACT = buildCharacterPromptContract({
  roleEmphasis:
    "For NPC drafting, use the shared draft pipeline: keep identity, profile, socialContext, motivations, capabilities, state, loadout, startConditions, and provenance coherent for one world-facing character.",
});

function buildNpcFlatOutputStrategy(options?: {
  includeSourceBundleGuidance?: boolean;
}): string {
  return [
    "- Return only the flat NPC generator fields from the schema: name, race, gender, age, appearance, backgroundSummary, personaSummary, drives, frictions, shortTermGoals, longTermGoals, tags, locationName, factionName.",
    "- backgroundSummary should preserve stable biography, role, and continuity facts that WorldForge can lift into baseFacts.",
    "- personaSummary should capture outward read, self-image, and behavioral feel instead of acting as the whole truth.",
    "- drives and frictions should capture durable motives and pressure cues that WorldForge can lift into behavioralCore.",
    "- shortTermGoals and longTermGoals should capture current momentum that WorldForge can lift into liveDynamics.",
    "- Do NOT emit nested baseFacts, behavioralCore, liveDynamics, sourceBundle, or continuity objects directly.",
    options?.includeSourceBundleGuidance
      ? "- When source material exists, keep canon-facing facts primary and use card voice/feel only as secondary cues that inform the flat output without overwriting canon or authored facts."
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function toNpcDraft(
  npc: FlatGeneratedNpc,
  opts?: {
    importMode?: CharacterImportMode | null;
    canonicalStatus?: CharacterDraft["identity"]["canonicalStatus"];
    sourceKind?: CharacterDraft["provenance"]["sourceKind"];
    sourceBundle?: CharacterDraft["sourceBundle"];
    continuity?: CharacterDraft["continuity"];
  },
): CharacterDraft {
  const normalizedTags = normalizeImportedTags(npc.tags, {
    max: opts?.importMode ? 8 : 10,
  });
  const draft = fromLegacyScaffoldNpc(
    {
      ...npc,
      persona: npc.personaSummary || npc.backgroundSummary,
      tags: normalizedTags,
      goals: {
        shortTerm: npc.shortTermGoals,
        longTerm: npc.longTermGoals,
      },
      tier: "key",
    },
    {
      canonicalStatus: opts?.canonicalStatus ?? "original",
      sourceKind: opts?.sourceKind ?? (opts?.importMode ? "import" : "generator"),
      originMode: opts?.importMode ?? "resident",
      factionName: npc.factionName,
      currentLocationName: npc.locationName,
    },
  );
  const socialRole = dedupeStrings([
    ...(draft.identity.baseFacts?.socialRole ?? []),
    draft.identity.role,
    npc.factionName ?? "",
  ]);

  return {
    ...draft,
    identity: {
      ...draft.identity,
      baseFacts: {
        biography: npc.backgroundSummary || draft.identity.baseFacts?.biography || "",
        socialRole,
        hardConstraints: draft.identity.baseFacts?.hardConstraints ?? [],
      },
      behavioralCore: {
        motives: dedupeStrings(npc.drives),
        pressureResponses: dedupeStrings(npc.frictions),
        taboos: draft.identity.behavioralCore?.taboos ?? [],
        attachments: draft.identity.behavioralCore?.attachments ?? [],
        selfImage:
          npc.personaSummary || draft.identity.behavioralCore?.selfImage || "",
      },
      liveDynamics: {
        activeGoals: dedupeStrings([
          ...npc.shortTermGoals,
          ...npc.longTermGoals,
        ]),
        beliefDrift: draft.identity.liveDynamics?.beliefDrift ?? [],
        currentStrains: dedupeStrings(npc.frictions),
        earnedChanges: draft.identity.liveDynamics?.earnedChanges ?? [],
      },
    },
    profile: {
      ...draft.profile,
      species: npc.race,
      gender: npc.gender,
      ageText: npc.age,
      appearance: npc.appearance,
      backgroundSummary: npc.backgroundSummary,
      personaSummary: npc.personaSummary,
    },
    motivations: {
      ...draft.motivations,
      drives: dedupeStrings(npc.drives),
      frictions: dedupeStrings(npc.frictions),
      shortTermGoals: dedupeStrings(npc.shortTermGoals),
      longTermGoals: dedupeStrings(npc.longTermGoals),
    },
    provenance: {
      ...draft.provenance,
      legacyTags: normalizedTags,
    },
    sourceBundle: opts?.sourceBundle,
    continuity: opts?.continuity,
  };
}

function dedupeStrings(values: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

function buildImportedNpcSourceBundle(opts: {
  description: string;
  personality: string;
  scenario: string;
  v2Tags: string[];
}): CharacterDraft["sourceBundle"] {
  const secondarySources: CharacterIdentitySourceCitation[] = [
    {
      kind: "card",
      label: "Card description",
      excerpt: opts.description,
    },
    {
      kind: "card",
      label: "Card personality",
      excerpt: opts.personality,
    },
    ...(opts.scenario
      ? [
          {
            kind: "card" as const,
            label: "Card scenario",
            excerpt: opts.scenario,
          },
        ]
      : []),
    ...(opts.v2Tags.length > 0
      ? [
          {
            kind: "card" as const,
            label: "Card tags",
            excerpt: opts.v2Tags.join(", "),
          },
        ]
      : []),
  ];

  return {
    canonSources: [],
    secondarySources: secondarySources.filter(
      (source) => source.excerpt.trim().length > 0,
    ),
    synthesis: {
      owner: "WorldForge",
      strategy: "flat-output-then-deterministic-npc-mapping",
      notes: [
        "Canon-facing facts and secondary cues stay distinct inside the shared source bundle.",
        "Compatibility persona, tags, and goals are derived after richer identity mapping.",
      ],
    },
  };
}

function buildImportedNpcContinuity(
  importMode: CharacterImportMode,
): CharacterDraft["continuity"] {
  return {
    identityInertia: "anchored",
    protectedCore: [
      "identity.baseFacts",
      "identity.behavioralCore",
      "sourceBundle.secondarySources",
    ],
    mutableSurface: [
      "identity.liveDynamics",
      "motivations.shortTermGoals",
      "socialContext.currentLocationName",
    ],
    changePressureNotes: [
      importMode === "outsider"
        ? "Preserve outsider continuity and off-setting history unless play earns deeper change."
        : "Preserve native-setting continuity and existing role logic unless play earns deeper change.",
    ],
  };
}

export async function parseNpcDescription(opts: {
  description: string;
  premise: string;
  locationNames: string[];
  factionNames: string[];
  role: ResolvedRole;
}): Promise<GeneratedNpc> {
  const prompt = `You are parsing a character description into a structured NPC for a text RPG.

SHARED CHARACTER CONTRACT:
${NPC_DRAFT_CONTRACT}

FLAT OUTPUT STRATEGY:
${buildNpcFlatOutputStrategy()}

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS (pick one as locationName):
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

KNOWN FACTIONS (pick one as factionName, or null if independent):
${opts.factionNames.map((n) => `- ${n}`).join("\n")}

CHARACTER DESCRIPTION:
${opts.description}

REQUIREMENTS:
- Extract or infer a name. If none given, create one fitting the world.
- Use the canonical field groups to reason about profile, socialContext, motivations, capabilities, sourceBundle, continuity, and provenance before WorldForge projects any compatibility aliases.
- race/gender/age/appearance: preserve explicit authored facts when present; otherwise use concise setting-fitting values or empty strings when genuinely unknown.
- backgroundSummary: 2-3 sentences capturing stable biography, world role, and facts that should survive as base truth.
- personaSummary: 2-3 sentences capturing outward read, self-image, and behavior cues without collapsing the NPC into a thin vibe line.
- drives: durable motives that explain what this NPC fundamentally wants.
- frictions: pressure responses, internal tensions, or fault lines that distinguish this NPC under stress.
- shortTermGoals: 1-3 immediate objectives.
- longTermGoals: 1-2 overarching ambitions.
- tags: evocative traits, skills, flaws (3-10). They are derived runtime tags, not the primary model.
- locationName MUST be one of KNOWN LOCATIONS.
- factionName: one of KNOWN FACTIONS or null if independent.`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: npcSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });
  return toNpcDraft(result.object, { sourceKind: "player-input" });
}

export async function mapV2CardToNpc(opts: {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  v2Tags: string[];
  importMode: CharacterImportMode;
  premise: string;
  locationNames: string[];
  factionNames: string[];
  role: ResolvedRole;
}): Promise<GeneratedNpc> {
  const sections = buildV2CardSections(opts);

  const prompt = `You are converting a SillyTavern character card into a structured NPC for a text RPG.

SHARED CHARACTER CONTRACT:
${NPC_DRAFT_CONTRACT}

FLAT OUTPUT STRATEGY:
${buildNpcFlatOutputStrategy({ includeSourceBundleGuidance: true })}

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS (pick one as locationName):
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

KNOWN FACTIONS (pick one as factionName, or null if independent):
${opts.factionNames.map((n) => `- ${n}`).join("\n")}

${sections}

REQUIREMENTS:
- Keep the character's name as "${opts.name}".
- Use the shared draft pipeline to keep profile, socialContext, motivations, capabilities, sourceBundle, continuity, and provenance consistent before projecting any compatibility output.
- race/gender/age/appearance: preserve explicit card facts when present; otherwise use concise setting-fitting values or empty strings when genuinely unknown.
- backgroundSummary: 2-3 sentences preserving stable biography, canon-facing facts when present, and outsider/native context from the source material.
- personaSummary: 2-3 sentences from description + personality fields, adapted to the chosen import mode. Treat card voice and feel as secondary cues, not primary truth.
- drives: durable motives drawn from the source material when present.
- frictions: pressure responses or internal tensions drawn from the source material when present.
- shortTermGoals: 1-3 current objectives inferred from description/personality/scenario when present.
- longTermGoals: 1-2 durable ambitions inferred from description/personality/scenario when present.
- tags: convert traits into evocative WorldForge tags (4-8).
- Tags must match the same house style as normal WorldForge generation: short Title Case role, trait, flaw, or skill tags.
- Prefer 1-3 word tags like Field Medic, Fearless, Signal Analyst, Noble-born.
- Avoid trope/meta sludge, fandom metadata, POV markers, formatting labels, or literal copies of source hyphen-tags.
- Preserve canon-facing facts and secondary cues separately so WorldForge can carry sourceBundle-style provenance without creating a separate canonical ontology.
- Keep outsider/native status in the biography and goals when relevant, not as tags like Offworld Origin.
- locationName MUST be one of KNOWN LOCATIONS.
- factionName: one of KNOWN FACTIONS or null.
- Source tags from SillyTavern are meta-tags — use as context, don't copy verbatim.
${buildImportModeGuidance(opts.importMode)}`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: npcSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });
  return toNpcDraft(result.object, {
    importMode: opts.importMode,
    canonicalStatus: "imported",
    sourceBundle: buildImportedNpcSourceBundle(opts),
    continuity: buildImportedNpcContinuity(opts.importMode),
  });
}

export async function generateNpcFromArchetype(opts: {
  archetype: string;
  premise: string;
  locationNames: string[];
  factionNames: string[];
  role: ResolvedRole;
  researchContext?: string | null;
}): Promise<GeneratedNpc> {
  const researchBlock = opts.researchContext
    ? `\nARCHETYPE RESEARCH:\n${opts.researchContext}\n`
    : "";

  const prompt = `You are creating an ORIGINAL NPC inspired by an archetype for a text RPG.

SHARED CHARACTER CONTRACT:
${NPC_DRAFT_CONTRACT}

FLAT OUTPUT STRATEGY:
${buildNpcFlatOutputStrategy()}

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS (pick one as locationName):
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

KNOWN FACTIONS (pick one as factionName, or null if independent):
${opts.factionNames.map((n) => `- ${n}`).join("\n")}

ARCHETYPE: "${opts.archetype}"
${researchBlock}

REQUIREMENTS:
- Create a WHOLLY ORIGINAL character inspired by the archetype — new name, new backstory.
- Do NOT copy the archetype directly. Capture the essence, not the specifics.
- Use the shared draft pipeline to keep profile, socialContext, motivations, capabilities, continuity, and provenance aligned while projecting compatibility aliases only after richer mapping.
- race/gender/age/appearance: concise setting-fitting facts or empty strings when genuinely unknown.
- backgroundSummary: 2-3 sentences capturing stable biography, world role, and facts that should survive as base truth.
- personaSummary: 2-3 sentences capturing outward read, self-image, and behavior cues rather than a generic archetype label.
- drives: durable motives grounded in this world's version of the archetype.
- frictions: pressure responses or internal tensions that make the NPC distinct from a generic archetype.
- shortTermGoals: immediate aims that put the NPC in motion now.
- longTermGoals: durable ambitions tied to their place in this world, not copied source material.
- tags: evocative traits (3-10). Reflect archetype qualities adapted to this world.
- locationName MUST be one of KNOWN LOCATIONS.
- factionName: one of KNOWN FACTIONS or null.
- Make the character compelling, flawed, and interesting.`;

  const result = await generateObject({
    model: createModel(opts.role.provider),
    schema: npcSchema,
    prompt,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });
  return toNpcDraft(result.object, {
    sourceKind: opts.researchContext ? "archetype" : "generator",
  });
}
