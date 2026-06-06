import {
  assertGmJudgeV2,
  assertGmReadChecklistV2,
  type GmJudgeChecklistAdmissionV2,
  type GmJudgeV2,
  type GmReadChecklistV2,
  type GmReadNoMutationV2,
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

function hasRouteCheckCapability(packet: ModelFacingTurnPacketV2): boolean {
  return packet.capabilities.some((capability) => capability.capabilityId === "route_check");
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

function sceneRef(packet: ModelFacingTurnPacketV2): string {
  return packet.scene.currentScene.ref
    ?? packet.scene.currentLocation.ref
    ?? "Player";
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

  const evidenceRefs = [...new Set(["Player", sceneRef(input.packet), destination.ref])];
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

export type NoMutationRouteTargetAdmissionV2 =
  | {
    status: "admitted";
    gmRead: GmReadChecklistV2;
    gmJudge: GmJudgeV2;
    destinationRef: string;
    evidenceRefs: string[];
  }
  | {
    status: "not_admitted";
    reason: string;
  };

export function admitNoMutationMovementTargetRouteCheckV2(input: {
  packet: ModelFacingTurnPacketV2;
  refRegistry: GameplayRefRegistryV2;
  gmRead: GmReadNoMutationV2;
}): NoMutationRouteTargetAdmissionV2 {
  if (!hasRouteCheckCapability(input.packet)) {
    return { status: "not_admitted", reason: "route_check capability is not available." };
  }
  if (input.gmRead.path !== "direct" && input.gmRead.path !== "continue") {
    return { status: "not_admitted", reason: "GM Read is not a no-mutation path." };
  }

  const citableRefs = citableSet(input.packet);
  const targetRefs = new Set(
    input.gmRead.actionInterpretation.targetRefs.map(normalized),
  );
  const targetedOptions = input.packet.scene.movementOptions.filter((option) =>
    citableRefs.has(normalized(option.ref)) && targetRefs.has(normalized(option.ref)));

  if (targetedOptions.length === 0) {
    return { status: "not_admitted", reason: "No no-mutation targetRef is a movement option." };
  }
  const uniqueTargetedRefs = [...new Set(targetedOptions.map((option) => normalized(option.ref)))];
  if (uniqueTargetedRefs.length !== 1 || targetedOptions.length !== 1) {
    return { status: "not_admitted", reason: "No-mutation movement target is ambiguous." };
  }

  const destination = targetedOptions[0];
  const registryMatches = movementRegistryEntries({
    registry: input.refRegistry,
    ref: destination.ref,
  });
  if (registryMatches.length !== 1) {
    return { status: "not_admitted", reason: "Route-check destination is not a unique registry movement option." };
  }

  const evidenceRefs = [...new Set([
    "Player",
    sceneRef(input.packet),
    destination.ref,
    ...input.gmRead.evidenceRefs,
  ])];
  const gmRead = assertGmReadChecklistV2({
    version: input.gmRead.version,
    situationSummary: input.gmRead.situationSummary,
    sceneQuestion: input.gmRead.sceneQuestion,
    focalActorRefs: input.gmRead.focalActorRefs,
    evidenceRefs: input.gmRead.evidenceRefs,
    actionInterpretation: input.gmRead.actionInterpretation,
    path: "tool_plan",
    turnNeed: "backend_action_checklist",
    rationale: "A no-mutation GM Read targeted a movement option; route availability must settle through backend route_check authority before narration.",
  });
  const checklistAdmission: GmJudgeChecklistAdmissionV2 = {
    turnPath: "procedural",
    requiredEffectKinds: ["route_check"],
    actorRefs: ["Player"],
    targetRefs: [destination.ref],
    evidenceRefs,
    checklistGoal: "Settle the targeted movement-option availability through an accepted route_check receipt without moving the actor.",
  };
  const gmJudge = assertGmJudgeV2({
    version: "gm-judge.v2",
    lane: "action_checklist",
    physicalPossibility: "possible",
    checkNeed: "backend_action_checklist",
    actorRefs: checklistAdmission.actorRefs,
    evidenceRefs: checklistAdmission.evidenceRefs,
    targetRefs: checklistAdmission.targetRefs,
    rationale: "Movement-option route truth requires backend route_check authority.",
    checklistAdmission,
  });

  return {
    status: "admitted",
    gmRead,
    gmJudge,
    destinationRef: destination.ref,
    evidenceRefs,
  };
}
