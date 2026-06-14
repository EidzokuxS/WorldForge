import {
  assertCleanNarratorView,
  assertCleanSettledTurnPacket,
  type AuthoritativeSceneFrame,
  type CleanNarrationLanguage,
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

function deriveNarrationLanguage(playerAction: string): CleanNarrationLanguage {
  const hasCyrillic = /[\u0400-\u04ff]/u.test(playerAction);
  const hasLatin = /[A-Za-z]/u.test(playerAction);
  if (hasCyrillic && hasLatin) return "mixed";
  if (hasCyrillic) return "ru";
  return "en";
}

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
type CleanRouteOptionsResult = NonNullable<CleanStage4Receipt["publicResult"]["routeOptions"]>;
type CleanRouteOptionResult = CleanRouteOptionsResult["options"][number];

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

type CleanItemTransferResult = NonNullable<CleanStage4Receipt["publicResult"]["itemTransfer"]>;

function itemTransferHolderPhrase(itemTransfer: CleanItemTransferResult): string {
  if (itemTransfer.finalOwnerKind === "visible_actor") {
    return itemTransfer.finalEquipState === "equipped"
      ? `equipped by ${itemTransfer.targetLabel}`
      : `carried by ${itemTransfer.targetLabel}`;
  }
  if (itemTransfer.finalOwnerKind === "player") {
    return itemTransfer.finalEquipState === "equipped"
      ? `equipped by ${itemTransfer.actorLabel}`
      : `carried by ${itemTransfer.actorLabel}`;
  }
  if (itemTransfer.finalLocationKind === "current_scene") {
    return `at ${itemTransfer.anchorSceneLabel}`;
  }
  return `with ${itemTransfer.targetLabel}`;
}

function itemTransferSettledCustodyText(itemTransfer: CleanItemTransferResult): string {
  const holderPhrase = itemTransferHolderPhrase(itemTransfer);
  if (holderPhrase.startsWith("at ")) {
    return `${itemTransfer.itemLabel} is ${holderPhrase}.`;
  }
  return `${itemTransfer.itemLabel} is ${holderPhrase} at ${itemTransfer.anchorSceneLabel}.`;
}

function itemTransferCustodyChangeText(itemTransfer: CleanItemTransferResult): string {
  const settledText = itemTransferSettledCustodyText(itemTransfer);
  if (itemTransfer.resultKind === "already_satisfied") {
    const holderPhrase = itemTransferHolderPhrase(itemTransfer);
    return holderPhrase.startsWith("at ")
      ? `${itemTransfer.itemLabel} is already ${holderPhrase}.`
      : `${itemTransfer.itemLabel} is already ${holderPhrase} at ${itemTransfer.anchorSceneLabel}.`;
  }
  if (itemTransfer.sourceLabel && itemTransfer.targetLabel && itemTransfer.sourceLabel !== itemTransfer.targetLabel) {
    return `${itemTransfer.itemLabel} passes from ${itemTransfer.sourceLabel} to ${itemTransfer.targetLabel} at ${itemTransfer.anchorSceneLabel}.`;
  }
  return settledText;
}

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
  "absence or no-change beyond the accepted visible scene point",
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

function localObservationSurfaceEntryLabels(entries: readonly { surfaceKind: string; label: string }[]): string[] {
  return entries.map(localObservationSurfaceEntryLabel);
}

function evidenceEnglishList(labels: readonly string[]): string {
  const values = uniqueStrings(labels);
  if (values.length === 0) return "Nothing";
  if (values.length === 1) return values[0]!;
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function localObservationSurfaceGroupLabel(kinds: readonly string[]): string {
  const labels = uniqueStrings(kinds.map(localObservationSurfaceKindPluralLabel));
  if (labels.length === 0) return "current visible entries";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function localObservationStoryBeat(observation: {
  resultKind: string;
  queryText: string;
  matchedEntries: readonly { surfaceKind: string; label: string }[];
  searchedSurfaceKinds: readonly string[];
}): string {
  const surfaceGroup = localObservationSurfaceGroupLabel(observation.searchedSurfaceKinds);
  if (observation.resultKind === "bounded_no_match") {
    return `The ${surfaceGroup} show no match for "${observation.queryText}".`;
  }
  if (observation.matchedEntries.length === 0) {
    throw new Error("Local observation story evidence requires matched entries for non-negative results.");
  }
  const labels = uniqueStrings(observation.matchedEntries.map((entry) => entry.label));
  if (observation.resultKind === "positive_list" && observation.searchedSurfaceKinds.length === 1 && observation.searchedSurfaceKinds[0] === "movement_option") {
    return `The visible route choices here are ${evidenceLabelList(labels)}.`;
  }
  if (observation.resultKind === "positive_list") {
    return `${evidenceEnglishList(labels)} ${labels.length === 1 ? "is" : "are"} in the current visible set.`;
  }
  if (observation.resultKind === "ambiguous_match") {
    return `Current visible matches are ${evidenceLabelList(localObservationSurfaceEntryLabels(observation.matchedEntries))}.`;
  }
  return `${evidenceEnglishList(labels)} ${labels.length === 1 ? "is" : "are"} in view here.`;
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

function deviceSurfaceStoryBeat(observation: {
  deviceLabel: string;
  observedFacets: readonly { displayLabel: string; valueText: string }[];
  unavailableFacetKinds: readonly string[];
}): string {
  if (observation.observedFacets.length === 0 && observation.unavailableFacetKinds.length === 0) {
    throw new Error("Device surface story evidence requires observed or unavailable requested facets.");
  }
  if (observation.observedFacets.length === 0) {
    return `${observation.deviceLabel}'s visible surface shows no requested ${deviceFacetKindListLabel(observation.unavailableFacetKinds)}.`;
  }
  const observed = observation.observedFacets
    .map((facet) => `${trimTrailingSentencePunctuation(facet.displayLabel)}: ${trimTrailingSentencePunctuation(facet.valueText)}`);
  const unavailable = observation.unavailableFacetKinds.length > 0
    ? ` Unavailable requested surface facets: ${deviceFacetKindListLabel(observation.unavailableFacetKinds)}.`
    : "";
  return `${observation.deviceLabel}: ${evidenceSemicolonList(observed)}.${unavailable}`;
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

const CLARIFICATION_REQUEST_DOES_NOT_PROVE = [
  "movement",
  "arrival",
  "clock advance",
  "item state",
  "dialogue response",
  "NPC consent or reaction",
  "relationship change",
  "world fact",
  "discovery",
  "condition or HP change",
  "absence",
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

const SCENE_TEXTURE_DOES_NOT_PROVE = [
  "route truth",
  "movement",
  "arrival",
  "current-scene change",
  "actor presence",
  "NPC action",
  "item state",
  "discovery",
  "absence",
  "no-change",
  "private facts",
  "offscreen events",
];

export interface BuildCleanSettlementInput {
  turn: GameplayRuntimeTurnInput;
  publicPacketId: string;
  frame: AuthoritativeSceneFrame;
  postResolutionFrame?: AuthoritativeSceneFrame | null;
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

type CleanSettledBackendFactRole = NonNullable<CleanSettledEvidence["backendFacts"][number]["role"]>;

function fact(
  evidenceId: string,
  index: number,
  role: CleanSettledBackendFactRole,
  text: string,
  value?: string,
) {
  return {
    factRef: `${evidenceId}.f${index}`,
    role,
    ...(value ? { value } : {}),
    text,
    exact: true,
  };
}

function boundedBackendFacts(facts: Array<ReturnType<typeof fact>>): Array<ReturnType<typeof fact>> {
  return facts.slice(0, 8);
}

function evidenceLabelList(labels: readonly string[]): string {
  return uniqueStrings(labels).join(", ");
}

function trimTrailingSentencePunctuation(value: string): string {
  let compact = value.trim();
  while (compact.endsWith(".") || compact.endsWith("!") || compact.endsWith("?")) {
    compact = compact.slice(0, -1).trimEnd();
  }
  return compact;
}

function evidenceSemicolonList(labels: readonly string[]): string {
  return uniqueStrings(labels.map(trimTrailingSentencePunctuation).filter((label) => label.length > 0)).join("; ");
}

function scenePlacementText(currentScene: string, currentLocation: string): string {
  return currentScene === currentLocation
    ? `You are at ${currentScene}.`
    : `You are at ${currentScene}, inside ${currentLocation}.`;
}

function routeTravelCostPhrase(travelCost: number | null): string {
  if (travelCost === null) return "travel time unlisted";
  const unit = travelCost === 1 ? "minute" : "minutes";
  return `${travelCost} ${unit}`;
}

function routeChoiceStatusPhrase(option: CleanRouteOptionResult): string {
  return option.connected ? routeTravelCostPhrase(option.travelCost) : "closed";
}

function routeChoiceDisplay(option: CleanRouteOptionResult): string {
  return `${option.label} (${routeChoiceStatusPhrase(option)})`;
}

function routeChoicesBeat(originLabel: string, boundedOptions: readonly CleanRouteOptionResult[]): string {
  if (boundedOptions.length === 0) {
    return `No visible route choices are listed from ${originLabel}.`;
  }
  return `From ${originLabel}, visible route choices are ${evidenceLabelList(boundedOptions.map(routeChoiceDisplay))}.`;
}

function routeChoiceLabelsBeat(originLabel: string, labels: readonly string[]): string {
  const routeLabels = uniqueStrings(labels);
  if (routeLabels.length === 0) {
    return `No visible route choices are listed from ${originLabel}.`;
  }
  return `From ${originLabel}, visible route choices are ${evidenceLabelList(routeLabels)}.`;
}

function compactSceneTexture(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\.$/u, "");
  if (compact.length === 0) return null;
  return compact.length <= 420 ? compact : `${compact.slice(0, 417).trimEnd()}...`;
}

function splitSceneTextureClauses(value: string): string[] {
  return uniqueStrings((value.match(/[^.!?]+(?:[.!?]+|$)/gu) ?? [value])
    .map((clause) =>
      clause
        .replace(/\s+/gu, " ")
        .trim()
        .replace(/[.!?]+$/u, "")
    )
    .filter((clause) => clause.length > 0));
}

function sceneTextureFacts(frame: AuthoritativeSceneFrame): string[] {
  const textures = [
    compactSceneTexture(frame.scene.currentScene.description),
    frame.scene.currentScene.label === frame.scene.currentLocation.label
      ? null
      : compactSceneTexture(frame.scene.currentLocation.description),
  ].filter((value): value is string => value !== null);
  return uniqueStrings(textures.flatMap(splitSceneTextureClauses)).slice(0, 6);
}

function sceneEvidence(frame: AuthoritativeSceneFrame, evidence: CleanSettledEvidence[]): void {
  const evidenceId = nextEvidenceId(evidence);
  const scenePlacement = scenePlacementText(frame.scene.currentScene.label, frame.scene.currentLocation.label);
    evidence.push({
      evidenceId,
      sourceKind: "scene_frame",
      sourceRef: frame.frameId,
      authority: "scene_frame_snapshot",
      claimKinds: ["current_scene", "current_location"],
      text: scenePlacement,
      visibleRefs: uniqueStrings([
        frame.player.ref,
        frame.scene.currentScene.ref,
        frame.scene.currentLocation.ref,
      ]),
      backendFacts: [
        fact(evidenceId, 1, "scene_placement", `Scene placement: ${scenePlacement}`, scenePlacement),
        fact(evidenceId, 2, "scene_label", `Scene label: ${frame.scene.currentScene.label}.`, frame.scene.currentScene.label),
        fact(evidenceId, 3, "place_label", `Place label: ${frame.scene.currentLocation.label}.`, frame.scene.currentLocation.label),
      ],
    limits: {
      proves: ["current scene label", "current location label"],
      doesNotProve: SCENE_DOES_NOT_PROVE,
    },
  });

  const textures = sceneTextureFacts(frame);
  if (textures.length > 0) {
    const textureEvidenceId = nextEvidenceId(evidence);
    evidence.push({
      evidenceId: textureEvidenceId,
      sourceKind: "scene_frame",
      sourceRef: frame.frameId,
      authority: "scene_frame_snapshot",
      claimKinds: ["scene_texture"],
      text: textures.length === 1
        ? `Current scene texture: ${textures[0]}.`
        : `Current scene texture: ${textures.join(" ")}.`,
      visibleRefs: uniqueStrings([
        frame.scene.currentScene.ref,
        frame.scene.currentLocation.ref,
      ]),
      backendFacts: textures.map((texture, index) =>
        fact(textureEvidenceId, index + 1, "scene_texture", `Scene texture: ${texture}.`, texture)
      ),
      limits: {
        proves: ["public current-scene description texture"],
        doesNotProve: SCENE_TEXTURE_DOES_NOT_PROVE,
      },
    });
  }

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
      backendFacts: [fact(visibleEvidenceId, 1, "visible_scene_facts", `Visible scene facts: ${trimTrailingSentencePunctuation(visible.summary)}.`, trimTrailingSentencePunctuation(visible.summary))],
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
      text: `${actor.label} is in view here.`,
      visibleRefs: [actor.ref],
      backendFacts: [fact(actorEvidenceId, 1, "visible_actor_labels", `Visible actor labels: ${actor.label}.`, actor.label)],
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
      text: `${item.label} is in your inventory.`,
      visibleRefs: [item.ref],
      backendFacts: [fact(itemEvidenceId, 1, "inventory_labels", `Inventory labels: ${item.label}.`, item.label)],
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
    const visibleTargetLabels = visibleTargets.map((target) => target.label);
    const actorTargetLabels = visibleTargets
      .filter((target) => target.kind === "actor")
      .map((target) => target.label);
    const itemTargetLabels = visibleTargets
      .filter((target) => target.kind === "item")
      .map((target) => target.label);
    const placeHandleTargetLabels = visibleTargets
      .filter((target) => target.kind === "place_handle")
      .map((target) => target.label);
    const locationTargetLabels = visibleTargets
      .filter((target) => target.kind === "location")
      .map((target) => target.label);
    const targetFactTexts: Array<{ role: CleanSettledBackendFactRole; text: string; value: string }> = [
      { role: "visible_target_labels", text: `Visible target labels: ${evidenceSemicolonList(visibleTargetLabels)}.`, value: evidenceSemicolonList(visibleTargetLabels) },
      ...(actorTargetLabels.length > 0
        ? [{ role: "visible_actor_target_labels" as const, text: `Visible actor target labels: ${evidenceSemicolonList(actorTargetLabels)}.`, value: evidenceSemicolonList(actorTargetLabels) }]
        : []),
      ...(itemTargetLabels.length > 0
        ? [{ role: "visible_item_target_labels" as const, text: `Visible item target labels: ${evidenceSemicolonList(itemTargetLabels)}.`, value: evidenceSemicolonList(itemTargetLabels) }]
        : []),
      ...(placeHandleTargetLabels.length > 0
        ? [{ role: "visible_place_handle_target_labels" as const, text: `Visible place-handle target labels: ${evidenceSemicolonList(placeHandleTargetLabels)}.`, value: evidenceSemicolonList(placeHandleTargetLabels) }]
        : []),
      ...(locationTargetLabels.length > 0
        ? [{ role: "visible_location_target_labels" as const, text: `Visible location target labels: ${evidenceSemicolonList(locationTargetLabels)}.`, value: evidenceSemicolonList(locationTargetLabels) }]
        : []),
    ];
    evidence.push({
      evidenceId: targetEvidenceId,
      sourceKind: "scene_frame",
      sourceRef: frame.frameId,
      authority: "scene_frame_snapshot",
      claimKinds: ["visible_target"],
      text: `Targets in view here include ${visibleTargetLabels.join(", ")}.`,
      visibleRefs: visibleTargets.map((target) => target.ref),
      backendFacts: boundedBackendFacts(targetFactTexts.map((entry, index) =>
        fact(targetEvidenceId, index + 1, entry.role, entry.text, entry.value)
      )),
      limits: {
        proves: ["visible current-scene target labels"],
        doesNotProve: ["hidden targets", "discovery", "route legality", "movement", "services", "inventory contents", "absence of other targets"],
      },
    });
  }

  if (frame.movementOptions.length > 0) {
    const routeEvidenceId = nextEvidenceId(evidence);
    const routeOptions = frame.movementOptions.slice(0, 8);
    const routeBeat = routeChoicesBeat(frame.scene.currentScene.label, routeOptions);
    const routeLabels = routeOptions.map((option) => option.label);
    const openRouteLabels = routeOptions
      .filter((option) => option.connected)
      .map((option) => option.label);
    const closedRouteLabels = routeOptions
      .filter((option) => !option.connected)
      .map((option) => option.label);
    const routeCostSummary = routeOptions
      .map((option) => `${option.label}: ${routeChoiceStatusPhrase(option)}`)
      .join("; ") || "none";
    evidence.push({
      evidenceId: routeEvidenceId,
      sourceKind: "scene_frame",
      sourceRef: frame.frameId,
      authority: "scene_frame_snapshot",
      claimKinds: ["movement_option"],
      text: routeBeat,
      visibleRefs: routeOptions.map((option) => option.ref),
      backendFacts: boundedBackendFacts([
        fact(routeEvidenceId, 1, "route_choices_beat", `Route choices beat: ${routeBeat}`, routeBeat),
        fact(routeEvidenceId, 2, "route_origin", `Route origin: ${frame.scene.currentScene.label}.`, frame.scene.currentScene.label),
        fact(routeEvidenceId, 3, "route_choice_labels", `Route choice labels: ${routeLabels.join("; ") || "none"}.`, routeLabels.join("; ") || "none"),
        fact(routeEvidenceId, 4, "open_route_labels", `Open route labels: ${openRouteLabels.join("; ") || "none"}.`, openRouteLabels.join("; ") || "none"),
        fact(routeEvidenceId, 5, "closed_route_labels", `Closed route labels: ${closedRouteLabels.join("; ") || "none"}.`, closedRouteLabels.join("; ") || "none"),
        fact(routeEvidenceId, 6, "route_choice_travel_costs", `Route choice travel costs: ${routeCostSummary}.`, routeCostSummary),
      ]),
      limits: {
        proves: ["route option labels visible from the current scene", "route choice phrasing for the player", "route label status and cost list"],
        doesNotProve: ["hidden routes", "route safety", "movement", "arrival", "elapsed travel time", "absence of other routes"],
      },
    });
  }
}

function clarificationQuestion(input: {
  gmRead: GmRead | null;
  judgment: JudgeUncertainty | null;
}): string | null {
  const question = input.gmRead?.path === "clarification"
    ? input.gmRead.liveSceneQuestion.trim()
    : input.judgment?.nextStep === "ask_clarification"
      ? (input.judgment.noRollReason?.explanation.trim() || input.judgment.checkRationale.trim())
      : input.gmRead?.uncertainty.question?.trim();
  if (!question) return null;
  return question.endsWith("?") ? question : `${question}?`;
}

function clarificationEvidence(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead | null;
  judgment: JudgeUncertainty | null;
  evidence: CleanSettledEvidence[];
}): void {
  const evidenceId = nextEvidenceId(input.evidence);
  const question = clarificationQuestion({
    gmRead: input.gmRead,
    judgment: input.judgment,
  });
  if (!question) {
    throw new Error("Clarification settlement requires a GM Read or Judge clarification question.");
  }
  input.evidence.push({
    evidenceId,
    sourceKind: input.gmRead ? "gm_read" : "judge_uncertainty",
    sourceRef: input.gmRead?.frameId ?? input.judgment?.judgmentId ?? input.frame.frameId,
    authority: "clarification_request",
    claimKinds: ["clarification_request"],
    text: `Clarification needed: ${question}`,
    visibleRefs: uniqueStrings([
      input.frame.player.ref,
      ...(input.gmRead?.evidenceRefs ?? input.judgment?.evidenceRefs ?? []),
    ]).slice(0, 16),
    backendFacts: [
      fact(evidenceId, 1, "clarification_request", `Clarification request: ${question}`, question),
    ],
    limits: {
      proves: ["player clarification is required before resolving this action", "clarification question text"],
      doesNotProve: CLARIFICATION_REQUEST_DOES_NOT_PROVE,
    },
  });
}

function stage4Evidence(stage4Execution: CleanStage4ExecutionResult, evidence: CleanSettledEvidence[]): void {
  for (const receipt of stage4Execution.receipts) {
    if (receipt.status !== "accepted") continue;
    if (receipt.authority.evidenceAuthority === "terminal_mutation_receipt" && receipt.publicResult.locationChange) {
      const evidenceId = nextEvidenceId(evidence);
      const location = receipt.publicResult.locationChange.locationName;
      const travelCost = receipt.publicResult.locationChange.travelCost;
      const travelUnit = travelCost === 1 ? "minute" : "minutes";
      const travelDuration = `${travelCost} ${travelUnit}`;
      const travelBeat = travelCost > 0
        ? `After ${travelDuration}, you reach ${location}.`
        : `You reach ${location}.`;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "terminal_mutation_receipt",
        claimKinds: ["player_location_change", "elapsed_time"],
        text: travelBeat,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, "travel_beat", `Travel beat: ${travelBeat}`, travelBeat),
          fact(evidenceId, 2, "destination_label", `Destination label: ${location}.`, location),
          fact(evidenceId, 3, "elapsed_travel_time", `Elapsed travel time: ${travelDuration}.`, travelDuration),
          fact(evidenceId, 4, "current_place_after_movement", `Current place after movement: ${location}.`, location),
        ],
        limits: {
          proves: ["player location change", "elapsed travel time", "movement result phrasing for the player"],
          doesNotProve: MOVEMENT_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "route_check_receipt") {
      const evidenceId = nextEvidenceId(evidence);
      const routeCheck = receipt.publicResult.routeCheck;
      if (!routeCheck) {
        throw new Error("Accepted route_check receipt is missing public route check result.");
      }
      const routeStatus = routeCheck.status;
      const routeLabel = routeCheck.label;
      const routeBeat = routeStatus === "connected"
        ? `From here, the path to ${routeLabel} is open.`
        : `The path to ${routeLabel} is closed from here.`;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "route_check_receipt",
        claimKinds: ["route_status"],
        text: routeBeat,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, "route_beat", `Route beat: ${routeBeat}`, routeBeat),
          fact(evidenceId, 2, "route_label", `Route label: ${routeLabel}.`),
          fact(evidenceId, 3, "route_status", `Route status: ${routeStatus}.`),
        ],
        limits: {
          proves: ["route status only", "route status phrasing for the player"],
          doesNotProve: ROUTE_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "scene_observation_receipt" && receipt.publicResult.visibleObservation) {
      const evidenceId = nextEvidenceId(evidence);
      const observation = receipt.publicResult.visibleObservation;
      const scenePlacement = scenePlacementText(observation.currentScene, observation.currentLocation);
      const routeBeat = routeChoiceLabelsBeat(observation.currentScene, observation.movementOptions);
      const claimKinds: CleanSettledEvidence["claimKinds"] = ["current_scene", "current_location"];
      if (observation.visibleActors.length > 0) claimKinds.push("visible_actor");
      if (observation.visibleFacts.length > 0) claimKinds.push("visible_fact");
      if (observation.inventory.length > 0) claimKinds.push("inventory_status");
      if (observation.movementOptions.length > 0) claimKinds.push("movement_option");
      const backendFactTexts: Array<{ role: CleanSettledBackendFactRole; text: string; value?: string }> = [
        { role: "scene_placement", text: `Scene placement: ${scenePlacement}`, value: scenePlacement },
        { role: "scene_label", text: `Scene label: ${observation.currentScene}.`, value: observation.currentScene },
        { role: "place_label", text: `Place label: ${observation.currentLocation}.`, value: observation.currentLocation },
        ...(observation.visibleActors.length > 0
          ? [{ role: "visible_actor_labels" as const, text: `Visible actor labels: ${evidenceSemicolonList(observation.visibleActors)}.`, value: evidenceSemicolonList(observation.visibleActors) }]
          : []),
        ...(observation.visibleFacts.length > 0
          ? [{ role: "visible_scene_facts" as const, text: `Visible scene facts: ${evidenceSemicolonList(observation.visibleFacts.slice(0, 4))}.`, value: evidenceSemicolonList(observation.visibleFacts.slice(0, 4)) }]
          : []),
        ...(observation.inventory.length > 0
          ? [{ role: "inventory_labels" as const, text: `Inventory labels: ${evidenceSemicolonList(observation.inventory)}.`, value: evidenceSemicolonList(observation.inventory) }]
          : []),
        ...(observation.movementOptions.length > 0
          ? [{ role: "route_choices_beat" as const, text: `Route choices beat: ${routeBeat}`, value: routeBeat }]
          : []),
        ...(observation.movementOptions.length > 0
          ? [{ role: "route_choice_labels" as const, text: `Route choice labels: ${evidenceSemicolonList(observation.movementOptions)}.`, value: evidenceSemicolonList(observation.movementOptions) }]
          : []),
      ];
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "scene_observation_receipt",
        claimKinds,
        text: scenePlacement,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: boundedBackendFacts(backendFactTexts.map((entry, index) =>
          fact(evidenceId, index + 1, entry.role, entry.text, entry.value)
        )),
        limits: {
          proves: ["current visible scene entries", "scene observation phrasing for the player"],
          doesNotProve: SCENE_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "local_observation_receipt" && receipt.publicResult.localObservation) {
      const evidenceId = nextEvidenceId(evidence);
      const observation = receipt.publicResult.localObservation;
      const boundedNegative = observation.resultKind === "bounded_no_match";
      const localBeat = localObservationStoryBeat(observation);
      const surfaceGroup = localObservationSurfaceGroupLabel(observation.searchedSurfaceKinds);
      const observedLabels = uniqueStrings(observation.matchedEntries.map((entry) => entry.label));
      const observedSurfaceLabels = localObservationSurfaceEntryLabels(observation.matchedEntries);
      const observedLabelList = evidenceSemicolonList(observedLabels);
      const claimKinds: CleanSettledEvidence["claimKinds"] = boundedNegative
        ? ["local_observation", "bounded_visibility_negative"]
        : observation.resultKind === "positive_list"
          ? ["local_observation"]
          : ["local_observation", "visible_target"];
      const backendFactTexts: Array<{ role: CleanSettledBackendFactRole; text: string; value?: string }> = [
        { role: "local_observation_beat", text: `Local observation beat: ${localBeat}`, value: localBeat },
        { role: "searched_visible_surfaces", text: `Searched visible surfaces: ${surfaceGroup}.` },
        { role: "observation_query", text: `Observation query: ${observation.queryText}.` },
        ...(observedLabels.length > 0
          ? [{ role: "observed_entry_labels" as const, text: `Observed entry labels: ${observedLabelList}.`, value: observedLabelList }]
          : []),
        ...(observedSurfaceLabels.length > 0
          ? [{ role: "observed_entry_surfaces" as const, text: `Observed entry surfaces: ${evidenceSemicolonList(observedSurfaceLabels)}.` }]
          : []),
        { role: "anchor_scene", text: `Anchor scene: ${observation.anchorSceneLabel}.` },
        { role: "anchor_location", text: `Anchor location: ${observation.anchorLocationLabel}.` },
      ];
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "local_observation_receipt",
        claimKinds,
        text: localBeat,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: boundedBackendFacts(backendFactTexts.map((entry, index) =>
          fact(evidenceId, index + 1, entry.role, entry.text, entry.value)
        )),
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
      const deviceBeat = deviceSurfaceStoryBeat(observation);
      const requestedFacetText = deviceFacetKindListLabel(observation.requestedFacetKinds);
      const unavailableFacetText = deviceFacetKindListLabel(observation.unavailableFacetKinds);
      const observedFacetFacts = observation.observedFacets.slice(0, 5)
        .map((facet) => `${trimTrailingSentencePunctuation(facet.displayLabel)}: ${trimTrailingSentencePunctuation(facet.valueText)}`);
      const backendFactTexts: Array<{ role: CleanSettledBackendFactRole; text: string; value?: string }> = [
        { role: "device_surface_beat", text: `Device surface beat: ${deviceBeat}`, value: deviceBeat },
        { role: "device_label", text: `Device label: ${observation.deviceLabel}.` },
        { role: "requested_surface_facets", text: `Requested surface facets: ${requestedFacetText}.` },
        ...(observedFacetFacts.length > 0
          ? [{ role: "observed_device_facets" as const, text: `Observed device facets: ${evidenceSemicolonList(observedFacetFacts)}.` }]
          : []),
        ...(observation.unavailableFacetKinds.length > 0
          ? [{ role: "unavailable_surface_facets" as const, text: `Unavailable surface facets: ${unavailableFacetText}.` }]
          : []),
        { role: "anchor_scene", text: `Anchor scene: ${observation.anchorSceneLabel}.` },
        { role: "anchor_location", text: `Anchor location: ${observation.anchorLocationLabel}.` },
      ];
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "device_surface_observation_receipt",
        claimKinds,
        text: deviceBeat,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: boundedBackendFacts(backendFactTexts.map((entry, index) =>
          fact(evidenceId, index + 1, entry.role, entry.text, entry.value)
        )),
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
      const boundedOptions = routeOptions.options.slice(0, 8);
      const routeBeat = routeChoicesBeat(routeOptions.fromLabel, boundedOptions);
      const routeLabels = boundedOptions.map((option) => option.label);
      const openRouteLabels = boundedOptions
        .filter((option) => option.connected)
        .map((option) => option.label);
      const closedRouteLabels = boundedOptions
        .filter((option) => !option.connected)
        .map((option) => option.label);
      const routeCostSummary = boundedOptions
        .map((option) => `${option.label}: ${routeChoiceStatusPhrase(option)}`)
        .join("; ") || "none";
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "route_options_receipt",
        claimKinds: ["movement_option"],
        text: routeBeat,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: boundedBackendFacts([
          fact(evidenceId, 1, "route_choices_beat", `Route choices beat: ${routeBeat}`, routeBeat),
          fact(evidenceId, 2, "route_origin", `Route origin: ${routeOptions.fromLabel}.`, routeOptions.fromLabel),
          fact(evidenceId, 3, "route_choice_labels", `Route choice labels: ${routeLabels.join("; ") || "none"}.`, routeLabels.join("; ") || "none"),
          fact(evidenceId, 4, "open_route_labels", `Open route labels: ${openRouteLabels.join("; ") || "none"}.`, openRouteLabels.join("; ") || "none"),
          fact(evidenceId, 5, "closed_route_labels", `Closed route labels: ${closedRouteLabels.join("; ") || "none"}.`, closedRouteLabels.join("; ") || "none"),
          fact(evidenceId, 6, "route_choice_travel_costs", `Route choice travel costs: ${routeCostSummary}.`, routeCostSummary),
        ]),
        limits: {
          proves: ["route options visible from the current scene", "route choice phrasing for the player", "route label status and cost list"],
          doesNotProve: ROUTE_OPTIONS_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "scene_beat_receipt" && receipt.publicResult.sceneBeat) {
      const evidenceId = nextEvidenceId(evidence);
      const beat = receipt.publicResult.sceneBeat;
      const targetLabels = beat.targetLabels.slice(0, 4);
      const backendFactTexts: Array<{ role: CleanSettledBackendFactRole; text: string; value?: string }> = [
        { role: "scene_beat", text: `Scene beat: ${beat.summary}`, value: beat.summary },
        ...(targetLabels.length > 0
          ? [{ role: "scene_beat_target_labels" as const, text: `Scene beat target labels: ${evidenceSemicolonList(targetLabels)}.` }]
          : []),
      ];
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "scene_beat_receipt",
        claimKinds: ["scene_beat"],
        text: beat.summary,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: backendFactTexts.map((entry, index) =>
          fact(evidenceId, index + 1, entry.role, entry.text, entry.value)
        ),
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
          fact(evidenceId, 1, "speaker_label", `Speaker: ${dialogue.speakerLabel}.`),
          fact(evidenceId, 2, "dialogue_quote", quoteFact, quoteFact),
          fact(evidenceId, 3, "dialogue_summary", `Dialogue summary: ${dialogue.summary}`),
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
      const presenceText = `${supportActor.actorLabel} is now in view at ${supportActor.anchorSceneLabel} as a ${supportActor.roleLabel}.`;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "support_actor_materialization_receipt",
        claimKinds: ["visible_actor", "support_actor_materialization"],
        text: presenceText,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, "support_actor_presence", presenceText, presenceText),
          fact(evidenceId, 2, "visible_support_actor", `Visible person now in view: ${supportActor.actorLabel}.`, supportActor.actorLabel),
          fact(evidenceId, 3, "support_role", `Ordinary scene role: ${supportActor.roleLabel}.`, supportActor.roleLabel),
          fact(evidenceId, 4, "anchor_scene", `Scene anchor: ${supportActor.anchorSceneLabel}.`, supportActor.anchorSceneLabel),
          fact(evidenceId, 5, "materialization_result", `Presence result: ${supportActor.resultKind}.`, supportActor.resultKind),
        ],
        limits: {
          proves: [
            "visible current-scene person label",
            "ordinary scene role",
            "current-scene presence or reuse",
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
          fact(evidenceId, 1, "player_condition_operation", operationText, operationText),
          fact(evidenceId, 2, "condition_key", `Condition key: ${condition.conditionKey}.`),
          fact(evidenceId, 3, "current_scene_anchor", `Current scene anchor: ${condition.anchorSceneLabel}.`),
          fact(evidenceId, 4, "condition_result", `Condition result: ${condition.resultKind}.`),
          ...(condition.targetLabel
            ? [fact(evidenceId, 5, "condition_target", `Condition target: ${condition.targetLabel}.`)]
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
      const custodyChangeText = itemTransferCustodyChangeText(itemTransfer);
      const settledCustodyText = itemTransferSettledCustodyText(itemTransfer);
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "item_transfer_receipt",
        claimKinds: ["item_state"],
        text: `${custodyChangeText} ${settledCustodyText}`,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, "custody_change", `Custody change: ${custodyChangeText}`, custodyChangeText),
          fact(evidenceId, 2, "settled_custody", `Settled custody: ${settledCustodyText}`, settledCustodyText),
          fact(evidenceId, 3, "item_label", `Item label: ${itemTransfer.itemLabel}.`, itemTransfer.itemLabel),
          fact(evidenceId, 4, "source_label", `Source: ${itemTransfer.sourceLabel}.`, itemTransfer.sourceLabel),
          fact(evidenceId, 5, "target_label", `Target: ${itemTransfer.targetLabel}.`, itemTransfer.targetLabel),
          fact(evidenceId, 6, "final_equip_state", `Final equip state: ${itemTransfer.finalEquipState}.`, itemTransfer.finalEquipState),
          fact(evidenceId, 7, "current_scene_anchor", `Current scene anchor: ${itemTransfer.anchorSceneLabel}.`, itemTransfer.anchorSceneLabel),
          fact(evidenceId, 8, "item_transfer_result", `Item transfer result: ${itemTransfer.resultKind}.`, itemTransfer.resultKind),
        ],
        limits: {
          proves: [
            "accepted item custody/location/equip-state operation",
            "accepted item label",
            "accepted source and target labels",
            "current scene item state anchor",
            "settled custody phrasing for the player",
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
        ? `Visible current-scene point reused: ${minorPoi.poiLabel}.`
        : `Visible current-scene point marked: ${minorPoi.poiLabel}.`;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "minor_poi_handle_receipt",
        claimKinds: ["minor_poi_handle", "visible_target"],
        text: `${operationText} Current scene anchor: ${minorPoi.anchorSceneLabel}.`,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, "minor_poi_operation", operationText, operationText),
          fact(evidenceId, 2, "place_handle_label", `Scene point label: ${minorPoi.poiLabel}.`, minorPoi.poiLabel),
          fact(evidenceId, 3, "place_handle_kind", `Scene point kind: ${minorPoi.poiKind}.`, minorPoi.poiKind),
          fact(evidenceId, 4, "current_scene_anchor", `Current scene anchor: ${minorPoi.anchorSceneLabel}.`),
          fact(evidenceId, 5, "handle_result", `Scene point result: ${minorPoi.resultKind}.`, minorPoi.resultKind),
          fact(evidenceId, 6, "place_handle_scope", "This is a visible current-scene point for reference only; movement uses separate route evidence."),
        ],
        limits: {
          proves: [
            "accepted visible current-scene point label",
            "accepted scene point kind",
            "current visible scene point",
          ],
          doesNotProve: MINOR_POI_DOES_NOT_PROVE,
        },
      });
      continue;
    }
    if (receipt.authority.evidenceAuthority === "terminal_mutation_receipt" && receipt.publicResult.timeAdvance) {
      const evidenceId = nextEvidenceId(evidence);
      const time = receipt.publicResult.timeAdvance;
      const elapsedUnit = time.elapsedMinutes === 1 ? "minute" : "minutes";
      const elapsedDuration = `${time.elapsedMinutes} ${elapsedUnit}`;
      const timeBeat = time.elapsedMinutes === 1
        ? `${elapsedDuration} passes.`
        : `${elapsedDuration} pass.`;
      evidence.push({
        evidenceId,
        sourceKind: "stage4_receipt",
        sourceRef: receipt.receiptId,
        authority: "terminal_mutation_receipt",
        claimKinds: ["elapsed_time"],
        text: timeBeat,
        visibleRefs: receipt.publicResult.visibleRefs,
        backendFacts: [
          fact(evidenceId, 1, "time_beat", `Time beat: ${timeBeat}`, timeBeat),
          fact(evidenceId, 2, "elapsed_time", `Elapsed time: ${elapsedDuration}.`),
        ],
        limits: {
          proves: ["elapsed world clock time", "time passage phrasing for the player"],
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
    backendFacts: [fact(
      evidenceId,
      1,
      "oracle_selected_meaning",
      settlement.visibleOutcome.selectedMeaning,
      settlement.visibleOutcome.selectedMeaning,
    )],
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
  throw new Error("Clean settlement requires an admitted settlement source before player-facing packet creation.");
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
  const kind = settlementKind(input);
  const hasTerminalMovement = Boolean(input.stage4Execution?.receipts.some((receipt) =>
    receipt.status === "accepted"
    && receipt.authority.evidenceAuthority === "terminal_mutation_receipt"
    && receipt.publicResult.locationChange !== null
  ));
  const sceneFrameForEvidence = hasTerminalMovement
    ? input.postResolutionFrame ?? null
    : input.frame;
  if (kind === "clarification") {
    clarificationEvidence({
      frame: input.frame,
      gmRead: input.gmRead,
      judgment: input.judgment,
      evidence: acceptedEvidence,
    });
  }
  if (sceneFrameForEvidence) {
    sceneEvidence(sceneFrameForEvidence, acceptedEvidence);
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
    settlementKind: kind,
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
    responseLanguage: "match_player_action",
    language: deriveNarrationLanguage(packet.input.normalizedPlayerAction),
    languageSource: "derived_from_player_action_without_prompting_raw_action",
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
