import type {
  CampaignKernel,
  RevampCastMember,
  RevampDebugCastSummary,
  RevampDebugRouteSummary,
  RevampDebugSceneSummary,
  RevampDebugSnapshot,
  RevampWorldNode,
} from "@worldforge/shared";
import { AppError } from "../lib/index.js";

function nodeById(kernel: CampaignKernel): Map<string, RevampWorldNode> {
  return new Map(kernel.worldGraph.nodes.map((node) => [node.id, node]));
}

function allCastMembers(kernel: CampaignKernel): RevampCastMember[] {
  return [
    ...(kernel.castRegistry.playerCharacter ? [kernel.castRegistry.playerCharacter] : []),
    ...kernel.castRegistry.importedCast,
    ...kernel.castRegistry.generatedCast,
  ];
}

function castById(kernel: CampaignKernel): Map<string, RevampCastMember> {
  return new Map(allCastMembers(kernel).map((member) => [member.id, member]));
}

function sceneDescription(scene: RevampWorldNode): string {
  const description = scene.data.description;
  if (typeof description !== "string" || !description.trim()) {
    throw new AppError(`A10 debug requires description for scene ${scene.id}.`, 409);
  }
  return description.trim();
}

function currentScene(input: {
  kernel: CampaignKernel;
  nodes: ReadonlyMap<string, RevampWorldNode>;
}): RevampDebugSceneSummary | null {
  const setup = input.kernel.startingSetup;
  if (!setup) {
    return null;
  }
  if (!input.kernel.runtimeState.currentSceneId) {
    throw new AppError("A10 debug requires current scene.", 409);
  }

  const scene = input.nodes.get(input.kernel.runtimeState.currentSceneId);
  if (!scene || scene.type !== "SceneLocation") {
    throw new AppError(`A10 debug requires scene ${input.kernel.runtimeState.currentSceneId}.`, 409);
  }

  return {
    id: scene.id,
    name: scene.name,
    description: sceneDescription(scene),
  };
}

function presentCast(input: {
  kernel: CampaignKernel;
  members: ReadonlyMap<string, RevampCastMember>;
}): RevampDebugCastSummary[] {
  const setup = input.kernel.startingSetup;
  if (!setup) {
    return [];
  }

  return setup.presentCastIds.map((id) => {
    const member = input.members.get(id);
    if (!member) {
      throw new AppError(`A10 debug requires present cast member ${id}.`, 409);
    }
    return {
      id: member.id,
      name: member.characterDraft.identity.displayName,
      source: member.source,
      campaignRole: member.campaignRole,
      isPlayer: member.id === setup.playerCharacterId,
    };
  });
}

function routes(input: {
  kernel: CampaignKernel;
  nodes: ReadonlyMap<string, RevampWorldNode>;
  scene: RevampDebugSceneSummary | null;
}): RevampDebugRouteSummary[] {
  if (!input.scene) {
    return [];
  }

  return input.kernel.worldGraph.edges
    .filter((edge) => edge.type === "route_to" && edge.fromId === input.scene?.id)
    .map((edge) => {
      const target = input.nodes.get(edge.toId);
      if (!target || target.type !== "SceneLocation") {
        throw new AppError(`A10 debug route requires scene target ${edge.toId}.`, 409);
      }
      return {
        edgeId: edge.id,
        toSceneId: target.id,
        name: target.name,
      };
    });
}

function preview(content: string): string {
  const normalized = content.trim().replace(/\s+/g, " ");
  return normalized.length <= 160 ? normalized : `${normalized.slice(0, 157)}...`;
}

export function buildRevampDebugSnapshot(
  kernel: CampaignKernel,
  recentTurnLimit = 8,
): RevampDebugSnapshot {
  const nodes = nodeById(kernel);
  const members = castById(kernel);
  const scene = currentScene({ kernel, nodes });
  const recentTurns = kernel.chatSession.turns.slice(-recentTurnLimit);
  const turnStartIndex = kernel.chatSession.turns.length - recentTurns.length;

  return {
    campaignId: kernel.campaignId,
    phase: kernel.phase,
    turnIndex: kernel.turnIndex,
    counts: {
      nodes: kernel.worldGraph.nodes.length,
      edges: kernel.worldGraph.edges.length,
      castMembers: members.size,
      turns: kernel.chatSession.turns.length,
      pendingSoftStateHints: kernel.chatSession.pendingSoftStateHints.length,
    },
    currentScene: scene,
    presentCast: presentCast({ kernel, members }),
    routes: routes({ kernel, nodes, scene }),
    pendingSoftStateHints: kernel.chatSession.pendingSoftStateHints,
    recentTurns: recentTurns.map((turn, index) => ({
      index: turnStartIndex + index,
      role: turn.role,
      contentPreview: preview(turn.content),
      createdAt: turn.createdAt,
    })),
  };
}
