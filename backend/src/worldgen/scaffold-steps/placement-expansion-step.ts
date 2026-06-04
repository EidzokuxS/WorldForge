import { z } from "zod";
import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { createModel } from "../../ai/index.js";
import type { IpResearchContext } from "@worldforge/shared";
import type {
  GenerateScaffoldRequest,
  ScaffoldFaction,
  ScaffoldLocation,
  ScaffoldNpc,
} from "../types.js";
import {
  buildKnownIpGenerationContract,
  buildPremiseDivergenceBlock,
  buildScaffoldPromptContract,
  buildStopSlopRules,
  buildWorldgenResearchContextBlock,
} from "./prompt-utils.js";

const MAX_PLACEMENT_EXPANSION_ATTEMPTS = 3;
const MAX_NPCS_PER_SCENE = 3;

const placementExpansionSchema = z.object({
  scenes: z.array(z.object({
    name: z.string(),
    parentLocationName: z.string(),
    description: z.string(),
    tags: z.array(z.string()).default([]),
    connectedTo: z.array(z.string()).default([]),
  })).max(24).default([]),
  placements: z.array(z.object({
    npcName: z.string(),
    locationName: z.string(),
    sceneLocationName: z.string().nullable(),
    reason: z.string().default(""),
  })).max(32),
});

type PlacementExpansion = z.infer<typeof placementExpansionSchema>;

interface LocationEntry {
  name: string;
  kind: "macro" | "persistent_sublocation";
  parentLocationName: string | null;
}

interface LocationIndex {
  byLowerName: Map<string, LocationEntry>;
  macroNames: string[];
  childrenByMacro: Map<string, string[]>;
}

const NPC_PLACEMENT_EXPANSION_CONTRACT = buildScaffoldPromptContract({
  marker: "STRUCTURED_OUTPUT_CONTRACT: npc-placement-expansion.v1",
  title: "NPC placement expansion contract",
  requiredFields:
    'Return "scenes" and "placements". scenes are new persistent_sublocation rows only. placements assign each NPC to a broad macro locationName and concrete sceneLocationName.',
  nestedShapes:
    '"scenes": [{ "name": "Shibuya Station Concourse", "parentLocationName": "Shibuya", "description": "...", "tags": ["Transit"], "connectedTo": ["Shibuya"] }], "placements": [{ "npcName": "Mahito", "locationName": "Shibuya", "sceneLocationName": "Shibuya Station Concourse", "reason": "..." }]',
  caps:
    "Create as many scenes as the cast actually needs, up to 24. No scene should hold more than three active NPCs unless the reason is that they deliberately operate as one group.",
  nullableRules:
    "sceneLocationName may be null only for a genuinely roaming, background, or macro-scale actor. Do not leave multiple active NPCs broad-only in the same macro. parentLocationName must exactly match an existing macro location.",
  validMinimal:
    '{ "scenes": [], "placements": [{ "npcName": "Dr. Kel", "locationName": "Signal Base", "sceneLocationName": "Signal Base Control Room", "reason": "He works there." }] }',
  validExample:
    '{ "scenes": [{ "name": "Dogenzaka Alley", "parentLocationName": "Shibuya", "description": "A narrow commercial side street.", "tags": ["Alley"], "connectedTo": ["Shibuya"] }], "placements": [{ "npcName": "Scout", "locationName": "Shibuya", "sceneLocationName": "Dogenzaka Alley", "reason": "The scout watches side routes." }] }',
  invalidExamples: [
    '{ "placements": "everyone in Shibuya" }',
    '{ "scenes": [{ "name": "Hidden Leaf Office", "parentLocationName": "Shibuya" }] }',
    '{ "placements": [{ "npcName": "Mahito", "locationName": "Shibuya", "sceneLocationName": "Shibuya" }] }',
    '{ "placements": [{ "npcName": "Geto", "locationName": "Unknown Place", "sceneLocationName": null }] }',
  ],
});

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;

    const key = normalizeKey(trimmed);
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function buildLocationIndex(locations: readonly ScaffoldLocation[]): LocationIndex {
  const byLowerName = new Map<string, LocationEntry>();
  const macroNames: string[] = [];
  const childrenByMacro = new Map<string, string[]>();

  for (const location of locations) {
    const kind = location.kind === "persistent_sublocation"
      ? "persistent_sublocation"
      : "macro";
    const entry: LocationEntry = {
      name: location.name,
      kind,
      parentLocationName: kind === "persistent_sublocation"
        ? location.parentLocationName ?? null
        : null,
    };
    byLowerName.set(normalizeKey(location.name), entry);
    if (kind === "macro") {
      macroNames.push(location.name);
      childrenByMacro.set(location.name, []);
    }
  }

  for (const entry of byLowerName.values()) {
    if (entry.kind !== "persistent_sublocation" || !entry.parentLocationName) continue;
    const parent = findLocation(entry.parentLocationName, { byLowerName, macroNames, childrenByMacro });
    if (parent?.kind !== "macro") continue;
    childrenByMacro.set(parent.name, [
      ...(childrenByMacro.get(parent.name) ?? []),
      entry.name,
    ]);
  }

  return { byLowerName, macroNames, childrenByMacro };
}

function findLocation(
  name: string | null | undefined,
  index: LocationIndex,
): LocationEntry | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return index.byLowerName.get(normalizeKey(trimmed)) ?? null;
}

function resolveBroadMacroName(
  locationName: string,
  index: LocationIndex,
): string | null {
  const entry = findLocation(locationName, index);
  if (!entry) return null;
  if (entry.kind === "macro") return entry.name;
  return entry.parentLocationName;
}

function resolveSceneParentName(
  sceneLocationName: string | null | undefined,
  index: LocationIndex,
): string | null {
  const scene = findLocation(sceneLocationName, index);
  if (!scene) return null;
  return scene.kind === "macro" ? scene.name : scene.parentLocationName;
}

function formatLocations(locations: readonly ScaffoldLocation[]): string {
  return locations.map((location) => {
    const kind = location.kind === "persistent_sublocation" ? "persistent_sublocation" : "macro";
    const parent = kind === "persistent_sublocation"
      ? `; parent=${location.parentLocationName ?? "missing"}`
      : "";
    return `- ${location.name} [${kind}${parent}]: ${location.description} [Tags: ${location.tags.join(", ")}]`;
  }).join("\n");
}

function formatNpcs(npcs: readonly ScaffoldNpc[]): string {
  return npcs.map((npc) => {
    const role = npc.draft?.provenance?.worldgenOrigin ?? "unknown role";
    return [
      `- ${npc.name} (${npc.tier ?? "unknown"})`,
      `location=${npc.locationName}`,
      `scene=${npc.sceneLocationName ?? "none"}`,
      `faction=${npc.factionName ?? "none"}`,
      `role=${role}`,
      `persona=${npc.persona}`,
      `goals=${npc.goals.shortTerm.join("; ")} / ${npc.goals.longTerm.join("; ")}`,
    ].join("; ");
  }).join("\n");
}

function formatFactions(factions: readonly ScaffoldFaction[]): string {
  if (factions.length === 0) return "(none)";
  return factions.map((faction) =>
    `- ${faction.name}: goals=${faction.goals.join("; ")}; territory=${faction.territoryNames.join(", ")}`,
  ).join("\n");
}

function detectPlacementIssues(
  locations: readonly ScaffoldLocation[],
  npcs: readonly ScaffoldNpc[],
): string[] {
  const issues: string[] = [];
  const index = buildLocationIndex(locations);
  const npcsByMacro = new Map<string, ScaffoldNpc[]>();

  for (const npc of npcs) {
    const broadMacroName = resolveBroadMacroName(npc.locationName, index);
    if (!broadMacroName) {
      issues.push(`NPC "${npc.name}" has invalid locationName "${npc.locationName}".`);
      continue;
    }
    npcsByMacro.set(broadMacroName, [...(npcsByMacro.get(broadMacroName) ?? []), npc]);

    const scene = npc.sceneLocationName ? findLocation(npc.sceneLocationName, index) : null;
    if (!npc.sceneLocationName) continue;
    if (!scene) {
      issues.push(`NPC "${npc.name}" has invalid sceneLocationName "${npc.sceneLocationName}".`);
      continue;
    }
    const sceneParent = resolveSceneParentName(npc.sceneLocationName, index);
    if (sceneParent && sceneParent !== broadMacroName) {
      issues.push(
        `NPC "${npc.name}" sceneLocationName "${npc.sceneLocationName}" belongs under "${sceneParent}", not "${broadMacroName}".`,
      );
    }
  }

  for (const [macroName, macroNpcs] of npcsByMacro) {
    if (macroNpcs.length <= 1) continue;

    const concreteSceneCounts = new Map<string, number>();
    const broadOnly: string[] = [];

    for (const npc of macroNpcs) {
      const scene = npc.sceneLocationName ? findLocation(npc.sceneLocationName, index) : null;
      if (!scene || scene.kind === "macro") {
        broadOnly.push(npc.name);
        continue;
      }
      concreteSceneCounts.set(scene.name, (concreteSceneCounts.get(scene.name) ?? 0) + 1);
    }

    if (broadOnly.length > 0) {
      issues.push(
        `Macro "${macroName}" has multiple NPCs but these NPCs are still broad-only or macro-scoped: ${broadOnly.join(", ")}.`,
      );
    }

    const requiredSceneCount = Math.ceil(macroNpcs.length / MAX_NPCS_PER_SCENE);
    if (macroNpcs.length >= 4 && concreteSceneCounts.size < requiredSceneCount) {
      issues.push(
        `Macro "${macroName}" has ${macroNpcs.length} NPCs but only ${concreteSceneCounts.size} concrete scenes; use at least ${requiredSceneCount} scenes.`,
      );
    }

    for (const [sceneName, count] of concreteSceneCounts) {
      if (count > MAX_NPCS_PER_SCENE) {
        issues.push(
          `Scene "${sceneName}" contains ${count} NPCs; split the cast unless they deliberately operate as one group.`,
        );
      }
    }
  }

  return issues;
}

function applyExpansion(
  baseLocations: readonly ScaffoldLocation[],
  baseNpcs: readonly ScaffoldNpc[],
  expansion: PlacementExpansion,
): { locations: ScaffoldLocation[]; npcs: ScaffoldNpc[] } {
  const locations: ScaffoldLocation[] = [...baseLocations];
  let index = buildLocationIndex(locations);
  const newScenesByLowerName = new Set<string>();

  for (const scene of expansion.scenes) {
    const name = scene.name.trim();
    if (!name || findLocation(name, index) || newScenesByLowerName.has(normalizeKey(name))) {
      continue;
    }

    const parent = findLocation(scene.parentLocationName, index);
    if (!parent || parent.kind !== "macro") {
      continue;
    }

    const connectedTo = dedupeStrings([
      parent.name,
      ...scene.connectedTo
        .map((target) => findLocation(target, index)?.name ?? null),
    ]).filter((target) => normalizeKey(target) !== normalizeKey(name));

    locations.push({
      name,
      description: scene.description.trim() || `A focused scene inside ${parent.name}.`,
      tags: dedupeStrings(scene.tags).slice(0, 5),
      isStarting: false,
      connectedTo,
      kind: "persistent_sublocation",
      parentLocationName: parent.name,
    });
    newScenesByLowerName.add(normalizeKey(name));
    index = buildLocationIndex(locations);
  }

  const npcsByLowerName = new Map(baseNpcs.map((npc) => [normalizeKey(npc.name), npc]));
  const placementByNpc = new Map<string, PlacementExpansion["placements"][number]>();
  for (const placement of expansion.placements) {
    const npc = npcsByLowerName.get(normalizeKey(placement.npcName));
    if (!npc) continue;
    placementByNpc.set(normalizeKey(npc.name), placement);
  }

  const npcs = baseNpcs.map((npc): ScaffoldNpc => {
    const placement = placementByNpc.get(normalizeKey(npc.name));
    if (!placement) return npc;

    const scene = placement.sceneLocationName
      ? findLocation(placement.sceneLocationName, index)
      : null;
    const broadMacroName = scene
      ? resolveSceneParentName(scene.name, index)
      : resolveBroadMacroName(placement.locationName, index);
    if (!broadMacroName) return npc;

    return {
      ...npc,
      locationName: broadMacroName,
      sceneLocationName: scene?.name ?? null,
    };
  });

  return { locations, npcs };
}

export async function expandNpcPlacementScenes(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locations: readonly ScaffoldLocation[],
  factions: readonly ScaffoldFaction[],
  npcs: readonly ScaffoldNpc[],
  ipContext: IpResearchContext | null,
): Promise<{ locations: ScaffoldLocation[]; npcs: ScaffoldNpc[] }> {
  let currentLocations = [...locations];
  let currentNpcs = [...npcs];
  let issues = detectPlacementIssues(currentLocations, currentNpcs);

  if (issues.length === 0) {
    return { locations: currentLocations, npcs: currentNpcs };
  }

  const researchArtifact = req.researchArtifact ?? null;
  const ipBlock = buildWorldgenResearchContextBlock({
    researchArtifact,
    ipContext: researchArtifact ? null : ipContext,
    target: "npc placement",
  });
  const divergenceBlock = researchArtifact
    ? ""
    : buildPremiseDivergenceBlock(req.premiseDivergence ?? null);
  const knownIpContract = researchArtifact
    ? ""
    : buildKnownIpGenerationContract(
        ipContext,
        req.premiseDivergence ?? null,
        "npc placement",
      );

  let repairInstruction = "";

  for (let attempt = 0; attempt < MAX_PLACEMENT_EXPANSION_ATTEMPTS; attempt += 1) {
    const result = await generateObject({
      model: createModel(req.role.provider),
      schema: placementExpansionSchema,
      prompt: `You are expanding NPC placement for a text RPG world.

${NPC_PLACEMENT_EXPANSION_CONTRACT}
${repairInstruction}

WORLD PREMISE:
${refinedPremise}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}

CURRENT LOCATIONS:
${formatLocations(currentLocations)}

FACTIONS:
${formatFactions(factions)}

NPCs TO PLACE:
${formatNpcs(currentNpcs)}

PLACEMENT PROBLEMS TO FIX:
${issues.map((issue) => `- ${issue}`).join("\n")}

TASK:
- Create or reuse concrete contained scenes under the right macro locations so each NPC has a plausible place in the world.
- Do not treat a huge macro like Shibuya, Tokyo, a school, a city, or a district as one room.
- Do not merely create one token child scene per macro. Add enough scenes for the actual cast and their roles.
- Use existing scenes when they fit. Add new persistent_sublocation scenes when the cast needs shops, platforms, alleys, offices, classrooms, hideouts, checkpoints, rooftops, or other grounded places.
- Keep locationName as the broad macro. Put the specific place in sceneLocationName.
- Do not import source material that the research/source rules forbid.
- Return placements for every NPC, even if a placement is unchanged.

${buildStopSlopRules()}`,
      temperature: Math.min(req.role.temperature, 0.45),
      maxOutputTokens: req.role.maxTokens,
    });

    const applied = applyExpansion(currentLocations, currentNpcs, result.object);
    const nextIssues = detectPlacementIssues(applied.locations, applied.npcs);
    if (nextIssues.length === 0) {
      return applied;
    }

    currentLocations = applied.locations;
    currentNpcs = applied.npcs;
    issues = nextIssues;
    repairInstruction = `
NPC PLACEMENT REPAIR REQUIRED:
${issues.map((issue) => `- ${issue}`).join("\n")}
Return a complete corrected expansion. Keep valid new scenes from the current location list and add more only where needed.`;
  }

  throw new Error(
    `NPC placement expansion invalid after ${MAX_PLACEMENT_EXPANSION_ATTEMPTS} attempts: ${issues.join(" ")}`,
  );
}
