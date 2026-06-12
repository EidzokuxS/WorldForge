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

const DIALOGUE_DOES_NOT_PROVE = [
  "truth of speaker claim",
  "durable world fact",
  "NPC private knowledge beyond the utterance",
  "relationship change",
  "future commitment",
  "movement",
  "item state",
  "condition or HP change",
  "location reveal",
  "absence or no-change",
];

type CleanDialogueResult = NonNullable<CleanStage4Receipt["publicResult"]["dialogue"]>;

function formatDialogueQuoteFact(dialogue: CleanDialogueResult): string {
  const quotedSpeech = dialogue.quotedSpeech?.trim();
  if (!quotedSpeech) return `${dialogue.speakerLabel} has a ${dialogue.outcomeKind} dialogue response.`;
  const quoteAlreadyEndsSentence = /[.!?]$/.test(quotedSpeech);
  const displayedQuote = quoteAlreadyEndsSentence ? quotedSpeech : `${quotedSpeech}.`;
  return `${dialogue.speakerLabel} says: "${displayedQuote}"`;
}

const SUPPORT_ACTOR_DOES_NOT_PROVE = [
  "dialogue content",
  "NPC private knowledge",
  "relationship change",
  "future relevance",
  "durable world fact",
  "item state",
  "route truth",
  "movement",
  "absence or no-change",
];

const PLAYER_LOCAL_CONDITION_DOES_NOT_PROVE = [
  "HP change",
  "damage",
  "healing",
  "combat modifier",
  "stealth success",
  "cover effectiveness",
  "item custody or equip state",
  "movement",
  "route truth",
  "world fact",
  "relationship change",
  "dialogue content",
  "NPC condition",
  "NPC private knowledge",
  "absence or no-change beyond the accepted local condition operation",
];

const ITEM_TRANSFER_DOES_NOT_PROVE = [
  "item creation",
  "item discovery",
  "item inspection result",
  "item use or activation",
  "item damage or repair",
  "container contents",
  "currency or barter value",
  "NPC consent or reaction",
  "relationship change",
  "world fact",
  "route truth",
  "location reveal",
  "condition or HP change",
  "dialogue content",
  "NPC private knowledge",
  "absence or no-change beyond the accepted item state",
];

const MINOR_POI_DOES_NOT_PROVE = [
  "actor presence",
  "services or inventory",
  "business fact",
  "readable sign text",
  "hidden discovery",
  "search result",
  "route truth",
  "legal movement destination",
  "location reveal",
  "world fact",
  "dialogue content",
  "NPC private knowledge",
  "absence or no-change beyond the accepted visible place handle",
];

const LOCAL_OBSERVATION_DOES_NOT_PROVE = [
  "hidden discovery",
  "concealed or thorough search result",
  "private facts",
  "broad absence",
  "offscreen facts",
  "future non-discoverability",
  "item use or effects",
  "item state change",
  "phone or device status",
  "route truth beyond route option/check receipts",
  "location reveal",
  "world fact",
  "dialogue content",
  "mutation",
  "no-change",
];

function localObservationSurfaceKindLabel(kind: string): string {
  switch (kind) {
    case "current_scene": return "current scene";
    case "current_location": return "current location";
    case "visible_actor": return "visible actor";
    case "visible_target": return "visible target";
    case "inventory_item": return "inventory item";
    case "visible_fact": return "visible fact";
    case "movement_option": return "route option";
    default: return kind.replace(/_/gu, " ");
  }
}

function localObservationSurfaceKindPluralLabel(kind: string): string {
  switch (kind) {
    case "current_scene": return "the current scene";
    case "current_location": return "the current location";
    case "visible_actor": return "visible actors";
    case "visible_target": return "visible targets";
    case "inventory_item": return "inventory items";
    case "visible_fact": return "visible facts";
    case "movement_option": return "route options";
    default: return localObservationSurfaceKindLabel(kind);
  }
}

function localObservationSurfaceEntryLabel(entry: { surfaceKind: string; label: string }): string {
  return `${localObservationSurfaceKindLabel(entry.surfaceKind)} ${entry.label}`;
}

function localObservationSurfaceGroupLabel(kinds: readonly string[]): string {
  const labels = uniqueStrings(kinds.map(localObservationSurfaceKindPluralLabel));
  if (labels.length === 0) return "current visible entries";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function deviceFacetKindLabel(kind: string): string {
  switch (kind) {
    case "screen_state": return "screen state";
    case "power_indicator": return "power indicator";
    case "battery_indicator": return "battery indicator";
    case "signal_indicator": return "signal indicator";
    case "notification_indicator": return "notification indicator";
    case "message_indicator": return "message indicator";
    case "call_indicator": return "call indicator";
    default: return kind.replace(/_/gu, " ");
  }
}

function deviceFacetKindListLabel(kinds: readonly string[]): string {
  const labels = uniqueStrings(kinds.map(deviceFacetKindLabel));
  if (labels.length === 0) return "requested device surface facets";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

const DEVICE_SURFACE_OBSERVATION_DOES_NOT_PROVE = [
  "hidden or private message contents",
  "true absence of messages, calls, or signal",
  "message or call generation or delivery",
  "caller or sender identity",
  "instructions or mission content",
  "true network coverage",
  "device use or activation",
  "hacking or decryption",
  "item custody, location, or equip state",
  "route truth",
  "location reveal",
  "dialogue content",
  "private knowledge",
  "world fact",
  "broad absence or no-change",
  "future device state",
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

function boundedBackendFacts(facts: Array<ReturnType<typeof fact>>): Array<ReturnType<typeof fact>> {
  return facts.slice(0, 8);
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
        proves: ["current visible scene fact"],
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
      text: `${actor.label} is visible in the current scene.`,
      visibleRefs: [actor.ref],
      backendFacts: [fact(actorEvidenceId, 1, `Visible actor: ${actor.label}.`)],
      limits: {
        proves: ["actor visible in the current scene"],
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
        proves: ["inventory item label in the current inventory view"],
        doesNotProve: ["item state change", "item transfer", "absence of other items"],
      },
    });
  }

  const inventoryRefs = new Set(frame.inventory.map((item) => item.ref.toLowerCase()));
  const visibleTargets = frame.targets
    .filter((target) => !inventoryRefs.has(target.ref.toLowerCase()))
    .slice(0, 6);
  if (visibleTargets.length > 0) {
    const targetEvidenceId = nextEvidenceId(evidence);
    evidence.push({
      evidenceId: targetEvidenceId,
      sourceKind: "scene_frame",
      sourceRef: frame.frameId,
      authority: "scene_frame_snapshot",
      claimKinds: ["visible_target"],
      text: `Visible current-frame targets include ${visibleTargets.map((target) => target.label).join(", ")}.`,
      visibleRefs: visibleTargets.map((target) => target.ref),
      backendFacts: boundedBackendFacts(visibleTargets.map((target, index) =>
        fact(targetEvidenceId, index + 1, `Visible target: ${target.label} (${target.kind}).`)
      )),
      limits: {
        proves: ["visible current-scene target labels"],
        doesNotProve: ["hidden targets", "discovery", "route legality", "movement", "services", "inventory contents", "absence of other targets"],
      },
    });
  }

  if (frame.movementOptions.length > 0) {
    const routeEvidenceId = nextEvidenceId(evidence);
    evidence.push({
      evidenceId: routeEvidenceId,
      sourceKind: "scene_frame",
      sourceRef: frame.frameId,
      authority: "scene_frame_snapshot",
      claimKinds: ["movement_option"],
      text: `Visible route options include ${frame.movementOptions.slice(0, 6).map((option) => option.label).join(", ")}.`,
      visibleRefs: frame.movementOptions.slice(0, 6).map((option) => option.ref),
      backendFacts: boundedBackendFacts(frame.movementOptions.slice(0, 8).map((option, index) =>
        fact(
          routeEvidenceId,
          index + 1,
          `Route option: ${option.label} (${option.connected ? "connected" : "not connected"}${option.travelCost === null ? "" : `, ${option.travelCost} minute(s)`}).`,
        )
      )),
      limits: {
        proves: ["route option labels visible from the current scene"],
        doesNotProve: ["hidden routes", "route safety", "movement", "arrival", "elapsed travel time", "absence of other routes"],
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
        backendFacts: boundedBackendFacts(backendFacts),
        limits: {
          proves: ["current visible scene entries"],
          doesNotProve: SCENE_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "local_observation_receipt" && receipt.publicResult.localObservation) {
      const evidenceId = nextEvidenceId(evidence);
      const observation = receipt.publicResult.localObservation;
      const boundedNegative = observation.resultKind === "bounded_no_match";
      const claimKinds: CleanSettledEvidence["claimKinds"] = boundedNegative
        ? ["local_observation", "bounded_visibility_negative"]
        : observation.resultKind === "positive_list"
          ? ["local_observation"]
          : ["local_observation", "visible_target"];
      const matchFacts = observation.matchedEntries.slice(0, 6).map((entry, index) =>
        fact(evidenceId, index + 3, `Observed ${localObservationSurfaceEntryLabel(entry)}.`)
      );
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "local_observation_receipt",
        claimKinds,
        text: observation.summary,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, observation.summary),
          fact(evidenceId, 2, `Checked current ${localObservationSurfaceGroupLabel(observation.searchedSurfaceKinds)}.`),
          ...matchFacts,
        ],
        limits: {
          proves: boundedNegative
            ? ["bounded no-match against enumerated current visible entries"]
            : ["matching current visible entries"],
          doesNotProve: LOCAL_OBSERVATION_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "device_surface_observation_receipt" && receipt.publicResult.deviceSurfaceObservation) {
      const evidenceId = nextEvidenceId(evidence);
      const observation = receipt.publicResult.deviceSurfaceObservation;
      const noSurface = observation.resultKind === "no_requested_surface";
      const claimKinds: CleanSettledEvidence["claimKinds"] = noSurface
        ? ["device_surface_observation", "device_surface_unavailable"]
        : ["device_surface_observation"];
      const facetFacts = observation.observedFacets.slice(0, 5).map((facet, index) =>
        fact(evidenceId, index + 4, `${facet.displayLabel}: ${facet.valueText}.`)
      );
      const requestedFacetText = deviceFacetKindListLabel(observation.requestedFacetKinds);
      const unavailableFacetText = deviceFacetKindListLabel(observation.unavailableFacetKinds);
      const unavailableFacts = observation.unavailableFacetKinds.length > 0
        ? [fact(evidenceId, facetFacts.length + 4, `Current visible device surface exposes no requested ${unavailableFacetText} for ${observation.deviceLabel}.`)]
        : [];
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "device_surface_observation_receipt",
        claimKinds,
        text: observation.summary,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: boundedBackendFacts([
          fact(evidenceId, 1, observation.summary),
          fact(evidenceId, 2, `Device: ${observation.deviceLabel}.`),
          fact(evidenceId, 3, `Requested surface facets: ${requestedFacetText}.`),
          ...facetFacts,
          ...unavailableFacts,
        ]),
        limits: {
          proves: noSurface
            ? ["bounded current visible device surface result for requested facets", "requested device label"]
            : ["modeled public device surface facets", "requested device label", "current visible device surface anchor"],
          doesNotProve: DEVICE_SURFACE_OBSERVATION_DOES_NOT_PROVE,
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
        backendFacts: boundedBackendFacts(routeOptions.options.slice(0, 12).map((option, index) =>
          fact(
            evidenceId,
            index + 1,
            `Route option: ${option.label} (${option.connected ? "connected" : "not connected"}${option.travelCost === null ? "" : `, ${option.travelCost} minute(s)`}).`,
          )
        )),
        limits: {
          proves: ["route options visible from the current scene"],
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
    if (receipt.authority.evidenceAuthority === "terminal_dialogue_receipt" && receipt.publicResult.dialogue) {
      const evidenceId = nextEvidenceId(evidence);
      const dialogue = receipt.publicResult.dialogue;
      const quoteFact = formatDialogueQuoteFact(dialogue);
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "terminal_dialogue_receipt",
        claimKinds: ["dialogue_response"],
        text: quoteFact,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, `Speaker: ${dialogue.speakerLabel}.`),
          fact(evidenceId, 2, quoteFact),
          fact(evidenceId, 3, `Dialogue summary: ${dialogue.summary}`),
        ],
        limits: {
          proves: [
            "visible speaker identity",
            "visible response content",
            "speaker response happened this turn",
          ],
          doesNotProve: DIALOGUE_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "support_actor_materialization_receipt" && receipt.publicResult.supportActor) {
      const evidenceId = nextEvidenceId(evidence);
      const supportActor = receipt.publicResult.supportActor;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "support_actor_materialization_receipt",
        claimKinds: ["visible_actor", "support_actor_materialization"],
        text: `${supportActor.actorLabel} is visible as a ${supportActor.roleLabel} in ${supportActor.anchorSceneLabel}.`,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, `Visible support actor: ${supportActor.actorLabel}.`),
          fact(evidenceId, 2, `Support role: ${supportActor.roleLabel}.`),
          fact(evidenceId, 3, `Anchor scene: ${supportActor.anchorSceneLabel}.`),
          fact(evidenceId, 4, `Materialization result: ${supportActor.resultKind}.`),
        ],
        limits: {
          proves: [
            "visible temporary support actor label",
            "ordinary support role",
            "current-scene materialization or reuse",
          ],
          doesNotProve: SUPPORT_ACTOR_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "player_local_condition_receipt" && receipt.publicResult.condition) {
      const evidenceId = nextEvidenceId(evidence);
      const condition = receipt.publicResult.condition;
      const operationText = condition.resultKind === "already_present"
        ? `Player is already ${condition.conditionLabel}.`
        : condition.resultKind === "cleared"
          ? `Player clears ${condition.conditionLabel}.`
          : condition.resultKind === "replaced"
            ? `Player changes local posture/readiness to ${condition.conditionLabel}.`
            : `Player is ${condition.conditionLabel}.`;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "player_local_condition_receipt",
        claimKinds: ["player_local_condition"],
        text: `${operationText} Current scene anchor: ${condition.anchorSceneLabel}.`,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, operationText),
          fact(evidenceId, 2, `Condition key: ${condition.conditionKey}.`),
          fact(evidenceId, 3, `Current scene anchor: ${condition.anchorSceneLabel}.`),
          fact(evidenceId, 4, `Condition result: ${condition.resultKind}.`),
          ...(condition.targetLabel
            ? [fact(evidenceId, 5, `Condition target: ${condition.targetLabel}.`)]
            : []),
        ],
        limits: {
          proves: [
            "Player current-scene local posture/readiness condition operation",
            "accepted local condition key and label",
            "current-scene local condition anchor",
          ],
          doesNotProve: PLAYER_LOCAL_CONDITION_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "item_transfer_receipt" && receipt.publicResult.itemTransfer) {
      const evidenceId = nextEvidenceId(evidence);
      const itemTransfer = receipt.publicResult.itemTransfer;
      const operationText = itemTransfer.resultKind === "already_satisfied"
        ? `${itemTransfer.itemLabel} was already in the requested item state.`
        : `${itemTransfer.itemLabel} item state changed: ${itemTransfer.resultKind}.`;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "item_transfer_receipt",
        claimKinds: ["item_state"],
        text: `${operationText} Current scene anchor: ${itemTransfer.anchorSceneLabel}.`,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, operationText),
          fact(evidenceId, 2, `Item label: ${itemTransfer.itemLabel}.`),
          fact(evidenceId, 3, `Operation: ${itemTransfer.operation}.`),
          fact(evidenceId, 4, `Source: ${itemTransfer.sourceLabel}.`),
          fact(evidenceId, 5, `Target: ${itemTransfer.targetLabel}.`),
          fact(evidenceId, 6, `Final equip state: ${itemTransfer.finalEquipState}.`),
          fact(evidenceId, 7, `Current scene anchor: ${itemTransfer.anchorSceneLabel}.`),
          fact(evidenceId, 8, `Item transfer result: ${itemTransfer.resultKind}.`),
        ],
        limits: {
          proves: [
            "accepted item custody/location/equip-state operation",
            "accepted item label",
            "accepted source and target labels",
            "current scene item state anchor",
          ],
          doesNotProve: ITEM_TRANSFER_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "minor_poi_handle_receipt" && receipt.publicResult.minorPoi) {
      const evidenceId = nextEvidenceId(evidence);
      const minorPoi = receipt.publicResult.minorPoi;
      const operationText = minorPoi.resultKind === "reused"
        ? `Visible current-scene place handle reused: ${minorPoi.poiLabel}.`
        : `Visible current-scene place handle created: ${minorPoi.poiLabel}.`;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "minor_poi_handle_receipt",
        claimKinds: ["minor_poi_handle", "visible_target"],
        text: `${operationText} Current scene anchor: ${minorPoi.anchorSceneLabel}.`,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, operationText),
          fact(evidenceId, 2, `Place handle label: ${minorPoi.poiLabel}.`),
          fact(evidenceId, 3, `Place handle kind: ${minorPoi.poiKind}.`),
          fact(evidenceId, 4, `Current scene anchor: ${minorPoi.anchorSceneLabel}.`),
          fact(evidenceId, 5, `Handle result: ${minorPoi.resultKind}.`),
          fact(evidenceId, 6, "This is a visible current-scene target handle only, not a movement destination."),
        ],
        limits: {
          proves: [
            "accepted visible current-scene place handle label",
            "accepted place handle kind",
            "current visible target handle",
          ],
          doesNotProve: MINOR_POI_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "terminal_mutation_receipt" && receipt.publicResult.timeAdvance) {
      const evidenceId = nextEvidenceId(evidence);
      const time = receipt.publicResult.timeAdvance;
      const elapsedText = `World clock advances by ${time.elapsedMinutes} minute(s).`;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "terminal_mutation_receipt",
        claimKinds: ["elapsed_time"],
        text: elapsedText,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [fact(evidenceId, 1, elapsedText)],
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
