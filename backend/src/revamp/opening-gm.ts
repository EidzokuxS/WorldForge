import type {
  RevampCastMember,
  RevampCastRegistry,
  RevampOpeningResult,
  RevampStartingSetup,
  RevampWorldDNA,
  RevampWorldGraph,
  RevampWorldNode,
} from "@worldforge/shared";
import { AppError } from "../lib/index.js";

export interface BuildRevampOpeningInput {
  worldGraph: RevampWorldGraph;
  castRegistry: RevampCastRegistry;
  startingSetup: RevampStartingSetup;
  worldDna: RevampWorldDNA | null;
}

function nodeById(graph: RevampWorldGraph): Map<string, RevampWorldNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function allCastMembers(registry: RevampCastRegistry): RevampCastMember[] {
  return [
    ...(registry.playerCharacter ? [registry.playerCharacter] : []),
    ...registry.importedCast,
    ...registry.generatedCast,
  ];
}

function castById(registry: RevampCastRegistry): Map<string, RevampCastMember> {
  return new Map(allCastMembers(registry).map((member) => [member.id, member]));
}

function requireScene(
  nodes: ReadonlyMap<string, RevampWorldNode>,
  sceneId: string,
): RevampWorldNode {
  const scene = nodes.get(sceneId);
  if (!scene || scene.type !== "SceneLocation") {
    throw new AppError(`A8 opening requires scene ${sceneId}.`, 409);
  }
  return scene;
}

function requirePlayer(registry: RevampCastRegistry, playerId: string): RevampCastMember {
  const player = registry.playerCharacter;
  if (!player || player.id !== playerId) {
    throw new AppError(`A8 opening requires player cast ${playerId}.`, 409);
  }
  return player;
}

function sceneDescription(scene: RevampWorldNode): string {
  const description = scene.data.description;
  if (typeof description !== "string" || !description.trim()) {
    throw new AppError(`A8 opening requires description for scene ${scene.id}.`, 409);
  }
  return description.trim();
}

function presentCastNames(input: {
  setup: RevampStartingSetup;
  registry: RevampCastRegistry;
}): string[] {
  const members = castById(input.registry);
  return input.setup.presentCastIds
    .filter((id) => id !== input.setup.playerCharacterId)
    .map((id) => {
      const member = members.get(id);
      if (!member) {
        throw new AppError(`A8 opening requires present cast member ${id}.`, 409);
      }
      return member.characterDraft.identity.displayName;
    });
}

function routeActionLabels(input: {
  graph: RevampWorldGraph;
  nodes: ReadonlyMap<string, RevampWorldNode>;
  anchorSceneId: string;
}): string[] {
  return input.graph.edges
    .filter((edge) => edge.type === "route_to" && edge.fromId === input.anchorSceneId)
    .map((edge) => {
      const target = input.nodes.get(edge.toId);
      if (!target) {
        throw new AppError(`A8 opening route references missing target ${edge.toId}.`, 409);
      }
      return `Go to ${target.name}`;
    });
}

function uniqueOrdered(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function buildRevampOpening(input: BuildRevampOpeningInput): RevampOpeningResult {
  const nodes = nodeById(input.worldGraph);
  const scene = requireScene(nodes, input.startingSetup.anchorSceneId);
  requirePlayer(input.castRegistry, input.startingSetup.playerCharacterId);
  const presentNames = presentCastNames({
    setup: input.startingSetup,
    registry: input.castRegistry,
  });
  const routeActions = routeActionLabels({
    graph: input.worldGraph,
    nodes,
    anchorSceneId: scene.id,
  });
  const text = [
    input.startingSetup.openingSituation,
    `${scene.name}. ${sceneDescription(scene)}`,
    presentNames.length ? `Present: ${presentNames.join(", ")}.` : null,
    input.startingSetup.openingQuestion,
  ].filter((part): part is string => Boolean(part)).join("\n\n");
  const talkActions = presentNames.map((name) => `Talk to ${name}`);

  return {
    text,
    suggestedActions: uniqueOrdered([
      "Look around",
      ...talkActions,
      ...routeActions,
    ]),
  };
}
