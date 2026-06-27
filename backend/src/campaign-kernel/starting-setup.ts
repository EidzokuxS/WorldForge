import type {
  CampaignCastRegistry,
  CampaignStartingSetup,
  CampaignWorldEdge,
  CampaignWorldGraph,
  CampaignWorldNode,
} from "@worldforge/shared";
import { AppError } from "../lib/index.js";

export interface BuildCampaignStartingSetupInput {
  worldGraph: CampaignWorldGraph;
  castRegistry: CampaignCastRegistry;
  mode?: CampaignStartingSetup["mode"];
  userStart?: string | null;
}

function nodeById(graph: CampaignWorldGraph): Map<string, CampaignWorldNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function locatedAtEdgesFrom(graph: CampaignWorldGraph, fromId: string): CampaignWorldEdge[] {
  return graph.edges.filter((edge) => edge.type === "located_at" && edge.fromId === fromId);
}

function requirePlayerCast(input: BuildCampaignStartingSetupInput) {
  const player = input.castRegistry.playerCharacter;
  if (!player) {
    throw new AppError("A7 starting setup requires a player cast member.", 409);
  }
  return player;
}

function requireCharacterNode(
  nodes: ReadonlyMap<string, CampaignWorldNode>,
  id: string,
): CampaignWorldNode {
  const node = nodes.get(id);
  if (!node || node.type !== "Character") {
    throw new AppError(`A7 starting setup requires character node ${id}.`, 409);
  }
  return node;
}

function requireSingleLocatedAtEdge(
  graph: CampaignWorldGraph,
  characterId: string,
): CampaignWorldEdge {
  const edges = locatedAtEdgesFrom(graph, characterId);
  if (edges.length !== 1) {
    throw new AppError(`A7 starting setup requires exactly one location edge for ${characterId}.`, 409);
  }
  return edges[0]!;
}

function containedSceneNodes(
  graph: CampaignWorldGraph,
  nodes: ReadonlyMap<string, CampaignWorldNode>,
  locationId: string,
): CampaignWorldNode[] {
  return graph.edges
    .filter((edge) => edge.type === "located_at" && edge.toId === locationId)
    .map((edge) => nodes.get(edge.fromId))
    .filter((node): node is CampaignWorldNode => node?.type === "SceneLocation");
}

function resolveAnchorScene(input: {
  graph: CampaignWorldGraph;
  nodes: ReadonlyMap<string, CampaignWorldNode>;
  playerCharacterId: string;
}): CampaignWorldNode {
  const placementEdge = requireSingleLocatedAtEdge(input.graph, input.playerCharacterId);
  const target = input.nodes.get(placementEdge.toId);
  if (!target) {
    throw new AppError(`A7 starting setup requires placement target ${placementEdge.toId}.`, 409);
  }

  if (target.type === "SceneLocation") {
    return target;
  }

  if (target.type !== "Location") {
    throw new AppError(`A7 starting setup cannot anchor at ${target.type} ${target.id}.`, 409);
  }

  const scenes = containedSceneNodes(input.graph, input.nodes, target.id);
  if (scenes.length !== 1) {
    throw new AppError(
      `A7 starting setup requires exactly one scene under location ${target.id}.`,
      409,
    );
  }
  return scenes[0]!;
}

function parentLocationId(
  graph: CampaignWorldGraph,
  anchorSceneId: string,
): string | null {
  const parentEdges = graph.edges.filter(
    (edge) => edge.type === "located_at" && edge.fromId === anchorSceneId,
  );
  return parentEdges.length === 1 ? parentEdges[0]!.toId : null;
}

function characterNodeIds(graph: CampaignWorldGraph): string[] {
  return graph.nodes
    .filter((node) => node.type === "Character")
    .map((node) => node.id);
}

function characterIdsAtTargets(
  graph: CampaignWorldGraph,
  targetIds: ReadonlySet<string>,
): string[] {
  const placedCharacterIds = new Set(graph.edges
    .filter((edge) =>
      edge.type === "located_at"
      && targetIds.has(edge.toId)
      && graph.nodes.some((node) => node.id === edge.fromId && node.type === "Character"),
    )
    .map((edge) => edge.fromId));

  return characterNodeIds(graph).filter((id) => placedCharacterIds.has(id));
}

function uniqueOrdered(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function sceneDescription(anchorScene: CampaignWorldNode): string {
  const description = anchorScene.data.description;
  if (typeof description !== "string" || !description.trim()) {
    throw new AppError(`A7 starting setup requires description for scene ${anchorScene.id}.`, 409);
  }
  return description.trim();
}

function normalizeModeAndUserStart(input: BuildCampaignStartingSetupInput): {
  mode: CampaignStartingSetup["mode"];
  userStart: string | null;
} {
  const mode = input.mode ?? "gm_invented";
  const userStart = input.userStart?.trim() || null;

  if (mode === "user_guided" && !userStart) {
    throw new AppError("A7 user-guided setup requires userStart.", 400);
  }
  if (mode === "gm_invented" && userStart) {
    throw new AppError("A7 gm-invented setup does not accept userStart.", 400);
  }

  return { mode, userStart };
}

function openingSituation(input: {
  mode: CampaignStartingSetup["mode"];
  userStart: string | null;
  anchorScene: CampaignWorldNode;
}): string {
  if (input.mode === "user_guided") {
    return input.userStart!;
  }

  return `Start at ${input.anchorScene.name}. ${sceneDescription(input.anchorScene)}`;
}

export function buildCampaignStartingSetup(
  input: BuildCampaignStartingSetupInput,
): CampaignStartingSetup {
  const { mode, userStart } = normalizeModeAndUserStart(input);
  const player = requirePlayerCast(input);
  const nodes = nodeById(input.worldGraph);
  const playerNode = requireCharacterNode(nodes, player.id);
  const anchorScene = resolveAnchorScene({
    graph: input.worldGraph,
    nodes,
    playerCharacterId: playerNode.id,
  });
  const parentId = parentLocationId(input.worldGraph, anchorScene.id);
  const siblingSceneIds = parentId
    ? containedSceneNodes(input.worldGraph, nodes, parentId)
      .map((node) => node.id)
      .filter((id) => id !== anchorScene.id)
    : [];

  const presentCastIds = uniqueOrdered([
    player.id,
    ...characterIdsAtTargets(input.worldGraph, new Set([anchorScene.id])),
  ]);
  const nearbyCastIds = characterIdsAtTargets(
    input.worldGraph,
    new Set(siblingSceneIds),
  ).filter((id) => !presentCastIds.includes(id));

  return {
    mode,
    anchorSceneId: anchorScene.id,
    playerCharacterId: player.id,
    presentCastIds,
    nearbyCastIds,
    activePressureIds: [],
    visibleHooks: [],
    hiddenTruthIds: [],
    openingSituation: openingSituation({ mode, userStart, anchorScene }),
    openingQuestion: "What do you do?",
  };
}
