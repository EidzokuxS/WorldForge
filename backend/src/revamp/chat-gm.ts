import type {
  RevampCastMember,
  RevampCastRegistry,
  RevampChatTurn,
  RevampGmResponse,
  RevampSoftStateHint,
  RevampStartingSetup,
  RevampWorldDNA,
  RevampWorldEdge,
  RevampWorldGraph,
  RevampWorldNode,
} from "@worldforge/shared";
import { AppError } from "../lib/index.js";

export interface BuildRevampGmResponseInput {
  worldGraph: RevampWorldGraph;
  castRegistry: RevampCastRegistry;
  startingSetup: RevampStartingSetup;
  recentTurns: RevampChatTurn[];
  worldDna: RevampWorldDNA | null;
  userMessage: string;
}

type ChatIntent =
  | { type: "look" }
  | { type: "talk"; member: RevampCastMember }
  | { type: "route"; target: RevampWorldNode }
  | { type: "freeform" };

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
    throw new AppError(`A9 chat requires scene ${sceneId}.`, 409);
  }
  return scene;
}

function requirePlayer(registry: RevampCastRegistry, playerId: string): RevampCastMember {
  const player = registry.playerCharacter;
  if (!player || player.id !== playerId) {
    throw new AppError(`A9 chat requires player cast ${playerId}.`, 409);
  }
  return player;
}

function sceneDescription(scene: RevampWorldNode): string {
  const description = scene.data.description;
  if (typeof description !== "string" || !description.trim()) {
    throw new AppError(`A9 chat requires description for scene ${scene.id}.`, 409);
  }
  return description.trim();
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
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

function presentCast(input: {
  setup: RevampStartingSetup;
  registry: RevampCastRegistry;
}): RevampCastMember[] {
  const members = castById(input.registry);
  return input.setup.presentCastIds
    .filter((id) => id !== input.setup.playerCharacterId)
    .map((id) => {
      const member = members.get(id);
      if (!member) {
        throw new AppError(`A9 chat requires present cast member ${id}.`, 409);
      }
      return member;
    });
}

function visibleRoutes(input: {
  graph: RevampWorldGraph;
  nodes: ReadonlyMap<string, RevampWorldNode>;
  anchorSceneId: string;
}): RevampWorldNode[] {
  return input.graph.edges
    .filter((edge): edge is RevampWorldEdge => (
      edge.type === "route_to" && edge.fromId === input.anchorSceneId
    ))
    .map((edge) => {
      const target = input.nodes.get(edge.toId);
      if (!target) {
        throw new AppError(`A9 chat route references missing target ${edge.toId}.`, 409);
      }
      if (target.type !== "SceneLocation") {
        throw new AppError(`A9 chat route target ${edge.toId} must be a scene.`, 409);
      }
      return target;
    });
}

function suggestedActions(input: {
  present: RevampCastMember[];
  routes: RevampWorldNode[];
}): string[] {
  return uniqueOrdered([
    "Look around",
    ...input.present.map((member) => (
      `Talk to ${member.characterDraft.identity.displayName}`
    )),
    ...input.routes.map((route) => `Go to ${route.name}`),
  ]);
}

function classifyIntent(input: {
  message: string;
  present: RevampCastMember[];
  routes: RevampWorldNode[];
}): ChatIntent {
  const normalized = normalize(input.message);
  if (normalized === "look around" || normalized.includes("look")) {
    return { type: "look" };
  }

  const talkTarget = input.present.find((member) => {
    const name = normalize(member.characterDraft.identity.displayName);
    return normalized === `talk to ${name}` || normalized.includes(name);
  });
  if (talkTarget) {
    return { type: "talk", member: talkTarget };
  }

  const routeTarget = input.routes.find((route) => {
    const name = normalize(route.name);
    return normalized === `go to ${name}` || normalized.includes(name);
  });
  if (routeTarget) {
    return { type: "route", target: routeTarget };
  }

  return { type: "freeform" };
}

function describePresent(present: RevampCastMember[]): string | null {
  if (!present.length) {
    return null;
  }
  return `Present: ${present.map((member) => member.characterDraft.identity.displayName).join(", ")}.`;
}

function describeRoutes(routes: RevampWorldNode[]): string | null {
  if (!routes.length) {
    return null;
  }
  return `Routes: ${routes.map((route) => route.name).join(", ")}.`;
}

function responseForIntent(input: {
  intent: ChatIntent;
  scene: RevampWorldNode;
  sceneDescription: string;
  present: RevampCastMember[];
  routes: RevampWorldNode[];
  userMessage: string;
}): { text: string; hints: RevampSoftStateHint[] } {
  if (input.intent.type === "look") {
    return {
      text: [
        `You take in ${input.scene.name}. ${input.sceneDescription}`,
        describePresent(input.present),
        describeRoutes(input.routes),
      ].filter((part): part is string => Boolean(part)).join("\n\n"),
      hints: [{
        type: "inspect_scene",
        targetId: input.scene.id,
        summary: `Inspect ${input.scene.name}.`,
      }],
    };
  }

  if (input.intent.type === "talk") {
    const name = input.intent.member.characterDraft.identity.displayName;
    return {
      text: `${name} gives you their attention. The room keeps moving around both of you.`,
      hints: [{
        type: "address_cast",
        targetId: input.intent.member.id,
        summary: `Address ${name}.`,
      }],
    };
  }

  if (input.intent.type === "route") {
    return {
      text: `You start toward ${input.intent.target.name}. The route is open, and the next beat waits there.`,
      hints: [{
        type: "route_intent",
        targetId: input.intent.target.id,
        summary: `Move from ${input.scene.name} toward ${input.intent.target.name}.`,
      }],
    };
  }

  return {
    text: `You commit to it. ${input.scene.name} answers with pressure and watching eyes.`,
    hints: [{
      type: "freeform_action",
      targetId: input.scene.id,
      summary: `Player action: ${input.userMessage}`,
    }],
  };
}

export function buildRevampGmResponse(input: BuildRevampGmResponseInput): RevampGmResponse {
  const userMessage = input.userMessage.trim();
  if (!userMessage) {
    throw new AppError("A9 chat requires a user message.", 400);
  }

  const nodes = nodeById(input.worldGraph);
  const scene = requireScene(nodes, input.startingSetup.anchorSceneId);
  requirePlayer(input.castRegistry, input.startingSetup.playerCharacterId);
  const present = presentCast({
    setup: input.startingSetup,
    registry: input.castRegistry,
  });
  const routes = visibleRoutes({
    graph: input.worldGraph,
    nodes,
    anchorSceneId: scene.id,
  });
  const intent = classifyIntent({ message: userMessage, present, routes });
  const response = responseForIntent({
    intent,
    scene,
    sceneDescription: sceneDescription(scene),
    present,
    routes,
    userMessage,
  });

  return {
    text: response.text,
    suggestedActions: suggestedActions({ present, routes }),
    softStateHints: response.hints,
  };
}
