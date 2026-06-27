import type {
  CampaignCastMember,
  CampaignCastRegistry,
  CampaignWorldEdge,
  CampaignWorldGraph,
  CampaignWorldNode,
} from "@worldforge/shared";
import { AppError } from "../lib/index.js";

function allCastMembers(castRegistry: CampaignCastRegistry): CampaignCastMember[] {
  return [
    ...(castRegistry.playerCharacter ? [castRegistry.playerCharacter] : []),
    ...castRegistry.importedCast,
    ...castRegistry.generatedCast,
  ];
}

function assertUniqueBaseIds(graph: CampaignWorldGraph): void {
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      throw new AppError(`WorldGraph node id ${node.id} is duplicated before A6 can run.`, 400);
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      throw new AppError(`WorldGraph edge id ${edge.id} is duplicated before A6 can run.`, 400);
    }
    edgeIds.add(edge.id);
  }
}

function createCharacterNode(member: CampaignCastMember): CampaignWorldNode {
  return {
    id: member.id,
    type: "Character",
    name: member.characterDraft.identity.displayName,
    data: {
      castMemberId: member.id,
      source: member.source,
      campaignRole: member.campaignRole,
      importance: member.importance,
      placement: member.placement,
      identity: member.characterDraft.identity,
      characterDraft: member.characterDraft,
    },
  };
}

function placementTargetId(member: CampaignCastMember): string | null {
  return member.placement.sceneLocationId ?? member.placement.locationId;
}

function createPlacementEdge(
  member: CampaignCastMember,
  targetId: string,
): CampaignWorldEdge {
  return {
    id: `edge:located_at:${member.id}:${targetId}`,
    fromId: member.id,
    toId: targetId,
    type: "located_at",
    data: {
      source: member.source,
      campaignRole: member.campaignRole,
      placement: member.placement.sceneLocationId ? "sceneLocationId" : "locationId",
    },
  };
}

export function buildCampaignWorldGraph(input: {
  baseGraph: CampaignWorldGraph;
  castRegistry: CampaignCastRegistry;
}): CampaignWorldGraph {
  assertUniqueBaseIds(input.baseGraph);

  const existingNodeIds = new Set(input.baseGraph.nodes.map((node) => node.id));
  const existingEdgeIds = new Set(input.baseGraph.edges.map((edge) => edge.id));
  const nodes = [...input.baseGraph.nodes];
  const edges = [...input.baseGraph.edges];

  for (const member of allCastMembers(input.castRegistry)) {
    if (existingNodeIds.has(member.id)) {
      throw new AppError(`WorldGraph node id ${member.id} already exists before A6 can run.`, 400);
    }

    const node = createCharacterNode(member);
    nodes.push(node);
    existingNodeIds.add(node.id);

    const targetId = placementTargetId(member);
    if (!targetId) {
      continue;
    }
    if (!input.baseGraph.nodes.some((baseNode) => baseNode.id === targetId)) {
      throw new AppError(
        `Cast member ${member.characterDraft.identity.displayName} references missing placement target ${targetId}.`,
        400,
      );
    }

    const edge = createPlacementEdge(member, targetId);
    if (existingEdgeIds.has(edge.id)) {
      throw new AppError(`WorldGraph edge id ${edge.id} already exists before A6 can run.`, 400);
    }

    edges.push(edge);
    existingEdgeIds.add(edge.id);
  }

  return { nodes, edges };
}
