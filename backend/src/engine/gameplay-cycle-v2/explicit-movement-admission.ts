import {
  type GmJudgeChecklistAdmissionV2,
  type ModelFacingTurnPacketV2,
} from "./contracts.js";
import type { GameplayRefRegistryV2 } from "./ref-registry.js";

export type ExplicitMovementAdmissionV2 =
  | {
    status: "admitted";
    destinationRef: string;
    evidenceRefs: string[];
    checklistAdmission: GmJudgeChecklistAdmissionV2;
  }
  | {
    status: "not_admitted";
    reason: string;
  };

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}
function hasMovementCapability(packet: ModelFacingTurnPacketV2): boolean {
  return packet.capabilities.some((capability) => capability.capabilityId === "movement");
}

function actionMentionsExactLabel(playerAction: string, label: string): boolean {
  return normalized(playerAction).includes(normalized(label));
}

function citableSet(packet: ModelFacingTurnPacketV2): Set<string> {
  return new Set(packet.citableRefs.map(normalized));
}

function movementRegistryEntries(input: {
  registry: GameplayRefRegistryV2;
  ref: string;
}) {
  const target = normalized(input.ref);
  return input.registry.entries.filter((entry) =>
    entry.kind === "movement_option" && normalized(entry.ref) === target);
}

export function admitExplicitMovementV2(input: {
  packet: ModelFacingTurnPacketV2;
  refRegistry: GameplayRefRegistryV2;
}): ExplicitMovementAdmissionV2 {
  if (!hasMovementCapability(input.packet)) {
    return { status: "not_admitted", reason: "movement capability is not available." };
  }

  const citableRefs = citableSet(input.packet);
  const mentionedOptions = input.packet.scene.movementOptions.filter((option) =>
    option.connected
    && citableRefs.has(normalized(option.ref))
    && actionMentionsExactLabel(input.packet.playerAction, option.label));

  if (mentionedOptions.length === 0) {
    return { status: "not_admitted", reason: "no exact connected movement option was mentioned." };
  }
  const uniqueMentionedRefs = [...new Set(mentionedOptions.map((option) => normalized(option.ref)))];
  if (uniqueMentionedRefs.length !== 1 || mentionedOptions.length !== 1) {
    return { status: "not_admitted", reason: "movement destination mention is ambiguous." };
  }

  const destination = mentionedOptions[0];
  const registryMatches = movementRegistryEntries({
    registry: input.refRegistry,
    ref: destination.ref,
  });
  if (registryMatches.length !== 1) {
    return { status: "not_admitted", reason: "movement destination is not a unique registry movement option." };
  }
  if (registryMatches[0]?.metadata.connected !== true) {
    return { status: "not_admitted", reason: "movement destination is not connected." };
  }

  const sceneRef = input.packet.scene.currentScene.ref
    ?? input.packet.scene.currentLocation.ref
    ?? "Player";
  const evidenceRefs = [...new Set(["Player", sceneRef, destination.ref])];
  return {
    status: "admitted",
    destinationRef: destination.ref,
    evidenceRefs,
    checklistAdmission: {
      turnPath: "mutating",
      requiredEffectKinds: ["movement"],
      actorRefs: ["Player"],
      targetRefs: [destination.ref],
      evidenceRefs,
      checklistGoal: "Settle the explicit movement only through an accepted movement receipt.",
    },
  };
}
