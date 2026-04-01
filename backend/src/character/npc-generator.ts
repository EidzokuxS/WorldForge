import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import type { CharacterDraft } from "@worldforge/shared";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { buildV2CardSections } from "./v2-sections.js";
import { buildImportModeGuidance, normalizeImportedTags } from "./import-utils.js";
import type { CharacterImportMode } from "./import-utils.js";
import { fromLegacyScaffoldNpc } from "./record-adapters.js";
import { buildCharacterPromptContract } from "./prompt-contract.js";

const npcSchema = z.object({
  name: z.string(),
  persona: z.string().describe("2-3 sentence personality/background summary"),
  tags: z.array(z.string()).min(3).max(10),
  goals: z.object({
    shortTerm: z.array(z.string()).min(1).max(3),
    longTerm: z.array(z.string()).min(1).max(2),
  }),
  locationName: z.string(),
  factionName: z.string().nullable(),
});

type LegacyGeneratedNpc = z.infer<typeof npcSchema>;

export type GeneratedNpc = CharacterDraft;

const NPC_DRAFT_CONTRACT = buildCharacterPromptContract({
  roleEmphasis:
    "For NPC drafting, use the shared draft pipeline: keep identity, profile, socialContext, motivations, capabilities, state, loadout, startConditions, and provenance coherent for one world-facing character.",
});

const NPC_COMPATIBILITY_OUTPUT_RULES = `Return the compatibility projection required by this schema:
- name maps from identity.displayName.
- persona is a compact summary drawn from profile and world role.
- tags are derived runtime tags: a compatibility view over the canonical profile, motivations, capabilities, state, and social context.
- goals.shortTerm and goals.longTerm map from motivations.
- locationName and factionName are socialContext aliases for the opening/current world position.`;

function toNpcDraft(
  npc: LegacyGeneratedNpc,
  opts?: {
    importMode?: CharacterImportMode | null;
    canonicalStatus?: CharacterDraft["identity"]["canonicalStatus"];
    sourceKind?: CharacterDraft["provenance"]["sourceKind"];
  },
): CharacterDraft {
  return fromLegacyScaffoldNpc(
    {
      ...npc,
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
}

export async function parseNpcDescription(opts: {
  description: string;
  premise: string;
  locationNames: string[];
  factionNames: string[];
  role: ResolvedRole;
}): Promise<GeneratedNpc> {
  const prompt = `You are parsing a character description into a structured NPC for a text RPG.

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS (pick one as locationName):
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

KNOWN FACTIONS (pick one as factionName, or null if independent):
${opts.factionNames.map((n) => `- ${n}`).join("\n")}

CHARACTER DESCRIPTION:
${opts.description}

SHARED CONTRACT:
${NPC_DRAFT_CONTRACT}
${NPC_COMPATIBILITY_OUTPUT_RULES}

REQUIREMENTS:
- Extract or infer a name. If none given, create one fitting the world.
- Use the canonical field groups to reason about profile, socialContext, motivations, capabilities, and provenance before projecting the compatibility fields below.
- persona: 2-3 sentences capturing personality, background, and role in the world.
- tags: evocative traits, skills, flaws (3-10). They are derived runtime tags, not the primary model.
- goals.shortTerm: 1-3 immediate objectives.
- goals.longTerm: 1-2 overarching ambitions.
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

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS (pick one as locationName):
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

KNOWN FACTIONS (pick one as factionName, or null if independent):
${opts.factionNames.map((n) => `- ${n}`).join("\n")}

${sections}

SHARED CONTRACT:
${NPC_DRAFT_CONTRACT}
${NPC_COMPATIBILITY_OUTPUT_RULES}

REQUIREMENTS:
- Keep the character's name as "${opts.name}".
- Use the shared draft pipeline to keep profile, socialContext, motivations, capabilities, and provenance consistent before projecting the compatibility output.
- persona: 2-3 sentences from description + personality fields, adapted to the chosen import mode.
- tags: convert traits into evocative WorldForge tags (4-8).
- Tags must match the same house style as normal WorldForge generation: short Title Case role, trait, flaw, or skill tags.
- Prefer 1-3 word tags like Field Medic, Fearless, Signal Analyst, Noble-born.
- Avoid trope/meta sludge, fandom metadata, POV markers, formatting labels, or literal copies of source hyphen-tags.
- Keep outsider/native status in persona and goals when relevant, not as tags like Offworld Origin.
- goals: infer from description/scenario. shortTerm: 1-3, longTerm: 1-2.
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
  return toNpcDraft({
    ...result.object,
    tags: normalizeImportedTags(result.object.tags, { max: 8 }),
  }, {
    importMode: opts.importMode,
    canonicalStatus: "imported",
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

WORLD PREMISE:
${opts.premise}

KNOWN LOCATIONS (pick one as locationName):
${opts.locationNames.map((n) => `- ${n}`).join("\n")}

KNOWN FACTIONS (pick one as factionName, or null if independent):
${opts.factionNames.map((n) => `- ${n}`).join("\n")}

ARCHETYPE: "${opts.archetype}"
${researchBlock}
SHARED CONTRACT:
${NPC_DRAFT_CONTRACT}
${NPC_COMPATIBILITY_OUTPUT_RULES}

REQUIREMENTS:
- Create a WHOLLY ORIGINAL character inspired by the archetype — new name, new backstory.
- Do NOT copy the archetype directly. Capture the essence, not the specifics.
- Use the shared draft pipeline to keep profile, socialContext, motivations, capabilities, and provenance aligned while projecting the compatibility output.
- persona: 2-3 sentences capturing personality, background, and role in the world.
- tags: evocative traits (3-10). Reflect archetype qualities adapted to this world.
- goals: motivated by the character's place in this world, not the source material.
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
