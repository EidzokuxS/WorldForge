import {
  assertCleanNarratorView,
  assertCleanSettledTurnPacket,
  type AuthoritativeSceneFrame,
  type CleanNarratorView,
  type CleanSettledEvidence,
  type CleanSettledStepAudit,
  type CleanSettledTurnPacket,
  type CleanStage4ExecutionResult,
  type CleanStage4Receipt,
  type GameplayRuntimeTurnInput,
  type GmActionChecklist,
  type GmRead,
  type JudgeUncertainty,
  type OracleSettlement,
} from "./contracts.js";

const FORBIDDEN_WITHOUT_EVIDENCE = [
  "absence_or_no_change",
  "movement",
  "discovery",
  "item_state",
  "npc_private_knowledge",
  "location_reveal",
  "condition_or_hp_change",
  "world_fact",
] as const;

const ROUTE_DOES_NOT_PROVE = [
  "movement",
  "arrival",
  "current-scene change",
  "clock advance",
  "absence",
  "discovery",
  "item state",
  "NPC knowledge",
  "no-change",
];

const MOVEMENT_DOES_NOT_PROVE = [
  "route topology beyond the taken path",
  "discovery",
  "absence",
  "NPC knowledge",
  "item state",
  "world fact",
  "no-change",
];

const TIME_DOES_NOT_PROVE = [
  "no-change",
  "offscreen events",
  "NPC action",
  "discovery",
  "item state",
  "condition change",
  "world fact",
];

const ROUTE_OPTIONS_DOES_NOT_PROVE = [
  "full route topology",
  "hidden routes",
  "absence of other routes",
  "movement",
  "discovery",
  "no-change",
];

const SCENE_BEAT_DOES_NOT_PROVE = [
  "success",
  "NPC response",
  "dialogue content",
  "world fact",
  "item state",
  "condition change",
  "discovery",
  "no-change",
];

const SCENE_DOES_NOT_PROVE = [
  "absence",
  "no-change",
  "movement",
  "discovery",
  "item state changes",
  "NPC private knowledge",
  "offscreen events",
];

export interface BuildCleanSettlementInput {
  turn: GameplayRuntimeTurnInput;
  publicPacketId: string;
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead | null;
  judgment: JudgeUncertainty | null;
  oracleSettlement: OracleSettlement | null;
  actionChecklist: GmActionChecklist | null;
  stage4Execution: CleanStage4ExecutionResult | null;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function narrationContract(): CleanSettledTurnPacket["narrationContract"] {
  return {
    acceptedEvidenceOnly: true,
    mayCallTools: false,
    mayInferNewFacts: false,
    mayUseFailedOrSkippedAsTruth: false,
    mayNarrateNoChangeWithoutExplicitEvidence: false,
    preserveLabelsVerbatim: true,
    forbiddenClaimKindsWithoutAcceptedEvidence: [...FORBIDDEN_WITHOUT_EVIDENCE],
  };
}

function nextEvidenceId(evidence: readonly CleanSettledEvidence[]): string {
  return `e${evidence.length + 1}`;
}

function fact(evidenceId: string, index: number, text: string) {
  return {
    factRef: `${evidenceId}.f${index}`,
    text,
    exact: true,
  };
}

function sceneEvidence(frame: AuthoritativeSceneFrame, evidence: CleanSettledEvidence[]): void {
  const evidenceId = nextEvidenceId(evidence);
  evidence.push({
    evidenceId,
    sourceKind: "scene_frame",
    sourceRef: frame.frameId,
    authority: "scene_frame_snapshot",
    claimKinds: ["current_scene", "current_location"],
    text: `Current scene is ${frame.scene.currentScene.label} at ${frame.scene.currentLocation.label}.`,
    visibleRefs: uniqueStrings([
      frame.player.ref,
      frame.scene.currentScene.ref,
      frame.scene.currentLocation.ref,
    ]),
    backendFacts: [
      fact(evidenceId, 1, `Current scene is ${frame.scene.currentScene.label}.`),
      fact(evidenceId, 2, `Current place is ${frame.scene.currentLocation.label}.`),
    ],
    limits: {
      proves: ["current scene label", "current location label"],
      doesNotProve: SCENE_DOES_NOT_PROVE,
    },
  });

  for (const visible of frame.scene.visibleFacts.slice(0, 6)) {
    const visibleEvidenceId = nextEvidenceId(evidence);
    evidence.push({
      evidenceId: visibleEvidenceId,
      sourceKind: "scene_frame",
      sourceRef: frame.frameId,
      authority: "scene_frame_snapshot",
      claimKinds: ["visible_fact"],
      text: visible.summary,
      visibleRefs: [visible.source],
      backendFacts: [fact(visibleEvidenceId, 1, visible.summary)],
      limits: {
        proves: ["visible fact in the SceneFrame snapshot"],
        doesNotProve: SCENE_DOES_NOT_PROVE,
      },
    });
  }

  for (const actor of frame.actors.filter((entry) => entry.role !== "player").slice(0, 6)) {
    const actorEvidenceId = nextEvidenceId(evidence);
    evidence.push({
      evidenceId: actorEvidenceId,
      sourceKind: "scene_frame",
      sourceRef: frame.frameId,
      authority: "scene_frame_snapshot",
      claimKinds: ["visible_actor"],
      text: `${actor.label} is visible in the current SceneFrame.`,
      visibleRefs: [actor.ref],
      backendFacts: [fact(actorEvidenceId, 1, `Visible actor: ${actor.label}.`)],
      limits: {
        proves: ["actor visible in the SceneFrame snapshot"],
        doesNotProve: ["actor private knowledge", "actor intent", "absence of other actors", "future actor action"],
      },
    });
  }

  for (const item of frame.inventory.slice(0, 6)) {
    const itemEvidenceId = nextEvidenceId(evidence);
    evidence.push({
      evidenceId: itemEvidenceId,
      sourceKind: "scene_frame",
      sourceRef: frame.frameId,
      authority: "scene_frame_snapshot",
      claimKinds: ["inventory_status"],
      text: `${item.label} is visible in the inventory snapshot.`,
      visibleRefs: [item.ref],
      backendFacts: [fact(itemEvidenceId, 1, `Inventory item: ${item.label}.`)],
      limits: {
        proves: ["inventory item label in the SceneFrame snapshot"],
        doesNotProve: ["item state change", "item transfer", "absence of other items"],
      },
    });
  }
}

function stage4Evidence(stage4Execution: CleanStage4ExecutionResult, evidence: CleanSettledEvidence[]): void {
  for (const receipt of stage4Execution.receipts) {
    if (receipt.status !== "accepted") continue;
    if (receipt.authority.evidenceAuthority === "terminal_mutation_receipt" && receipt.publicResult.locationChange) {
      const evidenceId = nextEvidenceId(evidence);
      const location = receipt.publicResult.locationChange.locationName;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "terminal_mutation_receipt",
        claimKinds: ["player_location_change", "elapsed_time"],
        text: `Player location changed to ${location}.`,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, `Player location changed to ${location}.`),
          fact(evidenceId, 2, `Travel cost: ${receipt.publicResult.locationChange.travelCost} minute(s).`),
        ],
        limits: {
          proves: ["player location change", "elapsed travel time"],
          doesNotProve: MOVEMENT_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "route_check_receipt") {
      const evidenceId = nextEvidenceId(evidence);
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "route_check_receipt",
        claimKinds: ["route_status"],
        text: receipt.publicResult.summary,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [fact(evidenceId, 1, receipt.publicResult.summary)],
        limits: {
          proves: ["route status only"],
          doesNotProve: ROUTE_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "scene_observation_receipt" && receipt.publicResult.visibleObservation) {
      const evidenceId = nextEvidenceId(evidence);
      const observation = receipt.publicResult.visibleObservation;
      const backendFacts = [
        fact(evidenceId, 1, `Current scene is ${observation.currentScene}.`),
        fact(evidenceId, 2, `Current place is ${observation.currentLocation}.`),
        ...observation.visibleActors.slice(0, 6).map((label, index) =>
          fact(evidenceId, index + 3, `Visible actor: ${label}.`)
        ),
        ...observation.visibleFacts.slice(0, 4).map((summary, index) =>
          fact(evidenceId, index + 9, summary)
        ),
        ...observation.inventory.slice(0, 4).map((label, index) =>
          fact(evidenceId, index + 13, `Inventory item: ${label}.`)
        ),
        ...observation.movementOptions.slice(0, 6).map((label, index) =>
          fact(evidenceId, index + 17, `Movement option: ${label}.`)
        ),
      ];
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "scene_observation_receipt",
        claimKinds: ["current_scene", "current_location", "visible_actor", "visible_fact", "inventory_status", "movement_option"],
        text: receipt.publicResult.summary,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts,
        limits: {
          proves: ["current visible SceneFrame snapshot entries"],
          doesNotProve: SCENE_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "route_options_receipt" && receipt.publicResult.routeOptions) {
      const evidenceId = nextEvidenceId(evidence);
      const routeOptions = receipt.publicResult.routeOptions;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "route_options_receipt",
        claimKinds: ["movement_option"],
        text: receipt.publicResult.summary,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: routeOptions.options.slice(0, 12).map((option, index) =>
          fact(
            evidenceId,
            index + 1,
            `Route option: ${option.label} (${option.connected ? "connected" : "not connected"}${option.travelCost === null ? "" : `, ${option.travelCost} minute(s)`}).`,
          )
        ),
        limits: {
          proves: ["route options exposed by current SceneFrame"],
          doesNotProve: ROUTE_OPTIONS_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "scene_beat_receipt" && receipt.publicResult.sceneBeat) {
      const evidenceId = nextEvidenceId(evidence);
      const beat = receipt.publicResult.sceneBeat;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "scene_beat_receipt",
        claimKinds: ["scene_beat"],
        text: beat.summary,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, beat.summary),
          ...beat.targetLabels.slice(0, 4).map((label, index) =>
            fact(evidenceId, index + 2, `Visible target: ${label}.`)
          ),
        ],
        limits: {
          proves: ["local visible scene beat acknowledgement"],
          doesNotProve: SCENE_BEAT_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "terminal_mutation_receipt" && receipt.publicResult.timeAdvance) {
      const evidenceId = nextEvidenceId(evidence);
      const time = receipt.publicResult.timeAdvance;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "terminal_mutation_receipt",
        claimKinds: ["elapsed_time"],
        text: `${time.elapsedMinutes} minute(s) pass.`,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [fact(evidenceId, 1, `${time.elapsedMinutes} minute(s) pass.`)],
        limits: {
          proves: ["elapsed world clock time"],
          doesNotProve: TIME_DOES_NOT_PROVE,
        },
      });
    }
  }
}

function oracleEvidence(settlement: OracleSettlement, evidence: CleanSettledEvidence[]): void {
  const evidenceId = nextEvidenceId(evidence);
  evidence.push({
    evidenceId,
    sourceKind: "oracle_settlement",
    sourceRef: settlement.settlementId,
    authority: "oracle_visible_outcome",
    claimKinds: ["oracle_outcome"],
    text: settlement.visibleOutcome.selectedMeaning,
    visibleRefs: settlement.authority.evidenceRefs,
    backendFacts: [fact(evidenceId, 1, settlement.visibleOutcome.selectedMeaning)],
    limits: {
      proves: ["selected visible uncertainty outcome"],
      doesNotProve: settlement.authority.forbiddenClaimKinds,
    },
  });
}

function stepAudit(input: {
  checklist: GmActionChecklist | null;
  stage4Execution: CleanStage4ExecutionResult | null;
}): CleanSettledStepAudit[] {
  if (!input.checklist) return [];
  const receiptsByStep = new Map<string, CleanStage4Receipt>();
  for (const receipt of input.stage4Execution?.receipts ?? []) {
    receiptsByStep.set(receipt.stepId, receipt);
  }
  return input.checklist.steps.map((step) => {
    const receipt = receiptsByStep.get(step.stepId);
    if (!receipt) {
      return {
        stepId: step.stepId,
        intendedKind: step.intended.kind,
        status: "not_run",
        receiptId: null,
        authority: null,
        publicReason: "Stage 4 did not produce a receipt for this planned step.",
        maySupportWorldClaim: false,
      };
    }
    return {
      stepId: step.stepId,
      intendedKind: step.intended.kind,
      status: receipt.status,
      receiptId: receipt.receiptId,
      authority: receipt.authority.evidenceAuthority,
      publicReason: receipt.status === "accepted"
        ? receipt.publicResult.summary
        : receipt.failure?.message ?? receipt.publicResult.summary,
      maySupportWorldClaim: false,
    };
  });
}

function settlementKind(input: {
  gmRead: GmRead | null;
  judgment: JudgeUncertainty | null;
  oracleSettlement: OracleSettlement | null;
  stage4Execution: CleanStage4ExecutionResult | null;
}): CleanSettledTurnPacket["settlementKind"] {
  if (input.stage4Execution) {
    const accepted = input.stage4Execution.receipts.some((receipt) => receipt.status === "accepted");
    return accepted ? "stage4_execution" : "stage4_failed_or_skipped";
  }
  if (input.oracleSettlement) return "oracle_visible_outcome";
  if (input.judgment?.nextStep === "ask_clarification" || input.gmRead?.path === "clarification") return "clarification";
  if (input.judgment?.nextStep === "block_no_mutation") return "blocked_no_mutation";
  if (input.gmRead?.path === "continue") return "continue_scene";
  if (input.gmRead?.path === "direct") return "direct_scene";
  return "minimal_safe";
}

function resultClock(input: {
  frame: AuthoritativeSceneFrame;
  stage4Execution: CleanStage4ExecutionResult | null;
}): CleanSettledTurnPacket["result"] {
  if (input.stage4Execution) {
    const resultReceipt = input.stage4Execution.receipts
      .filter((receipt) => receipt.result.worldVersion >= input.frame.base.worldVersion)
      .sort((a, b) => b.result.worldVersion - a.result.worldVersion)[0];
    if (resultReceipt) {
      return {
        tick: resultReceipt.result.tick,
        worldVersion: resultReceipt.result.worldVersion,
        worldTimeMinutes: resultReceipt.result.worldTimeMinutes,
        mutationApplied: input.stage4Execution.mutationApplied,
      };
    }
  }
  return {
    tick: input.frame.base.tick,
    worldVersion: input.frame.base.worldVersion,
    worldTimeMinutes: input.frame.base.worldTimeMinutes,
    mutationApplied: false,
  };
}

export function buildCleanSettledTurnPacket(input: BuildCleanSettlementInput): CleanSettledTurnPacket {
  const acceptedEvidence: CleanSettledEvidence[] = [];
  const hasTerminalMovement = Boolean(input.stage4Execution?.receipts.some((receipt) =>
    receipt.status === "accepted"
    && receipt.authority.evidenceAuthority === "terminal_mutation_receipt"
    && receipt.publicResult.locationChange !== null
  ));
  if (!hasTerminalMovement) {
    sceneEvidence(input.frame, acceptedEvidence);
  }
  if (input.stage4Execution) {
    stage4Evidence(input.stage4Execution, acceptedEvidence);
  }
  if (input.oracleSettlement) {
    oracleEvidence(input.oracleSettlement, acceptedEvidence);
  }

  return assertCleanSettledTurnPacket({
    version: "gameplay-runtime.settled-turn-packet.v1",
    packetId: input.publicPacketId,
    campaignId: input.turn.campaignId,
    turnId: input.turn.turnId,
    frameId: input.frame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: input.gmRead ? "gm-read.v1" : null,
      judgeVersion: input.judgment ? "judge-uncertainty.v1" : null,
      oracleSettlementVersion: input.oracleSettlement ? "oracle-settlement.v1" : null,
      checklistVersion: input.actionChecklist ? "gm-action-checklist.v1" : null,
      stage4ExecutionVersion: input.stage4Execution ? "gameplay-runtime.stage4-execution-result.v1" : null,
    },
    input: {
      submittedPlayerAction: input.turn.playerAction.submitted,
      normalizedPlayerAction: input.turn.playerAction.normalized,
      source: input.turn.playerAction.source,
    },
    base: input.frame.base,
    result: resultClock({ frame: input.frame, stage4Execution: input.stage4Execution }),
    settlementKind: settlementKind(input),
    acceptedEvidence,
    stepAudit: stepAudit({
      checklist: input.actionChecklist,
      stage4Execution: input.stage4Execution,
    }),
    nonAuthoritativeContext: {
      gmReadPath: input.gmRead?.path ?? null,
      gmReadIntent: input.gmRead?.actionInterpretation.playerIntent ?? null,
      judgeNextStep: input.judgment?.nextStep ?? null,
      checklistId: input.actionChecklist?.checklistId ?? null,
      checklistPlanningOnly: Boolean(input.actionChecklist),
    },
    privateGuards: {
      forbiddenActorLabels: input.frame.privateGuards.forbiddenActorLabels,
      forbiddenPrivateTerms: input.frame.privateGuards.forbiddenPrivateTerms,
      forecastForbiddenPrivateTerms: input.frame.forecast.forbiddenPrivateTerms,
    },
    narrationContract: narrationContract(),
  });
}

export function buildCleanNarratorView(packet: CleanSettledTurnPacket): CleanNarratorView {
  return assertCleanNarratorView({
    version: "gameplay-runtime.narrator-view.v1",
    packetId: packet.packetId,
    campaignId: packet.campaignId,
    turnId: packet.turnId,
    playerAction: packet.input.normalizedPlayerAction,
    responseLanguage: "match_player_action",
    preserveLabelsVerbatim: true,
    acceptedEvidence: packet.acceptedEvidence.map((evidence) => ({
      ref: evidence.evidenceId,
      authority: evidence.authority,
      claimKinds: evidence.claimKinds,
      text: evidence.text,
      backendFacts: evidence.backendFacts,
      limits: evidence.limits,
    })),
    stepAuditForGrounding: packet.stepAudit
      .filter((step) => step.status === "failed" || step.status === "skipped")
      .map((step) => ({
        stepId: step.stepId,
        status: step.status as "failed" | "skipped",
        publicReason: step.publicReason ?? "Stage 4 did not accept this step.",
        mayUseAsWorldTruth: false,
      })),
    guard: {
      mayCallTools: false,
      mayInferNewFacts: false,
      mayUseFailedOrSkippedAsTruth: false,
      mayNarrateNoChangeWithoutExplicitEvidence: false,
    },
    privateGuardSidecar: {
      forbiddenActorLabels: packet.privateGuards.forbiddenActorLabels,
      forbiddenPrivateTerms: [
        ...packet.privateGuards.forbiddenPrivateTerms,
        ...packet.privateGuards.forecastForbiddenPrivateTerms,
      ],
    },
  });
}
