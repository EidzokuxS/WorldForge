import {
  createDraftCampaignKernel,
  type CampaignKernel,
  type RevampCastMember,
} from "@worldforge/shared";
import type { CharacterDraft } from "@worldforge/shared";
import { readCampaignConfig } from "../campaign/manager.js";
import { assertSafeId } from "../campaign/paths.js";
import { AppError } from "../lib/index.js";
import {
  buildRevampCastRegistry,
  type RevampDraftCastInput,
  type RevampNpcCastSource,
  type RevampPlayerCastSource,
} from "./cast-registry-adapter.js";
import { readCampaignKernel, writeCampaignKernel } from "./dna-adapter.js";

type PlayerCastSource = Extract<RevampPlayerCastSource, "player_created" | "player_imported">;

const PLAYER_SAVE_ALLOWED_PHASES: CampaignKernel["phase"][] = [
  "draft",
  "world_ready",
  "cast_ready",
];

function resolveDraftPremise(campaignId: string): string {
  const config = readCampaignConfig(campaignId);
  return config.premise.trim() || config.worldgenResearchArtifact?.rawPremise.trim() || "";
}

export function readOrCreateRevampKernel(campaignId: string): CampaignKernel {
  assertSafeId(campaignId);
  return readCampaignKernel(campaignId)
    ?? createDraftCampaignKernel({
      id: campaignId,
      premise: resolveDraftPremise(campaignId),
    });
}

function npcMemberToInput(member: RevampCastMember): RevampDraftCastInput {
  if (member.source !== "npc_imported" && member.source !== "npc_generated") {
    throw new AppError(`Cast member ${member.id} has invalid NPC source ${member.source}.`, 500);
  }

  return {
    draft: member.characterDraft,
    source: member.source as RevampNpcCastSource,
    campaignRole: member.campaignRole,
    placement: member.placement,
    importance: member.importance,
  };
}

export function saveRevampPlayerCharacter(input: {
  campaignId: string;
  draft: CharacterDraft;
  source: PlayerCastSource;
}): CampaignKernel {
  assertSafeId(input.campaignId);
  const currentKernel = readOrCreateRevampKernel(input.campaignId);

  if (!PLAYER_SAVE_ALLOWED_PHASES.includes(currentKernel.phase)) {
    throw new AppError(`Campaign kernel phase ${currentKernel.phase} cannot save A5b player cast.`, 409);
  }

  if (input.draft.identity.role !== "player") {
    throw new AppError("A5b player cast requires a player CharacterDraft.", 400);
  }

  const castRegistry = buildRevampCastRegistry({
    playerCharacter: {
      draft: input.draft,
      source: input.source,
      placement: currentKernel.castRegistry.playerCharacter?.placement,
    },
    importedCast: currentKernel.castRegistry.importedCast.map(npcMemberToInput),
    generatedCast: currentKernel.castRegistry.generatedCast.map(npcMemberToInput),
  });

  const nextKernel: CampaignKernel = {
    ...currentKernel,
    phase: "cast_ready",
    castRegistry,
  };

  writeCampaignKernel(input.campaignId, nextKernel);
  return nextKernel;
}
