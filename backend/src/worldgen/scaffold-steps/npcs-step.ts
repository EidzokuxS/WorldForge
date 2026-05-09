import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../../ai/index.js";
import type { IpResearchContext } from "@worldforge/shared";
import { fromLegacyScaffoldNpc } from "../../character/record-adapters.js";
import { enrichNpcsBatch } from "../../character/enrich-npc-batch.js";
import type { EnrichNpcsBatchItem } from "../../character/enrich-npc-batch.js";
import type {
  IngestionClassification,
  IngestionContext,
} from "../../character/ingestion/types.js";
import {
  mapFlatPersonalityToNested,
  personalityFieldSchema,
} from "../../character/personality-schema.js";
import type {
  GenerateScaffoldRequest,
  GenerationProgress,
  ScaffoldLocation,
  ScaffoldNpc,
} from "../types.js";
import { buildCharacterPromptContract } from "../../character/prompt-contract.js";
import {
  buildCanonicalList,
  buildKnownIpGenerationContract,
  buildPremiseDivergenceBlock,
  formatNameList,
  buildScaffoldPromptContract,
  buildStopSlopRules,
  buildWorldgenResearchContextBlock,
  reportSubProgress,
} from "./prompt-utils.js";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const npcPlanSchema = z.object({
  npcs: z.array(
    z.object({
      name: z.string(),
      role: z.string().describe("1 line: what role this character plays"),
      locationName: z.string(),
      sceneLocationName: z.string().nullable().optional(),
      factionName: z.string().nullable(),
    })
  ),
});

/**
 * Per-entity detail schema. CRITICAL: No `name` field.
 * The planned name is authoritative (review fix #6).
 */
const npcDetailSingleSchema = z.object({
  persona: z
    .string()
    .describe(
      "2-3 sentences: personality, background, motivation. Concrete details, no vague archetypes."
    ),
  tags: z
    .array(z.string())
    .describe(
      "Character traits and skills: [Master Swordsman], [Cynical], [Wealthy]"
    ),
  goals: z
    .union([
      z.object({
        shortTerm: z.array(z.string()).min(1).max(3),
        longTerm: z.array(z.string()).min(1).max(3),
      }),
      z.object({
        short_term: z.array(z.string()).min(1).max(3),
        long_term: z.array(z.string()).min(1).max(3),
      }).transform((g) => ({ shortTerm: g.short_term, longTerm: g.long_term })),
    ])
    .catch({ shortTerm: ["Survive"], longTerm: ["Find purpose"] }),
  selfImage: z
    .string()
    .default("")
    .describe(
      "1 sentence: how this character privately frames their own role, worth, or burden. Must not duplicate persona verbatim."
    ),
  socialRoles: z
    .array(z.string())
    .default([])
    .describe(
      "1-3 concise in-world roles or statuses, e.g. [Teacher], [Clan Heir], [Border Commander]. Do not include generic system labels like NPC or player."
    ),
  ...personalityFieldSchema.shape,
});

const npcSampleLineRetrySchema = z.object({
  personalityVoice: z.string().max(600).default(""),
  personalitySampleLines: z.array(z.string().max(300)).min(2).max(3),
});

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PlannedNpc {
  name: string;
  role: string;
  locationName: string;
  sceneLocationName?: string | null;
  factionName: string | null;
  tier: "key" | "supporting";
}

interface LocationCatalogEntry {
  name: string;
  kind: "macro" | "persistent_sublocation";
  parentLocationName: string | null;
}

interface LocationCatalog {
  entries: LocationCatalogEntry[];
  allNames: string[];
  macroNames: string[];
  sceneNames: string[];
  byLowerName: Map<string, LocationCatalogEntry>;
}

interface DetailedNpc {
  name: string;
  persona: string;
  tags: string[];
  goals: { shortTerm: string[]; longTerm: string[] };
  selfImage: string;
  socialRoles: string[];
  personalitySummary: string;
  personalityVoice: string;
  personalityDecisionStyle: string;
  personalityWorldview: string;
  personalityContradictions: string[];
  personalityMythology: string;
  personalitySampleLines: string[];
}

function buildLocationCatalog(
  locations: readonly string[] | readonly ScaffoldLocation[],
): LocationCatalog {
  const entries = locations
    .map((location) => {
      if (typeof location === "string") {
        return {
          name: location,
          kind: "macro" as const,
          parentLocationName: null,
        };
      }
      return {
        name: location.name,
        kind: location.kind === "persistent_sublocation"
          ? "persistent_sublocation" as const
          : "macro" as const,
        parentLocationName: location.parentLocationName ?? null,
      };
    })
    .filter((entry) => entry.name.trim().length > 0);

  const byLowerName = new Map<string, LocationCatalogEntry>();
  for (const entry of entries) {
    byLowerName.set(entry.name.toLowerCase(), entry);
  }

  const allNames = entries.map((entry) => entry.name);
  const macroNames = entries
    .filter((entry) => entry.kind === "macro")
    .map((entry) => entry.name);
  const sceneNames = allNames;

  return {
    entries,
    allNames,
    macroNames: macroNames.length > 0 ? macroNames : allNames,
    sceneNames,
    byLowerName,
  };
}

function formatLocationCatalog(catalog: LocationCatalog): string {
  return catalog.entries.map((entry) => {
    if (entry.kind === "persistent_sublocation") {
      return `- ${entry.name} [persistent_sublocation; parent=${entry.parentLocationName ?? "missing"}]`;
    }
    return `- ${entry.name} [macro]`;
  }).join("\n");
}

interface PreviousNpcDetailContext {
  name: string;
  tier: string;
  persona: string;
  tags: string[];
  goals: { shortTerm: string[]; longTerm: string[] };
}

const WORLDGEN_NPC_DETAIL_CONTRACT = buildCharacterPromptContract({
  roleEmphasis:
    "For worldgen NPC details, use the shared draft pipeline: keep identity, profile, socialContext, motivations, capabilities, state, loadout, startConditions, and provenance coherent before projecting scaffold-compatible fields.",
});

const NPC_SCAFFOLD_PROMPT_CONTRACT = buildScaffoldPromptContract({
  marker: "STRUCTURED_OUTPUT_CONTRACT: scaffold-npc.v1",
  title: "NPC scaffold contract",
  requiredFields:
    'Plan returns "npcs"; each item has "name", "role", "locationName", "sceneLocationName", and "factionName". locationName remains broad macro/home; sceneLocationName must exactly match a known location or sublocation when scoped scene evidence exists. Detail returns persona, tags, goals, selfImage, socialRoles, and all personality fields. Do not classify source roles, canon status, or franchise ownership from location/NPC names.',
  nestedShapes:
    '"npcs": [{ "name": "Dr. Kel", "role": "Operates the signal array.", "locationName": "Signal Base", "sceneLocationName": "Observation Deck", "factionName": null }]; detail uses "goals": { "shortTerm": ["..."], "longTerm": ["..."] } and "personalitySampleLines": ["..."].',
  caps:
    "Key NPCs 6-10, supporting NPCs 3-5; tags 3-5; socialRoles 1-3; goals shortTerm/longTerm 1-2 each; personalitySampleLines 2-3 distinct lines.",
  nullableRules:
    '"factionName" may be null when unaffiliated. sceneLocationName may be null/omitted when no scoped scene evidence exists. Arrays stay arrays; use [] only for optional list fields with no source-backed content.',
  validMinimal:
    '{ "npcs": [{ "name": "Dr. Kel", "role": "Operates the signal array.", "locationName": "Signal Base", "sceneLocationName": "Observation Deck", "factionName": null }] }',
  validExample:
    '{ "persona": "Dr. Kel maps signal bursts and distrusts the Authority.", "tags": ["Signal Analyst"], "goals": { "shortTerm": ["Decode the new burst"], "longTerm": ["Expose the coverup"] }, "personalitySampleLines": ["..."] }',
  invalidExamples: [
    '{ "npcs": "Dr. Kel, Mara Voss" }',
    '{ "sceneLocationName": "Unknown Sublevel" }',
    '{ "factionName": "Unknown faction invented by backend" }',
    '{ "name": "Naruto Guard", "sourceRole": "backend inferred franchise from raw name" }',
    '{ "goals": ["Survive"], "personalitySampleLines": ["Hello", "I am Dr. Kel"] }',
  ],
});

const NPC_SOURCE_USES = new Set(["npcs", "characters", "cast"]);

function sourceAllowsNpcIdentity(rule: {
  role: string;
  useFor: string[];
  avoidFor: string[];
}): boolean {
  const avoided = rule.avoidFor.some((use) => NPC_SOURCE_USES.has(use.toLowerCase()));
  if (avoided) return false;

  return rule.role === "world_basis"
    || rule.useFor.some((use) => NPC_SOURCE_USES.has(use.toLowerCase()));
}

function normalizedNameParts(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function addNameKeys(keys: Set<string>, value: string): void {
  const parts = normalizedNameParts(value);
  if (parts.length === 0) return;

  keys.add(parts.join(" "));
  if (parts.length > 1) {
    keys.add([...parts].sort().join(" "));
  }
}

function artifactHasCanonicalCharacter(
  artifact: NonNullable<GenerateScaffoldRequest["researchArtifact"]>,
  npcName: string,
): boolean {
  const names = artifact.generatedContext.canonicalNames?.characters ?? [];
  if (names.length === 0) return false;

  const canonicalKeys = new Set<string>();
  for (const name of names) {
    addNameKeys(canonicalKeys, name);
  }

  const npcKeys = new Set<string>();
  addNameKeys(npcKeys, npcName);
  for (const key of npcKeys) {
    if (canonicalKeys.has(key)) return true;
  }

  return false;
}

function artifactNpcFranchiseForName(
  artifact: NonNullable<GenerateScaffoldRequest["researchArtifact"]> | null | undefined,
  npcName: string,
): string | null {
  if (!artifact || !artifactHasCanonicalCharacter(artifact, npcName)) return null;

  return artifact.researchBrief.sourceUsageRules.find(sourceAllowsNpcIdentity)?.sourceLabel ?? null;
}

function canonicalStatusFromContext(
  req: GenerateScaffoldRequest,
  ipContext: IpResearchContext | null,
  npcName: string,
): IngestionClassification["canonicalStatus"] {
  if (req.researchArtifact) {
    if (!artifactNpcFranchiseForName(req.researchArtifact, npcName)) {
      return "original";
    }

    return "known_ip_canonical";
  }

  if (!ipContext) return "original";

  return req.premiseDivergence && req.premiseDivergence.mode !== "canonical"
    ? "known_ip_diverged"
    : "known_ip_canonical";
}

function buildWorldgenNpcClassification(
  item: EnrichNpcsBatchItem,
  req: GenerateScaffoldRequest,
  ipContext: IpResearchContext | null,
): IngestionClassification {
  const artifactFranchise = artifactNpcFranchiseForName(
    req.researchArtifact,
    item.draft.identity.displayName,
  );
  if (artifactFranchise) {
    return {
      canonicalStatus: canonicalStatusFromContext(req, null, item.draft.identity.displayName),
      franchise: artifactFranchise,
      ipContext: null,
      premiseDivergence: null,
    };
  }

  if (req.researchArtifact) {
    return {
      canonicalStatus: "original",
      franchise: null,
      ipContext: null,
      premiseDivergence: null,
    };
  }

  if (ipContext) {
    return {
      canonicalStatus: canonicalStatusFromContext(req, ipContext, item.draft.identity.displayName),
      franchise: ipContext.franchise,
      ipContext,
      premiseDivergence: req.premiseDivergence ?? null,
    };
  }

  return {
    canonicalStatus: "original",
    franchise: null,
    ipContext: null,
    premiseDivergence: null,
  };
}

// ---------------------------------------------------------------------------
// Plan calls
// ---------------------------------------------------------------------------

async function planKeyNpcs(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationCatalog: LocationCatalog,
  factionNames: string[],
  ipContext: IpResearchContext | null,
): Promise<PlannedNpc[]> {
  const researchArtifact = req.researchArtifact ?? null;
  const ipBlock = buildWorldgenResearchContextBlock({
    researchArtifact,
    ipContext,
    target: "npcs",
  });
  const premiseDivergence = researchArtifact ? null : req.premiseDivergence ?? null;
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = researchArtifact
    ? ""
    : buildKnownIpGenerationContract(
        ipContext,
        premiseDivergence,
        "key npcs",
      );

  const canonChars = researchArtifact ? "" : buildCanonicalList(ipContext, "characters");

  const keyInstruction = researchArtifact
    ? `List 6-10 key characters using the research artifact source usage rules.
Use sources whose useFor includes npcs, characters, institutions, or world structure.
Do NOT import cast members, shinobi teams, clans, villages, or political offices from any source whose avoidFor includes npcs, locations, factions, or timeline.
If a source is only marked for power_system/mechanics, treat it as ability context only, not as cast authority.
Favor named characters or roles from the artifact's generated context when the artifact rules allow them for npcs.`
    : ipContext
    ? `List 6-10 CANONICAL characters from ${ipContext.franchise}.
${canonChars}
HARD RULE: Your character names MUST come from the canonical list above. Do NOT invent original characters for the key tier.
PROCEDURE:
1. Pick 6-10 names from the CANONICAL CHARACTERS list above.
2. Include canonical characters who are active in the PRESENT WORLD STATE after PREMISE DIVERGENCE.
3. If PREMISE DIVERGENCE says a canonical protagonist was replaced or is absent, do NOT include that character in the current cast unless the divergence explicitly says they still coexist.
4. Add other canon characters who would logically interact with the changed world state while preserving unaffected canon.
Copy-paste canonical full names exactly. Assign each to a location and faction from the lists below.`
    : `List 6-8 key characters who hold power, drive conflict, or control resources in this world. Each must connect to at least one faction or location. Ensure variety:
- At least 1 political leader
- At least 1 antagonist or rival
- At least 1 mentor or ally figure
- At least 1 wild card (spy, trickster, rogue agent)`;

  const prompt = `You are planning key NPCs for a text RPG world.

${NPC_SCAFFOLD_PROMPT_CONTRACT}

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS: ${locationCatalog.allNames.join(", ")}
${formatNameList(locationCatalog.allNames)}

KNOWN MACRO LOCATIONS (valid locationName values): ${locationCatalog.macroNames.join(", ")}
KNOWN SCENE LOCATIONS (valid sceneLocationName values): ${locationCatalog.sceneNames.join(", ")}
LOCATION HIERARCHY:
${formatLocationCatalog(locationCatalog)}

KNOWN FACTIONS:
${formatNameList(factionNames)}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
TASK: ${keyInstruction}

FIELD CONSTRAINTS:
- locationName: MUST exactly match one name from KNOWN MACRO LOCATIONS above. Copy-paste the name. locationName remains broad macro/home: use the broad home/base/district when a scoped sublocation is also known.
- sceneLocationName: MUST exactly match a known location or sublocation from KNOWN LOCATIONS when current scene evidence exists; sceneLocationName may be null/omitted when no scoped scene evidence exists. Never invent a scene name.
- factionName: MUST exactly match one name from KNOWN FACTIONS above, or be null if the character is unaffiliated.
- role: One sentence stating what this character DOES (their function in the world), not who they ARE.
Do not classify source roles, canon status, or franchise ownership from location/NPC names.

${buildStopSlopRules()}`;

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: z.object({
      // Treat plan generation as best-effort: ask for 6-10 in the prompt,
      // but don't fail the whole worldgen step if the model returns fewer.
      npcs: npcPlanSchema.shape.npcs.max(10),
    }),
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  return result.object.npcs.map((npc) => ({
    ...npc,
    ...normalizePlannedNpcPlacement(npc, locationCatalog),
    factionName: validateFaction(npc.factionName, factionNames),
    tier: "key" as const,
  }));
}

async function planSupportingNpcs(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationCatalog: LocationCatalog,
  factionNames: string[],
  ipContext: IpResearchContext | null,
  keyNames: string[],
): Promise<PlannedNpc[]> {
  const researchArtifact = req.researchArtifact ?? null;
  const ipBlock = buildWorldgenResearchContextBlock({
    researchArtifact,
    ipContext,
    target: "npcs",
  });
  const premiseDivergence = researchArtifact ? null : req.premiseDivergence ?? null;
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = researchArtifact
    ? ""
    : buildKnownIpGenerationContract(
        ipContext,
        premiseDivergence,
        "supporting npcs",
      );

  const supportingInstruction = researchArtifact
    ? `List 3-5 supporting characters using the research artifact source usage rules.
Use sources whose useFor includes npcs, characters, local roles, institutions, or world structure.
Do NOT import named cast, villages, clans, political offices, or faction structures from any source whose avoidFor includes npcs, locations, factions, or timeline.
If a source is only marked for power_system/mechanics, treat it as ability context only, not as cast authority.
Supporting characters must fill gameplay roles not covered by key characters: merchants, informants, gatekeepers, quest givers, local rivals.`
    : ipContext
    ? `List 3-5 supporting characters. These can be minor canonical characters or original characters created only where PREMISE DIVERGENCE or gameplay needs require them. They must fill GAMEPLAY roles not covered by key characters: merchants, informants, gatekeepers, quest givers, local rivals. Preserve unaffected canon support characters when they still fit the present world state.`
    : `List 3-5 supporting characters who serve specific gameplay functions. Each must offer the player something concrete: goods to buy, information to trade, jobs to accept, or obstacles to overcome.`;

  const prompt = `You are planning supporting NPCs for a text RPG world.

${NPC_SCAFFOLD_PROMPT_CONTRACT}

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS: ${locationCatalog.allNames.join(", ")}
${formatNameList(locationCatalog.allNames)}

KNOWN MACRO LOCATIONS (valid locationName values): ${locationCatalog.macroNames.join(", ")}
KNOWN SCENE LOCATIONS (valid sceneLocationName values): ${locationCatalog.sceneNames.join(", ")}
LOCATION HIERARCHY:
${formatLocationCatalog(locationCatalog)}

KNOWN FACTIONS:
${formatNameList(factionNames)}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
KEY CHARACTERS ALREADY PLANNED: ${keyNames.join(", ")}
Do NOT duplicate any key character. Supporting characters fill gaps — they give the player people to interact with in locations that lack key NPCs.

TASK: ${supportingInstruction}

FIELD CONSTRAINTS:
- locationName: MUST exactly match one name from KNOWN MACRO LOCATIONS above. Copy-paste the name. Prefer macro locations that have no key NPCs assigned yet. locationName remains broad macro/home: use the broad home/base/district when a scoped sublocation is also known.
- sceneLocationName: MUST exactly match a known location or sublocation from KNOWN LOCATIONS when current scene evidence exists; sceneLocationName may be null/omitted when no scoped scene evidence exists. Never invent a scene name.
- factionName: MUST exactly match one name from KNOWN FACTIONS above, or be null if unaffiliated.
- role: One sentence stating this character's GAMEPLAY FUNCTION (what they offer the player), not personality.
Do not classify source roles, canon status, or franchise ownership from location/NPC names.

${buildStopSlopRules()}`;

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: z.object({
      // Supporting NPCs are additive; partial output is still usable.
      npcs: npcPlanSchema.shape.npcs.max(5),
    }),
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  return result.object.npcs.map((npc) => ({
    ...npc,
    ...normalizePlannedNpcPlacement(npc, locationCatalog),
    factionName: validateFaction(npc.factionName, factionNames),
    tier: "supporting" as const,
  }));
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function findLocationEntry(
  locationName: string,
  catalog: LocationCatalog,
): LocationCatalogEntry | null {
  return catalog.byLowerName.get(locationName.trim().toLowerCase()) ?? null;
}

function validateSceneLocation(
  sceneLocationName: string | null | undefined,
  catalog: LocationCatalog,
): string | null {
  const trimmed = sceneLocationName?.trim();
  if (!trimmed) return null;

  // Explicit scene placement is scoped evidence. Do not repair it to a broad
  // fallback because that hides namespace bugs in generated sublocations.
  const match = findLocationEntry(trimmed, catalog);
  if (match) return match.name;

  throw new Error(
    `Invalid sceneLocationName "${sceneLocationName}". It must exactly match a known location or sublocation name.`,
  );
}

function normalizePlannedNpcPlacement(
  npc: Pick<PlannedNpc, "locationName" | "sceneLocationName" | "name">,
  catalog: LocationCatalog,
): Pick<PlannedNpc, "locationName" | "sceneLocationName"> {
  const sceneLocationName = validateSceneLocation(npc.sceneLocationName, catalog);
  const broadEntry = findLocationEntry(npc.locationName, catalog);
  const sceneEntry = sceneLocationName
    ? findLocationEntry(sceneLocationName, catalog)
    : null;

  if (broadEntry?.kind === "macro") {
    return {
      locationName: broadEntry.name,
      sceneLocationName,
    };
  }

  if (broadEntry?.kind === "persistent_sublocation") {
    const parentName = broadEntry.parentLocationName;
    const parentEntry = parentName ? findLocationEntry(parentName, catalog) : null;
    if (parentEntry?.kind !== "macro") {
      throw new Error(
        `Invalid locationName "${npc.locationName}" for NPC "${npc.name}". Sublocation broad placement requires a macro parent.`,
      );
    }
    return {
      locationName: parentEntry.name,
      sceneLocationName: sceneLocationName ?? broadEntry.name,
    };
  }

  if (sceneEntry?.kind === "macro") {
    return {
      locationName: sceneEntry.name,
      sceneLocationName: sceneEntry.name,
    };
  }

  if (sceneEntry?.kind === "persistent_sublocation") {
    const parentName = sceneEntry.parentLocationName;
    const parentEntry = parentName ? findLocationEntry(parentName, catalog) : null;
    if (parentEntry?.kind === "macro") {
      return {
        locationName: parentEntry.name,
        sceneLocationName: sceneEntry.name,
      };
    }
  }

  throw new Error(
    `Invalid locationName "${npc.locationName}" for NPC "${npc.name}". It must match a known macro location.`,
  );
}

function validateFaction(
  factionName: string | null,
  factionNames: string[],
): string | null {
  if (factionName === null) return null;
  if (factionNames.length === 0) return null;

  // Exact match
  if (factionNames.includes(factionName)) return factionName;

  // Case-insensitive match
  const lower = factionName.toLowerCase();
  const match = factionNames.find((n) => n.toLowerCase() === lower);
  if (match) return match;

  // Unknown faction -> null
  return null;
}

function buildPreviousNpcSection(
  previouslyDetailed: PreviousNpcDetailContext[],
  mode: "full" | "compact" | "none",
): string {
  if (mode === "none" || previouslyDetailed.length === 0) {
    return "";
  }

  if (mode === "compact") {
    return `ALREADY DETAILED NPCs:\n${previouslyDetailed.map((n) =>
      `- ${n.name} (${n.tier}) [Tags: ${n.tags.slice(0, 3).join(", ")}]`
    ).join("\n")}\n`;
  }

  return `ALREADY DETAILED NPCs:\n${previouslyDetailed.map((n) =>
    `- ${n.name} (${n.tier}): ${n.persona} [Tags: ${n.tags.join(", ")}] [Goals: ${n.goals.shortTerm.join("; ")} / ${n.goals.longTerm.join("; ")}]`
  ).join("\n")}\n`;
}

function shouldRetrySampleLines(lines: string[]): boolean {
  const trimmed = lines.map((line) => line.trim()).filter(Boolean);
  if (trimmed.length === 0) return true;
  if (trimmed.every((line) => line.length < 15)) return true;

  const genericRe = /^(I am|I'm|Hello|Greetings|My name)/i;
  if (trimmed.every((line) => genericRe.test(line))) return true;

  const lower = trimmed.map((line) => line.toLowerCase());
  if (lower.length > 1 && lower.every((line) => line === lower[0])) return true;

  return false;
}

async function generateNpcDetail(opts: {
  req: GenerateScaffoldRequest;
  npc: PlannedNpc;
  refinedPremise: string;
  locationNames: string[];
  factionNames: string[];
  allPlanned: PlannedNpc[];
  ipBlock: string;
  knownIpContract: string;
  divergenceBlock: string;
  ipPersonaRule: string;
  previouslyDetailed: PreviousNpcDetailContext[];
}): Promise<z.infer<typeof npcDetailSingleSchema>> {
  const attemptModes: Array<"full" | "compact" | "none"> = ["full", "compact", "none"];
  let lastError: Error | undefined;

  for (const mode of attemptModes) {
    const previousSection = buildPreviousNpcSection(opts.previouslyDetailed, mode);
    const prompt = `You are detailing a single NPC for a text RPG engine. The engine reads these fields mechanically -- follow the format exactly.

${NPC_SCAFFOLD_PROMPT_CONTRACT}

WORLD PREMISE:
${opts.refinedPremise}

KNOWN LOCATIONS: ${opts.locationNames.join(", ")}
KNOWN FACTIONS: ${opts.factionNames.join(", ")}
ALL NPCs IN THIS WORLD: ${opts.allPlanned.map((n) => `${n.name} (${n.tier})`).join(", ")}
${opts.ipBlock}
${opts.knownIpContract ? `${opts.knownIpContract}\n` : ""}${opts.divergenceBlock ? `${opts.divergenceBlock}\n` : ""}
${previousSection}
NPC TO DETAIL NOW: "${opts.npc.name}" (${opts.npc.tier})
Role: ${opts.npc.role}
Location: ${opts.npc.locationName}, Faction: ${opts.npc.factionName ?? "none"}
Scene: ${opts.npc.sceneLocationName ?? "none"}

SHARED CONTRACT:
${WORLDGEN_NPC_DETAIL_CONTRACT}

FIELD INSTRUCTIONS:
- persona: Exactly 2-3 sentences. Sentence 1 = who they are and their background. Sentence 2 = personality and how they treat others. Sentence 3 (optional) = a specific skill, secret, or relationship that matters for gameplay. Never write "mysterious" or "enigmatic" -- state concrete facts. Consider relationships with ALREADY DETAILED NPCs above -- reference them by name where relevant.
- selfImage: Exactly 1 sentence in this character's own frame. What do they privately think they are, owe, protect, deserve, or refuse to become? This must add something new beyond persona.
- socialRoles: 1-3 concise in-world roles/statuses. Good: [Teacher], [Special Grade Sorcerer], [Clan Heir], [Border Commander]. Bad: [NPC], [Character], [Important Person].
- tags: Gameplay-relevant traits and skills. Format: [Trait] or [Skill]. Examples: [Master Swordsman], [Cynical], [Wealthy], [Poisoner], [Charismatic], [Illiterate]. 3-5 tags per NPC.
- goals: An object with EXACTLY two keys: "shortTerm" and "longTerm".
  - "shortTerm": array of 1-2 strings. Current objectives the character is actively pursuing RIGHT NOW.
  - "longTerm": array of 1-2 strings. Life ambitions or multi-year plans.
  - CRITICAL: The keys MUST be "shortTerm" and "longTerm" (camelCase).
- personalitySummary: 1-2 sentences distilling the NPC's stable interior personality. Do not duplicate persona verbatim.
- personalityVoice: 1-2 sentences describing how this NPC sounds when speaking: rhythm, register, emotional masking, and habits.
- personalityDecisionStyle: 1 sentence describing how they choose under pressure.
- personalityWorldview: 1 sentence describing what they think is true about power, people, duty, fate, or survival.
- personalityContradictions: 1-3 strings describing tensions, hypocrisies, or unresolved splits inside the NPC.
- personalityMythology: 1 sentence describing the private story they tell themselves about who they are.
- personalitySampleLines: 2-3 direct quotes the NPC would actually say. No narrator framing. No greetings like "Hello" or self-introductions like "I am X". Each line must be at least 15 characters and distinct from the others.
${opts.ipPersonaRule}

OUTPUT LIMITS:
- Keep persona under 120 words.
- Keep selfImage to one sentence.
- Return only the required JSON payload; do not include commentary.

${buildStopSlopRules()}`;

    try {
      const detail = await generateObject({
        model: createModel(opts.req.role.provider),
        schema: npcDetailSingleSchema,
        prompt,
        temperature: Math.min(opts.req.role.temperature, 0.35),
        maxOutputTokens: opts.req.role.maxTokens,
        retries: 1,
      });
      return detail.object;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error(`Failed to generate NPC detail for ${opts.npc.name}.`);
}

async function retrySampleLines(opts: {
  req: GenerateScaffoldRequest;
  npcName: string;
  npcRole: string;
  firstPersona: string;
  firstVoice: string;
  firstContradictions: string[];
}): Promise<z.infer<typeof npcSampleLineRetrySchema>> {
  const prompt = `You are repairing the VOICE + SAMPLE LINES for an RPG NPC.

${NPC_SCAFFOLD_PROMPT_CONTRACT}

The first attempt produced empty, generic, or repetitive sample lines. Return a better result.

NPC: "${opts.npcName}"
Role: ${opts.npcRole}
Persona excerpt: ${opts.firstPersona}
Previous voice attempt: ${opts.firstVoice || "(blank)"}
Known contradictions: ${opts.firstContradictions.join("; ") || "(none)"}

RULES:
- Return only personalityVoice and personalitySampleLines.
- personalityVoice must describe speaking rhythm, register, and emotional masking in prose.
- personalitySampleLines must be 2-3 direct quotes the NPC would actually say.
- Each sample line must be at least 15 characters long.
- Do not use greetings like "Hello" or self-introductions like "I am X".
- Do not repeat the same line with minor wording changes.
- Do not add narrator framing or stage directions.`;

  const result = await generateObject({
    model: createModel(opts.req.role.provider),
    schema: npcSampleLineRetrySchema,
    prompt,
    temperature: Math.min(opts.req.role.temperature, 0.35),
    maxOutputTokens: opts.req.role.maxTokens,
    retries: 1,
  });

  return result.object;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate NPCs in two tiers (key + supporting) via plan+detail mini-calls.
 *
 * Key NPCs (6-10): canonical characters for known IPs, or plot-driving
 * characters for original worlds.
 *
 * Supporting NPCs (3-5): gap-filling characters (merchants, informants, etc.)
 *
 * Total: 10-15 NPCs, each with a `tier` field.
 *
 * Detail calls are per-entity (1 NPC per LLM call) with a cross-tier
 * accumulator so each subsequent NPC sees full details of all previously
 * detailed NPCs.
 */
export async function generateNpcsStep(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locations: string[] | ScaffoldLocation[],
  factionNames: string[],
  ipContext: IpResearchContext | null,
  additionalInstruction?: string,
  onProgress?: (progress: GenerationProgress) => void,
  progressStep?: number,
  progressTotalSteps?: number,
): Promise<ScaffoldNpc[]> {
  const researchArtifact = req.researchArtifact ?? null;
  const effectiveIpContext = researchArtifact ? null : ipContext;
  const effectivePremiseDivergence = researchArtifact
    ? null
    : req.premiseDivergence ?? null;
  const effectiveReq = researchArtifact
    ? { ...req, premiseDivergence: null }
    : req;
  const locationCatalog = buildLocationCatalog(locations);
  const locationNames = locationCatalog.allNames;

  // Phase A: Plan key NPCs
  const keyPlanned = await planKeyNpcs(
    effectiveReq,
    refinedPremise,
    locationCatalog,
    factionNames,
    effectiveIpContext,
  );

  const keyNames = keyPlanned.map((n) => n.name);

  // Phase B: Plan supporting NPCs
  const supportingPlanned = await planSupportingNpcs(
    effectiveReq,
    refinedPremise,
    locationCatalog,
    factionNames,
    effectiveIpContext,
    keyNames,
  );

  // Combine all planned NPCs
  const allPlanned: PlannedNpc[] = [...keyPlanned, ...supportingPlanned];

  // Compute shared prompt blocks once (constant for entire step)
  const ipBlock = buildWorldgenResearchContextBlock({
    researchArtifact,
    ipContext: effectiveIpContext,
    target: "npcs",
  });
  const premiseDivergence = effectivePremiseDivergence;
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = researchArtifact
    ? ""
    : buildKnownIpGenerationContract(
        ipContext,
        premiseDivergence,
        "npc details",
      );
  const ipPersonaRule = researchArtifact
    ? `- For artifact-backed characters: follow the artifact source usage rules. Use sources allowed for npcs/characters as identity context, and use power_system-only sources only to describe abilities or combat style. Do not import named cast or affiliations from sources whose avoidFor includes npcs.`
    : effectiveIpContext
    ? `- For known-IP characters: describe their canonical personality and backstory as modified by the present world state. Keep unaffected canon details intact, but do NOT reintroduce replaced protagonists or reverted relationships unless PREMISE DIVERGENCE explicitly says they coexist.`
    : "";

  // Phase C: Detail all NPCs sequentially (per-entity, not batched)
  const allDetailed: DetailedNpc[] = [];
  const previouslyDetailed: PreviousNpcDetailContext[] = [];

  for (let i = 0; i < allPlanned.length; i++) {
    const npc = allPlanned[i]!;
    const step = progressStep ?? 0;
    const total = progressTotalSteps ?? 1;

    if (onProgress) {
      reportSubProgress(
        onProgress,
        step,
        total,
        "Creating NPCs...",
        i,
        allPlanned.length,
        `NPC: ${npc.name} (${npc.tier})`,
      );
    }

    const detail = await generateNpcDetail({
      req: effectiveReq,
      npc,
      refinedPremise,
      locationNames,
      factionNames,
      allPlanned,
      ipBlock,
      knownIpContract,
      divergenceBlock,
      ipPersonaRule,
      previouslyDetailed,
    });

    let finalDetail = detail;
    if (shouldRetrySampleLines(detail.personalitySampleLines)) {
      try {
        const repaired = await retrySampleLines({
          req: effectiveReq,
          npcName: npc.name,
          npcRole: npc.role,
          firstPersona: detail.persona,
          firstVoice: detail.personalityVoice,
          firstContradictions: detail.personalityContradictions,
        });

        finalDetail = {
          ...detail,
          personalityVoice: repaired.personalityVoice || detail.personalityVoice,
          personalitySampleLines: repaired.personalitySampleLines,
        };
      } catch {
        finalDetail = detail;
      }
    }

    // REVIEW FIX #6: Force planned name as authoritative
    allDetailed.push({
      name: npc.name, // From plan, NOT from LLM output
      persona: finalDetail.persona,
      tags: finalDetail.tags,
      goals: finalDetail.goals,
      selfImage: finalDetail.selfImage,
      socialRoles: finalDetail.socialRoles,
      personalitySummary: finalDetail.personalitySummary,
      personalityVoice: finalDetail.personalityVoice,
      personalityDecisionStyle: finalDetail.personalityDecisionStyle,
      personalityWorldview: finalDetail.personalityWorldview,
      personalityContradictions: finalDetail.personalityContradictions,
      personalityMythology: finalDetail.personalityMythology,
      personalitySampleLines: finalDetail.personalitySampleLines,
    });

    // Track for subsequent calls -- FULL detail, not truncated
    previouslyDetailed.push({
      name: npc.name, // Forced from plan
      tier: npc.tier,
      persona: finalDetail.persona,
      tags: finalDetail.tags,
      goals: finalDetail.goals,
    });
  }

  // Merge plan + detail data
  const result: ScaffoldNpc[] = [];

  for (const detail of allDetailed) {
    const planEntry = allPlanned.find(
      (p) => p.name.toLowerCase() === detail.name.toLowerCase(),
    );
    const locationName = planEntry?.locationName ?? locationNames[0] ?? "";
    const sceneLocationName = planEntry?.sceneLocationName ?? null;
    const factionName = planEntry?.factionName ?? null;
    const tier = planEntry?.tier ?? "supporting";
    const canonicalStatus = canonicalStatusFromContext(effectiveReq, effectiveIpContext, detail.name);

    const legacyNpc = {
      name: detail.name,
      persona: detail.persona,
      tags: detail.tags,
      goals: detail.goals,
      locationName,
      sceneLocationName,
      factionName,
      tier,
    } satisfies ScaffoldNpc;

    const roleLabels = dedupeStrings([
      ...detail.socialRoles,
      planEntry?.role ?? "",
      factionName ?? "",
    ]);

    let draft = fromLegacyScaffoldNpc(legacyNpc, {
      canonicalStatus,
      sourceKind: "worldgen",
      currentLocationName: locationName,
      factionName,
      originMode: "resident",
    });

    draft = {
      ...draft,
      identity: {
        ...draft.identity,
        baseFacts: {
          biography: draft.identity.baseFacts?.biography ?? "",
          socialRole: roleLabels,
          hardConstraints: draft.identity.baseFacts?.hardConstraints ?? [],
        },
        personality: mapFlatPersonalityToNested({
          personalitySummary: detail.personalitySummary || detail.persona.trim(),
          personalityVoice: detail.personalityVoice,
          personalityDecisionStyle: detail.personalityDecisionStyle,
          personalityWorldview: detail.personalityWorldview,
          personalityContradictions: detail.personalityContradictions,
          personalityMythology: detail.personalityMythology,
          personalitySampleLines: detail.personalitySampleLines,
        }),
        behavioralCore: {
          motives: draft.identity.behavioralCore?.motives ?? [],
          pressureResponses: draft.identity.behavioralCore?.pressureResponses ?? [],
          taboos: draft.identity.behavioralCore?.taboos ?? [],
          attachments: draft.identity.behavioralCore?.attachments ?? [],
          selfImage: detail.selfImage.trim(),
        },
      },
    };

    result.push({
      ...legacyNpc,
      draft: {
        ...draft,
        provenance: {
          ...draft.provenance,
          worldgenOrigin: planEntry?.role ?? null,
        },
      },
    });
  }

  if (result.length > 0) {
    const ctx = {
      gen: req.role,
      campaign: {
        premise: refinedPremise,
        ipContext: effectiveIpContext,
        premiseDivergence: effectivePremiseDivergence,
      },
      settings: {
        research: req.research,
      } as IngestionContext["settings"],
      locationNames,
      factionNames,
    } as IngestionContext;

    const enrichedDrafts = await enrichNpcsBatch({
      items: result.map((npc) => ({
        draft: npc.draft!,
        tier: npc.tier ?? "supporting",
      })),
      buildClassification: (item) =>
        buildWorldgenNpcClassification(item, effectiveReq, effectiveIpContext),
      ctx,
    });

    for (let i = 0; i < result.length; i++) {
      result[i] = {
        ...result[i]!,
        draft: enrichedDrafts[i]!,
      };
    }
  }

  // If additionalInstruction provided, it was already considered in the prompts
  // (unused in current flow but kept for signature compatibility)
  void additionalInstruction;

  return result;
}
function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (key === "npc" || key === "player" || seen.has(key)) continue;

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}
