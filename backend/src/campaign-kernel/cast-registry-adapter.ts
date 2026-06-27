import type {
  CharacterDraft,
  CampaignCastRole,
  CampaignCastImportance,
  CampaignCastMember,
  CampaignCastPlacement,
  CampaignCastRegistry,
  CampaignCastSource,
} from "@worldforge/shared";
import type { ScaffoldNpc } from "../worldgen/types.js";
import {
  fromLegacyScaffoldNpc,
  reconcileDraftBackedScaffoldNpc,
} from "../character/record-adapters.js";
import { AppError } from "../lib/index.js";

export type CampaignPlayerCastSource = "player_created" | "player_imported";
export type CampaignNpcCastSource = "npc_imported" | "npc_generated";

export interface CampaignCastPlacementInput {
  locationId?: string | null;
  sceneLocationId?: string | null;
  notes?: readonly string[];
}

export interface CampaignDraftCastInput {
  draft: CharacterDraft;
  source: CampaignNpcCastSource;
  campaignRole?: CampaignCastRole;
  importance?: CampaignCastImportance;
  placement?: CampaignCastPlacementInput;
}

export interface CampaignScaffoldNpcCastInput {
  npc: ScaffoldNpc;
  source: CampaignNpcCastSource;
  campaignRole?: CampaignCastRole;
  importance?: CampaignCastImportance;
  placement?: CampaignCastPlacementInput;
}

export interface BuildCampaignCastRegistryInput {
  playerCharacter?: {
    draft: CharacterDraft;
    source?: CampaignPlayerCastSource;
    placement?: CampaignCastPlacementInput;
  } | null;
  importedCast?: readonly (CampaignDraftCastInput | CampaignScaffoldNpcCastInput)[];
  generatedCast?: readonly (CampaignDraftCastInput | CampaignScaffoldNpcCastInput)[];
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeName(draft: CharacterDraft): string {
  const name = draft.identity.displayName.trim();
  if (!name) {
    throw new AppError("Cast member name is required before A5 can run.", 400);
  }
  return name;
}

function castNameKey(name: string): string {
  return name.toLocaleLowerCase("en-US");
}

function castMemberId(source: CampaignCastSource, name: string): string {
  const readable = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = hashText(`${source}:${name}`);
  return `cast:${source}:${readable ? `${readable}-` : ""}${hash}`;
}

function normalizeNotes(notes: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const note of notes ?? []) {
    const normalized = note.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLocaleLowerCase("en-US");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function resolvePlacement(
  draft: CharacterDraft,
  placement: CampaignCastPlacementInput | undefined,
): CampaignCastPlacement {
  const notes = normalizeNotes([
    ...(placement?.notes ?? []),
    ...(draft.socialContext.currentLocationName
      ? [`currentLocationName=${draft.socialContext.currentLocationName}`]
      : []),
    ...(draft.startConditions.startLocationId
      ? [`startLocationId=${draft.startConditions.startLocationId}`]
      : []),
  ]);

  return {
    locationId:
      placement?.locationId
      ?? draft.socialContext.currentLocationId
      ?? draft.startConditions.startLocationId
      ?? null,
    sceneLocationId: placement?.sceneLocationId ?? null,
    notes,
  };
}

function defaultNpcRole(draft: CharacterDraft): CampaignCastRole {
  if (draft.identity.tier === "key") {
    return "major_npc";
  }
  if (draft.identity.tier === "temporary") {
    return "background";
  }
  return "minor_npc";
}

function defaultNpcImportance(draft: CharacterDraft): CampaignCastImportance {
  if (draft.identity.tier === "key") {
    return "major";
  }
  if (draft.identity.tier === "temporary") {
    return "background";
  }
  return "minor";
}

function normalizeScaffoldNpcDraft(
  input: CampaignScaffoldNpcCastInput,
): CharacterDraft {
  if (input.npc.draft) {
    return reconcileDraftBackedScaffoldNpc(input.npc as ScaffoldNpc & { draft: CharacterDraft });
  }

  return fromLegacyScaffoldNpc(input.npc, {
    sourceKind: input.source === "npc_generated" ? "worldgen" : "import",
    currentLocationName: input.npc.locationName,
    factionName: input.npc.factionName,
  });
}

function isScaffoldNpcInput(
  input: CampaignDraftCastInput | CampaignScaffoldNpcCastInput,
): input is CampaignScaffoldNpcCastInput {
  return "npc" in input;
}

function createCastMember(
  input: CampaignDraftCastInput | CampaignScaffoldNpcCastInput,
): CampaignCastMember {
  let scaffoldInput: CampaignScaffoldNpcCastInput | null = null;
  let draft: CharacterDraft;
  if (isScaffoldNpcInput(input)) {
    scaffoldInput = input;
    draft = normalizeScaffoldNpcDraft(scaffoldInput);
  } else {
    draft = input.draft;
  }
  const name = normalizeName(draft);
  const campaignRole = input.campaignRole ?? defaultNpcRole(draft);
  const importance = input.importance ?? defaultNpcImportance(draft);
  const placement = scaffoldInput?.npc.sceneLocationName
    ? {
        ...input.placement,
        notes: [
          ...(input.placement?.notes ?? []),
          `sceneLocationName=${scaffoldInput.npc.sceneLocationName}`,
        ],
      }
    : input.placement;

  return {
    id: castMemberId(input.source, name),
    source: input.source,
    characterDraft: {
      ...draft,
      identity: {
        ...draft.identity,
        role: "npc",
        displayName: name,
      },
    },
    campaignRole,
    placement: resolvePlacement(draft, placement),
    importance,
  };
}

function createPlayerMember(
  input: NonNullable<BuildCampaignCastRegistryInput["playerCharacter"]>,
): CampaignCastMember {
  const name = normalizeName(input.draft);
  const source = input.source ?? "player_created";

  return {
    id: castMemberId(source, name),
    source,
    characterDraft: {
      ...input.draft,
      identity: {
        ...input.draft.identity,
        role: "player",
        tier: "key",
        displayName: name,
      },
    },
    campaignRole: "player",
    placement: resolvePlacement(input.draft, input.placement),
    importance: "primary",
  };
}

function assertUniqueCastNames(members: readonly CampaignCastMember[]): void {
  const seen = new Map<string, string>();

  for (const member of members) {
    const name = normalizeName(member.characterDraft);
    const key = castNameKey(name);
    const existing = seen.get(key);
    if (existing) {
      throw new AppError(`Cast member ${name} duplicates ${existing} before A5 can run.`, 400);
    }
    seen.set(key, name);
  }
}

export function buildCampaignCastRegistry(
  input: BuildCampaignCastRegistryInput,
): CampaignCastRegistry {
  const playerCharacter = input.playerCharacter
    ? createPlayerMember(input.playerCharacter)
    : null;
  const importedCast = (input.importedCast ?? []).map(createCastMember);
  const generatedCast = (input.generatedCast ?? []).map(createCastMember);

  assertUniqueCastNames([
    ...(playerCharacter ? [playerCharacter] : []),
    ...importedCast,
    ...generatedCast,
  ]);

  return {
    playerCharacter,
    importedCast,
    generatedCast,
  };
}
