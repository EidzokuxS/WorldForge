import type {
  CampaignKernel,
  CampaignSoftStateHint,
  CampaignStateWriterChange,
  CampaignStateWriterResult,
  CampaignWorldEdge,
  CampaignWorldNode,
} from "@worldforge/shared";
import { assertSafeId } from "../campaign/paths.js";
import { AppError } from "../lib/index.js";
import { readOrCreateCampaignKernel } from "./cast-kernel.js";
import { writeCampaignKernel } from "./dna-adapter.js";

export interface ApplyCampaignStateWriterResult {
  kernel: CampaignKernel;
  result: CampaignStateWriterResult;
}

function nodeById(kernel: CampaignKernel): Map<string, CampaignWorldNode> {
  return new Map(kernel.worldGraph.nodes.map((node) => [node.id, node]));
}

function requireActiveRuntime(kernel: CampaignKernel): {
  playerId: string;
  currentSceneId: string;
} {
  if (kernel.phase !== "active") {
    throw new AppError(`Campaign kernel phase ${kernel.phase} cannot apply A11 state writer.`, 409);
  }
  if (!kernel.startingSetup) {
    throw new AppError("A11 state writer requires starting setup.", 409);
  }
  if (!kernel.runtimeState.currentSceneId) {
    throw new AppError("A11 state writer requires current scene.", 409);
  }
  return {
    playerId: kernel.startingSetup.playerCharacterId,
    currentSceneId: kernel.runtimeState.currentSceneId,
  };
}

function requireScene(
  nodes: ReadonlyMap<string, CampaignWorldNode>,
  sceneId: string,
): CampaignWorldNode {
  const scene = nodes.get(sceneId);
  if (!scene || scene.type !== "SceneLocation") {
    throw new AppError(`A11 state writer requires scene ${sceneId}.`, 409);
  }
  return scene;
}

function requireRoute(input: {
  kernel: CampaignKernel;
  fromSceneId: string;
  toSceneId: string;
}): void {
  const route = input.kernel.worldGraph.edges.find((edge) => (
    edge.type === "route_to"
    && edge.fromId === input.fromSceneId
    && edge.toId === input.toSceneId
  ));
  if (!route) {
    throw new AppError(
      `A11 state writer requires route from ${input.fromSceneId} to ${input.toSceneId}.`,
      409,
    );
  }
}

function moveCharacter(input: {
  kernel: CampaignKernel;
  hint: CampaignSoftStateHint;
  nodes: ReadonlyMap<string, CampaignWorldNode>;
  playerId: string;
  currentSceneId: string;
}): { kernel: CampaignKernel; change: CampaignStateWriterChange } {
  const toSceneId = input.hint.targetId;
  if (!toSceneId) {
    throw new AppError("A11 MoveCharacter requires a target scene.", 409);
  }
  requireScene(input.nodes, input.currentSceneId);
  requireScene(input.nodes, toSceneId);
  requireRoute({
    kernel: input.kernel,
    fromSceneId: input.currentSceneId,
    toSceneId,
  });

  const locatedAt = input.kernel.worldGraph.edges.find((edge) => (
    edge.type === "located_at"
    && edge.fromId === input.playerId
    && edge.toId === input.currentSceneId
  ));
  if (!locatedAt) {
    throw new AppError(
      `A11 state writer requires ${input.playerId} located_at ${input.currentSceneId}.`,
      409,
    );
  }

  const nextEdge: CampaignWorldEdge = {
    id: `edge:located_at:${input.playerId}:${toSceneId}`,
    fromId: input.playerId,
    toId: toSceneId,
    type: "located_at",
    data: {
      source: "state_writer",
      previousSceneId: input.currentSceneId,
    },
  };
  const nextKernel: CampaignKernel = {
    ...input.kernel,
    runtimeState: {
      currentSceneId: toSceneId,
    },
    worldGraph: {
      ...input.kernel.worldGraph,
      edges: [
        ...input.kernel.worldGraph.edges.filter((edge) => !(
          edge.type === "located_at"
          && edge.fromId === input.playerId
        )),
        nextEdge,
      ],
    },
  };

  return {
    kernel: nextKernel,
    change: {
      type: "MoveCharacter",
      status: "applied",
      actorId: input.playerId,
      fromSceneId: input.currentSceneId,
      toSceneId,
      reason: input.hint.summary,
    },
  };
}

function rejectedChange(hint: CampaignSoftStateHint): CampaignStateWriterChange {
  return {
    type: "MoveCharacter",
    status: "rejected",
    reason: `A11 handles route_intent only. Received ${hint.type}.`,
  };
}

export function applyCampaignStateHints(kernel: CampaignKernel): ApplyCampaignStateWriterResult {
  const runtime = requireActiveRuntime(kernel);
  const nodes = nodeById(kernel);
  let nextKernel = kernel;
  const changes: CampaignStateWriterChange[] = [];

  for (const hint of kernel.chatSession.pendingSoftStateHints) {
    if (hint.type !== "route_intent") {
      changes.push(rejectedChange(hint));
      continue;
    }

    const move = moveCharacter({
      kernel: nextKernel,
      hint,
      nodes,
      playerId: runtime.playerId,
      currentSceneId: nextKernel.runtimeState.currentSceneId ?? runtime.currentSceneId,
    });
    nextKernel = move.kernel;
    changes.push(move.change);
  }

  nextKernel = {
    ...nextKernel,
    chatSession: {
      ...nextKernel.chatSession,
      pendingSoftStateHints: [],
    },
  };

  return {
    kernel: nextKernel,
    result: {
      changes,
      appliedCount: changes.filter((change) => change.status === "applied").length,
      rejectedCount: changes.filter((change) => change.status === "rejected").length,
    },
  };
}

export function applyCampaignStateWriter(input: {
  campaignId: string;
}): ApplyCampaignStateWriterResult {
  assertSafeId(input.campaignId);
  const currentKernel = readOrCreateCampaignKernel(input.campaignId);
  const result = applyCampaignStateHints(currentKernel);
  writeCampaignKernel(input.campaignId, result.kernel);
  return result;
}
