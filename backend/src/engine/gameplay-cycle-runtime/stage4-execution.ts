import { randomUUID } from "node:crypto";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import { getSqliteConnection } from "../../db/index.js";
import { withSqliteWriteLock } from "../../db/sqlite-write-lock.js";
import {
  hydrateStoredPlayerRecord,
  projectPlayerRecord,
  type PlayerRecordProjection,
} from "../../character/record-adapters.js";
import {
  loadLocationGraph,
  resolveTravelPath,
} from "../location-graph.js";
import {
  assertCleanStage4ExecutionResult,
  cleanStage4DialogueRequestEffectSchema,
  cleanStage4SupportActorCreateEffectSchema,
  assertCleanStage4Receipt,
  assertCleanStage4Request,
  type AuthoritativeSceneFrame,
  type CleanStage4ExecutionResult,
  type CleanStage4Receipt,
  type CleanStage4Request,
  type GmActionChecklist,
} from "./contracts.js";

type Step = GmActionChecklist["steps"][number];
type SupportActorCreateEffect = Extract<CleanStage4Request["effect"], { kind: "support_actor_create" }>;
type SupportActorRoleKind = SupportActorCreateEffect["roleKind"];
type SupportActorMaterializationResult = NonNullable<CleanStage4Receipt["publicResult"]["supportActor"]>;

type PlayerRow = {
  id: string;
  campaign_id: string;
  name: string;
  race: string;
  gender: string;
  age: string;
  appearance: string;
  hp: number;
  character_record: string;
  derived_tags: string;
  tags: string;
  equipped_items: string;
  current_location_id: string | null;
  current_scene_location_id: string | null;
};

type ClockRow = {
  world_version: number;
  world_time_minutes: number;
  current_tick: number;
};

type LocationRow = {
  id: string;
  name: string;
};

type NpcSupportRow = {
  id: string;
  name: string;
  persona: string;
  tags: string;
  derived_tags: string;
  tier: "temporary" | "persistent" | "key";
  current_location_id: string | null;
  current_scene_location_id: string | null;
};

export interface CleanStage4ReceiptStore {
  insert(receipt: CleanStage4Receipt, createdAt?: number): void;
}

export interface Stage4ExecutionEvent {
  type: "state_update";
  data: {
    type: "location_change";
    locationName: string;
    travelCost: number;
    path: string[];
  } | {
    type: "time_advance";
    elapsedMinutes: number;
    reasonKind: "brief_local_action" | "wait" | "short_rest";
  };
}

export interface CleanStage4ExecutionRunResult {
  status: "executed" | "skipped";
  execution: CleanStage4ExecutionResult | null;
  publicEvents: Stage4ExecutionEvent[];
}

export interface Stage4FrameRefreshRequest {
  initialFrame: AuthoritativeSceneFrame;
  currentFrame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: GmActionChecklist["steps"][number];
  receipt: CleanStage4Receipt;
}

export type Stage4FrameRefresh = (request: Stage4FrameRefreshRequest) => Promise<AuthoritativeSceneFrame>;

type MaterializedSpeakerBinding = NonNullable<Step["dependencyBindings"]>[number];

type Stage4MaterializedSpeakerResolution = {
  bindingId: "materialized_speaker";
  fromStepId: string;
  receiptId: string;
  actorRef: string;
  actorLabel: string;
  refreshedFrameId: string;
};

type Stage4DialogueDependencyResolution = {
  materializedSpeaker: Stage4MaterializedSpeakerResolution | null;
};

export interface Stage4DialogueRequestCandidateRequest {
  system: string;
  prompt: string;
  repairOf?: {
    candidate: unknown;
    issues: Stage4DialogueRequestValidationIssue[];
  };
}

export type Stage4DialogueRequestGenerator =
  (request: Stage4DialogueRequestCandidateRequest) => Promise<unknown>;

export interface Stage4DialogueRequestValidationIssue {
  code:
    | "backend_ref"
    | "private_term"
    | "schema_invalid"
    | "speaker_invalid"
    | "uncited_ref"
    | "unplanned_ref";
  path: string;
  message: string;
}

export interface Stage4SupportActorRequestCandidateRequest {
  system: string;
  prompt: string;
  repairOf?: {
    candidate: unknown;
    issues: Stage4SupportActorRequestValidationIssue[];
  };
}

export type Stage4SupportActorRequestGenerator =
  (request: Stage4SupportActorRequestCandidateRequest) => Promise<unknown>;

export interface Stage4SupportActorRequestValidationIssue {
  code:
    | "anchor_invalid"
    | "backend_ref"
    | "private_term"
    | "role_collision"
    | "schema_invalid"
    | "uncited_ref"
    | "unplanned_ref";
  path: string;
  message: string;
}

export const sqliteCleanStage4ReceiptStore: CleanStage4ReceiptStore = {
  insert(receipt, createdAt = Date.now()) {
    getSqliteConnection()
      .prepare(`
        INSERT INTO clean_gameplay_stage4_receipts (
          receipt_id,
          campaign_id,
          turn_id,
          frame_id,
          checklist_id,
          step_id,
          capability_id,
          status,
          base_world_version,
          result_world_version,
          mutation_applied,
          receipt_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        receipt.receiptId,
        receipt.campaignId,
        receipt.turnId,
        receipt.frameId,
        receipt.checklistId,
        receipt.stepId,
        receipt.capabilityId,
        receipt.status,
        receipt.base.worldVersion,
        receipt.result.worldVersion,
        receipt.result.mutationApplied ? 1 : 0,
        JSON.stringify(receipt),
        createdAt,
      );
  },
};

function destinationOption(frame: AuthoritativeSceneFrame, ref: string) {
  return frame.movementOptions.find((option) =>
    option.ref.trim().toLowerCase() === ref.trim().toLowerCase()
    || option.label.trim().toLowerCase() === ref.trim().toLowerCase()
  ) ?? null;
}

function locationByLabel(frame: AuthoritativeSceneFrame, label: string): LocationRow | null {
  const graph = loadLocationGraph({ campaignId: frame.campaignId });
  const normalized = label.trim().toLowerCase();
  const matches = graph.locations.filter((location) =>
    location.name.trim().toLowerCase() === normalized
  );
  if (matches.length !== 1) return null;
  return { id: matches[0].id, name: matches[0].name };
}

function readPlayer(frame: AuthoritativeSceneFrame): PlayerRow | null {
  return getSqliteConnection()
    .prepare(`
      SELECT
        id,
        campaign_id,
        name,
        race,
        gender,
        age,
        appearance,
        hp,
        character_record,
        derived_tags,
        tags,
        equipped_items,
        current_location_id,
        current_scene_location_id
      FROM players
      WHERE campaign_id = ?
      LIMIT 1
    `)
    .get(frame.campaignId) as PlayerRow | undefined ?? null;
}

function readClock(campaignId: string): ClockRow {
  const row = getSqliteConnection()
    .prepare(`
      SELECT world_version, world_time_minutes, current_tick
      FROM world_clocks
      WHERE campaign_id = ?
      LIMIT 1
    `)
    .get(campaignId) as ClockRow | undefined;
  return row ?? { world_version: 0, world_time_minutes: 0, current_tick: 0 };
}

function publicPathLabels(locationIds: readonly string[], locations: readonly { id: string; name: string }[]): string[] {
  const byId = new Map(locations.map((location) => [location.id, location.name]));
  return locationIds.map((id) => byId.get(id)).filter((label): label is string => Boolean(label));
}

function requestForStep(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  requiredRouteReceiptId: string | null;
}): CleanStage4Request {
  const destinationRef = input.step.targetRefs[0] ?? "";
  const kind = input.step.intended.kind;
  const capabilityId = cleanStage4CapabilityForKind(kind);
  return assertCleanStage4Request({
    version: "gameplay-runtime.stage4-request.v1",
    requestId: `stage4-request-${randomUUID()}`,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    stepId: input.step.stepId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      checklistVersion: "gm-action-checklist.v1",
      checklistId: input.checklist.checklistId,
      checklistStepId: input.step.stepId,
    },
    base: input.frame.base,
    author: "backend_from_checklist",
    modelAuthored: false,
    capabilityId,
    effect: requestEffectForStep({
      frame: input.frame,
      step: input.step,
      capabilityId,
      destinationRef,
      requiredRouteReceiptId: input.requiredRouteReceiptId,
    }),
  });
}

function cleanStage4CapabilityForKind(kind: Step["intended"]["kind"]): CleanStage4Receipt["capabilityId"] {
  if (kind === "observe_visible") return "observe_visible";
  if (kind === "route_options") return "route_options";
  if (kind === "route_check") return "route_check";
  if (kind === "movement") return "movement";
  if (kind === "dialogue_record") return "dialogue_record";
  if (kind === "support_actor_create") return "support_actor_create";
  if (kind === "time_advance") return "time_advance";
  if (kind === "scene_beat_record") return "scene_beat_record";
  return "scene_beat_record";
}

function requestEffectForStep(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  capabilityId: CleanStage4Receipt["capabilityId"];
  destinationRef: string;
  requiredRouteReceiptId: string | null;
}): CleanStage4Request["effect"] {
  if (input.capabilityId === "observe_visible") {
    return {
      kind: "observe_visible",
      actorRef: "Player",
      scope: "current_scene",
      evidenceRefs: input.step.evidenceRefs,
    };
  }
  if (input.capabilityId === "route_options") {
    return {
      kind: "route_options",
      actorRef: "Player",
      fromRef: input.frame.scene.currentLocation.ref,
      evidenceRefs: input.step.evidenceRefs,
    };
  }
  if (input.capabilityId === "route_check") {
    return {
      kind: "route_check",
      actorRef: "Player",
      destinationRef: input.destinationRef,
      evidenceRefs: input.step.evidenceRefs,
    };
  }
  if (input.capabilityId === "movement") {
    return {
      kind: "movement",
      actorRef: "Player",
      destinationRef: input.destinationRef,
      travelMode: "walk",
      requiredRouteReceiptId: input.requiredRouteReceiptId,
      evidenceRefs: input.step.evidenceRefs,
    };
  }
  if (input.capabilityId === "time_advance") {
    return {
      kind: "time_advance",
      actorRef: "Player",
      sceneRef: input.frame.scene.currentScene.ref,
      elapsedMinutes: 5,
      reasonKind: "wait",
      evidenceRefs: input.step.evidenceRefs,
    };
  }
  return {
    kind: "scene_beat_record",
    actorRef: "Player",
    sceneRef: input.frame.scene.currentScene.ref,
    targetRefs: input.step.targetRefs,
    beatKind: "generic_scene_beat",
    evidenceRefs: input.step.evidenceRefs,
  };
}

function baseReceipt(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  status: CleanStage4Receipt["status"];
  capabilityId: CleanStage4Receipt["capabilityId"];
  summary: string;
  visibleRefs: string[];
  routeStatus?: "connected" | "disconnected" | null;
  routeOptions?: CleanStage4Receipt["publicResult"]["routeOptions"];
  locationChange?: CleanStage4Receipt["publicResult"]["locationChange"];
  timeAdvance?: CleanStage4Receipt["publicResult"]["timeAdvance"];
  visibleObservation?: CleanStage4Receipt["publicResult"]["visibleObservation"];
  sceneBeat?: CleanStage4Receipt["publicResult"]["sceneBeat"];
  dialogue?: CleanStage4Receipt["publicResult"]["dialogue"];
  supportActor?: CleanStage4Receipt["publicResult"]["supportActor"];
  resultWorldVersion?: number;
  resultWorldTimeMinutes?: number;
  resultTick?: number;
  mutationApplied?: boolean;
  authorityTraceId?: string | null;
  clockReceiptId?: string | null;
  playerId?: string | null;
  fromLocationId?: string | null;
  destinationLocationId?: string | null;
  supportActorId?: string | null;
  supportActorOperation?: "inserted" | "reused" | null;
  anchorLocationId?: string | null;
  anchorSceneLocationId?: string | null;
  edgeIds?: string[];
  stateDeltaRefs?: string[];
  failure?: CleanStage4Receipt["failure"];
}): CleanStage4Receipt {
  const accepted = input.status === "accepted";
  const movementAccepted = accepted && input.capabilityId === "movement";
  const timeAccepted = accepted && input.capabilityId === "time_advance";
  const observationAccepted = accepted && input.capabilityId === "observe_visible";
  const routeOptionsAccepted = accepted && input.capabilityId === "route_options";
  const sceneBeatAccepted = accepted && input.capabilityId === "scene_beat_record";
  const dialogueAccepted = accepted && input.capabilityId === "dialogue_record";
  const supportActorAccepted = accepted && input.capabilityId === "support_actor_create";
  const supportActorCreated = supportActorAccepted && input.supportActor?.resultKind === "created";
  return assertCleanStage4Receipt({
    version: "gameplay-runtime.stage4-receipt.v1",
    receiptId: `stage4-receipt-${randomUUID()}`,
    requestId: input.request.requestId,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    stepId: input.step.stepId,
    capabilityId: input.capabilityId,
    status: input.status,
    source: input.request.source,
    base: input.frame.base,
    result: {
      tick: input.resultTick ?? input.frame.base.tick,
      worldVersion: input.resultWorldVersion ?? input.frame.base.worldVersion,
      worldTimeMinutes: input.resultWorldTimeMinutes ?? input.frame.base.worldTimeMinutes,
      mutationApplied: input.mutationApplied ?? false,
    },
    authority: {
      evidenceAuthority: movementAccepted
        ? "terminal_mutation_receipt"
        : timeAccepted
          ? "terminal_mutation_receipt"
          : observationAccepted
            ? "scene_observation_receipt"
            : routeOptionsAccepted
              ? "route_options_receipt"
              : accepted && input.capabilityId === "route_check"
                ? "route_check_receipt"
                : sceneBeatAccepted
                  ? "scene_beat_receipt"
                  : dialogueAccepted
                    ? "terminal_dialogue_receipt"
                    : supportActorAccepted
                      ? "support_actor_materialization_receipt"
                    : input.status === "skipped"
                      ? "skip_receipt"
                      : "failure_receipt",
      mutationAuthority: movementAccepted
        ? "player_location_and_world_clock"
        : timeAccepted
          ? "world_clock_only"
          : supportActorCreated
            ? "current_scene_support_actor"
            : "none",
      visibleResultAuthority: movementAccepted
        ? "may_claim_player_location_change"
        : timeAccepted
          ? "may_claim_elapsed_time"
          : observationAccepted
            ? "may_describe_visible_snapshot"
            : routeOptionsAccepted
              ? "may_list_route_options"
              : accepted && input.capabilityId === "route_check"
                ? "may_explain_route_status"
                : sceneBeatAccepted
                  ? "may_acknowledge_scene_beat"
                  : dialogueAccepted
                    ? "may_quote_visible_dialogue_response"
                    : supportActorAccepted
                      ? "may_claim_visible_support_actor_materialized"
                    : input.status === "failed"
                      ? "failure_only"
                      : "none",
      maySupportNarrationClaim: accepted,
      mayAuthorizeMutation: movementAccepted || timeAccepted || supportActorCreated,
    },
    publicResult: {
      summary: input.summary,
      visibleRefs: input.visibleRefs,
      routeStatus: input.routeStatus ?? null,
      routeOptions: input.routeOptions ?? null,
      locationChange: input.locationChange ?? null,
      timeAdvance: input.timeAdvance ?? null,
      visibleObservation: input.visibleObservation ?? null,
      sceneBeat: input.sceneBeat ?? null,
      dialogue: input.dialogue ?? null,
      supportActor: input.supportActor ?? null,
    },
    privateResult: {
      playerId: input.playerId ?? null,
      fromLocationId: input.fromLocationId ?? null,
      destinationLocationId: input.destinationLocationId ?? null,
      supportActorId: input.supportActorId ?? null,
      supportActorOperation: input.supportActorOperation ?? null,
      anchorLocationId: input.anchorLocationId ?? null,
      anchorSceneLocationId: input.anchorSceneLocationId ?? null,
      edgeIds: input.edgeIds ?? [],
      authorityTraceId: input.authorityTraceId ?? null,
      clockReceiptId: input.clockReceiptId ?? null,
      stateDeltaRefs: input.stateDeltaRefs ?? [],
    },
    failure: input.failure ?? null,
  });
}

function failReceipt(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  capabilityId: CleanStage4Receipt["capabilityId"];
  kind: NonNullable<CleanStage4Receipt["failure"]>["kind"];
  message: string;
}): CleanStage4Receipt {
  return baseReceipt({
    ...input,
    status: "failed",
    summary: input.message,
    visibleRefs: ["Player", ...(input.step.targetRefs.slice(0, 1))],
    failure: {
      kind: input.kind,
      message: input.message,
      hiddenMutationApplied: false,
    },
  });
}

function skipReceipt(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  capabilityId: CleanStage4Receipt["capabilityId"];
  kind: NonNullable<CleanStage4Receipt["failure"]>["kind"];
  message: string;
}): CleanStage4Receipt {
  return baseReceipt({
    ...input,
    status: "skipped",
    summary: input.message,
    visibleRefs: ["Player", ...(input.step.targetRefs.slice(0, 1))],
    failure: {
      kind: input.kind,
      message: input.message,
      hiddenMutationApplied: false,
    },
  });
}

function validateFrameAndClock(input: {
  frame: AuthoritativeSceneFrame;
  player: PlayerRow | null;
  clock: ClockRow;
}): { ok: true } | { ok: false; message: string } {
  if (!input.player) {
    return { ok: false, message: "Player row is unavailable for Stage 4 execution." };
  }
  if (
    input.clock.world_version !== input.frame.base.worldVersion
    || input.clock.world_time_minutes !== input.frame.base.worldTimeMinutes
  ) {
    return { ok: false, message: "Stage 4 frame clock is stale." };
  }
  const current = locationByLabel(input.frame, input.frame.scene.currentLocation.label);
  if (!current || input.player.current_location_id !== current.id) {
    return { ok: false, message: "Stage 4 player location no longer matches the SceneFrame." };
  }
  return { ok: true };
}

function labelForRef(frame: AuthoritativeSceneFrame, ref: string): string {
  if (ref === frame.player.ref) return frame.player.label;
  const actor = frame.actors.find((entry) => entry.ref.toLowerCase() === ref.toLowerCase());
  if (actor) return actor.label;
  const target = frame.targets.find((entry) => entry.ref.toLowerCase() === ref.toLowerCase());
  if (target) return target.label;
  const route = frame.movementOptions.find((entry) => entry.ref.toLowerCase() === ref.toLowerCase());
  if (route) return route.label;
  const item = frame.inventory.find((entry) => entry.ref.toLowerCase() === ref.toLowerCase());
  if (item) return item.label;
  if (ref.toLowerCase() === frame.scene.currentScene.ref.toLowerCase()) return frame.scene.currentScene.label;
  if (ref.toLowerCase() === frame.scene.currentLocation.ref.toLowerCase()) return frame.scene.currentLocation.label;
  return ref;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizedRef(ref: string): string {
  return ref.trim().toLowerCase();
}

function zodIssue(issue: { path: PropertyKey[]; message: string }): Stage4DialogueRequestValidationIssue {
  return {
    code: "schema_invalid",
    path: issue.path.map(String).join(".") || "<root>",
    message: issue.message,
  };
}

function backendRefIssue(ref: string): boolean {
  return /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(ref)
    || /^(actor|campaign|edge|fact|item|knowledge|location|npc|packet|receipt|route|scene|turn|world)[_:]/i.test(ref);
}

function collectDialoguePrivateTermIssues(input: {
  frame: AuthoritativeSceneFrame;
  candidate: unknown;
}): Stage4DialogueRequestValidationIssue[] {
  const terms = uniqueStrings([
    ...input.frame.privateGuards.forbiddenActorLabels,
    ...input.frame.privateGuards.forbiddenPrivateTerms,
    ...input.frame.forecast.forbiddenPrivateTerms,
  ]);
  if (terms.length === 0) return [];
  const text = JSON.stringify(input.candidate).toLowerCase();
  return terms.some((term) => text.includes(term.toLowerCase()))
    ? [{
      code: "private_term",
      path: "<root>",
      message: "Dialogue request effect must not leak private frame guard terms.",
    }]
    : [];
}

export function validateDialogueRequestEffectCandidate(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  candidate: unknown;
  dependencyResolution?: Stage4DialogueDependencyResolution | null;
}): { status: "accepted"; effect: Extract<CleanStage4Request["effect"], { kind: "dialogue_record" }>; issues: [] } | {
  status: "rejected";
  issues: Stage4DialogueRequestValidationIssue[];
} {
  const issues = collectDialoguePrivateTermIssues({
    frame: input.frame,
    candidate: input.candidate,
  });
  const parsed = cleanStage4DialogueRequestEffectSchema.safeParse(input.candidate);
  if (!parsed.success) {
    return {
      status: "rejected",
      issues: [...issues, ...parsed.error.issues.map(zodIssue)],
    };
  }

  const effect = parsed.data;
  const citable = new Set(input.frame.citableRefs.map(normalizedRef));
  const planned = new Set([
    input.frame.player.ref,
    ...input.step.targetRefs,
    ...input.step.evidenceRefs,
    ...(input.dependencyResolution?.materializedSpeaker
      ? [input.dependencyResolution.materializedSpeaker.actorRef]
      : []),
  ].map(normalizedRef));
  const refs = uniqueStrings([
    effect.speakerRef,
    ...effect.addresseeRefs,
    ...effect.evidenceRefs,
  ]);

  for (const ref of refs) {
    if (!citable.has(normalizedRef(ref))) {
      issues.push({
        code: "uncited_ref",
        path: "refs",
        message: `Dialogue request cited ref "${ref}" outside SceneFrame.citableRefs.`,
      });
    }
    if (!planned.has(normalizedRef(ref))) {
      issues.push({
        code: "unplanned_ref",
        path: "refs",
        message: `Dialogue request cited ref "${ref}" outside the accepted checklist step scope.`,
      });
    }
    if (backendRefIssue(ref)) {
      issues.push({
        code: "backend_ref",
        path: "refs",
        message: `Dialogue request cited backend-looking ref "${ref}".`,
      });
    }
  }

  const speaker = input.frame.actors.find((actor) =>
    actor.role !== "player" && normalizedRef(actor.ref) === normalizedRef(effect.speakerRef)
  );
  if (!speaker) {
    issues.push({
      code: "speaker_invalid",
      path: "speakerRef",
      message: "Dialogue request speakerRef must be exactly one already-visible non-player SceneFrame actor.",
    });
  }
  if (
    input.dependencyResolution?.materializedSpeaker
    && normalizedRef(effect.speakerRef) !== normalizedRef(input.dependencyResolution.materializedSpeaker.actorRef)
  ) {
    issues.push({
      code: "speaker_invalid",
      path: "speakerRef",
      message: "Dependent support-actor dialogue must use the actorRef resolved from the post-dependency SceneFrame.",
    });
  }
  if (!effect.addresseeRefs.some((ref) => normalizedRef(ref) === normalizedRef(input.frame.player.ref))) {
    issues.push({
      code: "speaker_invalid",
      path: "addresseeRefs",
      message: "Dialogue request must include Player as an addressee in P65.",
    });
  }

  if (issues.length > 0) {
    return { status: "rejected", issues };
  }
  return { status: "accepted", effect, issues: [] };
}

function promptFrameForDialogue(frame: AuthoritativeSceneFrame): unknown {
  return {
    version: frame.version,
    frameId: frame.frameId,
    turnId: frame.turnId,
    base: frame.base,
    playerAction: frame.playerAction,
    scene: frame.scene,
    player: frame.player,
    actors: frame.actors.map((actor) => ({
      ref: actor.ref,
      label: actor.label,
      role: actor.role,
      visibleStatus: actor.visibleStatus,
    })),
    citableRefs: frame.citableRefs,
  };
}

export function buildStage4DialogueRequestSystemPrompt(): string {
  return [
    "You are WorldForge clean Stage 4 Dialogue Request.",
    "Return only JSON matching the dialogue_record effect schema.",
    "This is not narration. It creates exactly one visible speaker-response payload for backend validation.",
    "The speaker must be one already-visible non-player actor from SceneFrame.actors and the addressee must include Player.",
    "For non-silence outcomes, response.kind must be speech and quotedSpeech is required.",
    "For silence outcomes, response.kind must be silence and quotedSpeech must be null.",
    "Do not include state deltas, world facts, relationship changes, item/condition/location/movement effects, memory, durable events, old tool ids, or backend refs.",
    "The response authorizes only what the visible speaker visibly says or does in this turn; it does not prove the speaker's claim is true.",
    "Response-language directives in the player action are UI preferences, not in-world language barriers unless explicit citable scene evidence says otherwise.",
    "Use only refs from the accepted checklist step and SceneFrame.citableRefs.",
  ].join("\n");
}

export function buildStage4DialogueRequestPrompt(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  dependencyResolution?: Stage4DialogueDependencyResolution | null;
}): string {
  return [
    "Produce one dialogue_record effect for this accepted checklist step.",
    "Required effect shape:",
    "{ kind, authorityKind, speakerRef, addresseeRefs, outcomeKind, response, languageBasis, evidenceRefs, stateEffects }",
    input.dependencyResolution?.materializedSpeaker
      ? [
        "Resolved materialized-speaker dependency:",
        JSON.stringify(input.dependencyResolution.materializedSpeaker, null, 2),
        "The speakerRef must be exactly the resolved actorRef above, and that actor must appear in the authoritative SceneFrame below.",
      ].join("\n")
      : "No materialized-speaker dependency is active for this dialogue step.",
    "Accepted checklist step:",
    JSON.stringify(input.step, null, 2),
    "Authoritative SceneFrame:",
    JSON.stringify(promptFrameForDialogue(input.frame), null, 2),
  ].join("\n\n");
}

function buildStage4DialogueRepairPrompt(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  candidate: unknown;
  issues: Stage4DialogueRequestValidationIssue[];
  dependencyResolution?: Stage4DialogueDependencyResolution | null;
}): string {
  return [
    "Repair the dialogue_record effect so it satisfies the clean P65 dialogue contract.",
    "Do not add unsupported fields, old tool ids, backend refs, mutations, world facts, memory, or state deltas.",
    input.dependencyResolution?.materializedSpeaker
      ? `This is dependent support-actor dialogue; speakerRef must be ${input.dependencyResolution.materializedSpeaker.actorRef}.`
      : "This dialogue step has no materialized-speaker dependency.",
    "Validation issues:",
    JSON.stringify(input.issues, null, 2),
    "Original candidate:",
    JSON.stringify(input.candidate, null, 2),
    "Accepted checklist step:",
    JSON.stringify(input.step, null, 2),
    "Authoritative SceneFrame:",
    JSON.stringify(promptFrameForDialogue(input.frame), null, 2),
  ].join("\n\n");
}

async function generateDialogueEffectCandidate(input: {
  provider: ProviderConfig;
  request: Stage4DialogueRequestCandidateRequest;
}): Promise<unknown> {
  const generated = await safeGenerateObject({
    model: createModel(input.provider, { role: "storyteller", reasoningMode: "bypass" }),
    schema: cleanStage4DialogueRequestEffectSchema,
    system: input.request.system,
    prompt: input.request.prompt,
    temperature: 0.2,
    maxOutputTokens: 1000,
    mode: "native_json",
    retries: 1,
    allowTextFallback: false,
    allowRepair: false,
    strictSchema: true,
  });
  return generated.object;
}

function dialogueRequestFromEffect(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  effect: Extract<CleanStage4Request["effect"], { kind: "dialogue_record" }>;
}): CleanStage4Request {
  return assertCleanStage4Request({
    version: "gameplay-runtime.stage4-request.v1",
    requestId: `stage4-request-${randomUUID()}`,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    stepId: input.step.stepId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      checklistVersion: "gm-action-checklist.v1",
      checklistId: input.checklist.checklistId,
      checklistStepId: input.step.stepId,
    },
    base: input.frame.base,
    author: "model_from_stage4_dialogue_request",
    modelAuthored: true,
    capabilityId: "dialogue_record",
    effect: input.effect,
  });
}

function placeholderDialogueRequest(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
}): CleanStage4Request {
  const speakerRef = input.step.targetRefs.find((ref) =>
    input.frame.actors.some((actor) =>
      actor.role !== "player" && normalizedRef(actor.ref) === normalizedRef(ref)
    )
  ) ?? input.step.targetRefs[0] ?? input.frame.scene.currentScene.ref;
  return dialogueRequestFromEffect({
    ...input,
    effect: {
      kind: "dialogue_record",
      authorityKind: "existing_visible_actor",
      speakerRef,
      addresseeRefs: ["Player"],
      outcomeKind: "silence",
      response: {
        kind: "silence",
        quotedSpeech: null,
        summary: "No accepted dialogue response was generated.",
      },
      languageBasis: {
        responseLanguage: "match_player_action",
        source: "turn_language_profile",
      },
      evidenceRefs: uniqueStrings(["Player", speakerRef, ...input.step.evidenceRefs]).slice(0, 12),
      stateEffects: {
        appliesState: false,
      },
    },
  });
}

async function buildDialogueRequest(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  dependencyResolution?: Stage4DialogueDependencyResolution | null;
  provider?: ProviderConfig;
  generateDialogueRequest?: Stage4DialogueRequestGenerator;
}): Promise<{ status: "accepted"; request: CleanStage4Request; issues: [] } | {
  status: "failed";
  request: CleanStage4Request;
  issues: Stage4DialogueRequestValidationIssue[];
}> {
  const system = buildStage4DialogueRequestSystemPrompt();
  const prompt = buildStage4DialogueRequestPrompt({
    frame: input.frame,
    step: input.step,
    dependencyResolution: input.dependencyResolution,
  });
  const generator = input.generateDialogueRequest
    ?? (input.provider
      ? ((request: Stage4DialogueRequestCandidateRequest) => generateDialogueEffectCandidate({
        provider: input.provider as ProviderConfig,
        request,
      }))
      : null);
  if (!generator) {
    return {
      status: "failed",
      request: placeholderDialogueRequest(input),
      issues: [{
        code: "schema_invalid",
        path: "<generation>",
        message: "P65 dialogue execution requires a Stage 4 dialogue request generator.",
      }],
    };
  }

  let firstCandidate: unknown;
  try {
    firstCandidate = await generator({ system, prompt });
  } catch (error) {
    return {
      status: "failed",
      request: placeholderDialogueRequest(input),
      issues: [{
        code: "schema_invalid",
        path: "<generation>",
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }

  const firstValidation = validateDialogueRequestEffectCandidate({
    frame: input.frame,
    step: input.step,
    candidate: firstCandidate,
    dependencyResolution: input.dependencyResolution,
  });
  if (firstValidation.status === "accepted") {
    return {
      status: "accepted",
      request: dialogueRequestFromEffect({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        effect: firstValidation.effect,
      }),
      issues: [],
    };
  }

  try {
    const repairCandidate = await generator({
      system,
      prompt: buildStage4DialogueRepairPrompt({
        frame: input.frame,
        step: input.step,
        candidate: firstCandidate,
        issues: firstValidation.issues,
        dependencyResolution: input.dependencyResolution,
      }),
      repairOf: {
        candidate: firstCandidate,
        issues: firstValidation.issues,
      },
    });
    const repairValidation = validateDialogueRequestEffectCandidate({
      frame: input.frame,
      step: input.step,
      candidate: repairCandidate,
      dependencyResolution: input.dependencyResolution,
    });
    if (repairValidation.status === "accepted") {
      return {
        status: "accepted",
        request: dialogueRequestFromEffect({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          effect: repairValidation.effect,
        }),
        issues: [],
      };
    }
    return {
      status: "failed",
      request: placeholderDialogueRequest(input),
      issues: [...firstValidation.issues, ...repairValidation.issues],
    };
  } catch (error) {
    return {
      status: "failed",
      request: placeholderDialogueRequest(input),
      issues: [
        ...firstValidation.issues,
        {
          code: "schema_invalid",
          path: "<repair>",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

const SUPPORT_ROLE_LABELS: Record<SupportActorRoleKind, { actorLabel: string; roleLabel: string }> = {
  attendant: { actorLabel: "Local Attendant", roleLabel: "attendant" },
  bystander: { actorLabel: "Local Bystander", roleLabel: "bystander" },
  clerk: { actorLabel: "Local Clerk", roleLabel: "clerk" },
  courier: { actorLabel: "Local Courier", roleLabel: "courier" },
  crowd_voice: { actorLabel: "Local Crowd Voice", roleLabel: "crowd voice" },
  dockhand: { actorLabel: "Local Dockhand", roleLabel: "dockhand" },
  guard: { actorLabel: "Local Guard", roleLabel: "guard" },
  guide: { actorLabel: "Local Guide", roleLabel: "guide" },
  helper: { actorLabel: "Local Helper", roleLabel: "helper" },
  laborer: { actorLabel: "Local Laborer", roleLabel: "laborer" },
  porter: { actorLabel: "Local Porter", roleLabel: "porter" },
  vendor: { actorLabel: "Local Vendor", roleLabel: "vendor" },
  witness: { actorLabel: "Local Witness", roleLabel: "witness" },
};

function supportActorLabels(roleKind: SupportActorRoleKind): { actorLabel: string; roleLabel: string } {
  return SUPPORT_ROLE_LABELS[roleKind];
}

function safeParseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function hasTag(row: NpcSupportRow, tag: string): boolean {
  return safeParseStringArray(row.tags).some((entry) => entry.toLowerCase() === tag.toLowerCase());
}

function isReusableSupportActor(input: {
  row: NpcSupportRow;
  roleKind: SupportActorRoleKind;
  currentLocationId: string;
  currentSceneLocationId: string;
}): boolean {
  return input.row.tier === "temporary"
    && input.row.current_location_id === input.currentLocationId
    && input.row.current_scene_location_id === input.currentSceneLocationId
    && hasTag(input.row, "temporary-support")
    && hasTag(input.row, "clean-runtime-support")
    && hasTag(input.row, `support-role:${input.roleKind}`)
    && hasTag(input.row, "current-scene")
    && !hasTag(input.row, "hidden")
    && !hasTag(input.row, "concealed")
    && !hasTag(input.row, "disguised")
    && !hasTag(input.row, "secret")
    && !hasTag(input.row, "private")
    && !hasTag(input.row, "remote")
    && !hasTag(input.row, "persistent")
    && !hasTag(input.row, "key");
}

function collectSupportActorPrivateTermIssues(input: {
  frame: AuthoritativeSceneFrame;
  candidate: unknown;
}): Stage4SupportActorRequestValidationIssue[] {
  const terms = uniqueStrings([
    ...input.frame.privateGuards.forbiddenActorLabels,
    ...input.frame.privateGuards.forbiddenPrivateTerms,
    ...input.frame.forecast.forbiddenPrivateTerms,
  ]);
  if (terms.length === 0) return [];
  const text = JSON.stringify(input.candidate).toLowerCase();
  return terms.some((term) => text.includes(term.toLowerCase()))
    ? [{
      code: "private_term",
      path: "<root>",
      message: "Support actor request effect must not leak private frame guard terms.",
    }]
    : [];
}

function zodSupportIssue(issue: { path: PropertyKey[]; message: string }): Stage4SupportActorRequestValidationIssue {
  return {
    code: "schema_invalid",
    path: issue.path.map(String).join(".") || "<root>",
    message: issue.message,
  };
}

export function validateSupportActorRequestEffectCandidate(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  candidate: unknown;
}): { status: "accepted"; effect: SupportActorCreateEffect; issues: [] } | {
  status: "rejected";
  issues: Stage4SupportActorRequestValidationIssue[];
} {
  const issues = collectSupportActorPrivateTermIssues({
    frame: input.frame,
    candidate: input.candidate,
  });
  const parsed = cleanStage4SupportActorCreateEffectSchema.safeParse(input.candidate);
  if (!parsed.success) {
    return {
      status: "rejected",
      issues: [...issues, ...parsed.error.issues.map(zodSupportIssue)],
    };
  }

  const effect = parsed.data;
  const citable = new Set(input.frame.citableRefs.map(normalizedRef));
  const planned = new Set([
    input.frame.player.ref,
    input.frame.scene.currentScene.ref,
    input.frame.scene.currentLocation.ref,
    ...input.step.targetRefs,
    ...input.step.evidenceRefs,
  ].map(normalizedRef));
  const refs = uniqueStrings([
    effect.anchorRef,
    ...effect.evidenceRefs,
  ]);

  if (normalizedRef(effect.anchorRef) !== normalizedRef(input.frame.scene.currentScene.ref)) {
    issues.push({
      code: "anchor_invalid",
      path: "anchorRef",
      message: "Support actor materialization must anchor exactly to the current SceneFrame scene ref.",
    });
  }

  for (const ref of refs) {
    if (!citable.has(normalizedRef(ref))) {
      issues.push({
        code: "uncited_ref",
        path: "refs",
        message: `Support actor request cited ref "${ref}" outside SceneFrame.citableRefs.`,
      });
    }
    if (!planned.has(normalizedRef(ref))) {
      issues.push({
        code: "unplanned_ref",
        path: "refs",
        message: `Support actor request cited ref "${ref}" outside the accepted checklist step scope.`,
      });
    }
    if (backendRefIssue(ref)) {
      issues.push({
        code: "backend_ref",
        path: "refs",
        message: `Support actor request cited backend-looking ref "${ref}".`,
      });
    }
  }

  const roleCollisionLabels = [
    input.frame.player.label,
    ...input.frame.actors.map((actor) => actor.label),
  ].map((label) => label.trim().toLowerCase());
  const modelRoleLabel = effect.roleLabel.trim().toLowerCase();
  if (roleCollisionLabels.includes(modelRoleLabel)) {
    issues.push({
      code: "role_collision",
      path: "roleLabel",
      message: "Support actor request roleLabel must not collide with the Player or already-visible actor labels.",
    });
  }

  if (issues.length > 0) {
    return { status: "rejected", issues };
  }
  return { status: "accepted", effect, issues: [] };
}

function promptFrameForSupportActor(frame: AuthoritativeSceneFrame): unknown {
  return {
    version: frame.version,
    frameId: frame.frameId,
    turnId: frame.turnId,
    base: frame.base,
    playerAction: frame.playerAction,
    scene: frame.scene,
    player: frame.player,
    actors: frame.actors.map((actor) => ({
      ref: actor.ref,
      label: actor.label,
      role: actor.role,
      visibleStatus: actor.visibleStatus,
    })),
    citableRefs: frame.citableRefs,
  };
}

export function buildStage4SupportActorRequestSystemPrompt(): string {
  return [
    "You are WorldForge clean Stage 4 Support Actor Request.",
    "Return only JSON matching the support_actor_create effect schema.",
    "This is not narration. It proposes one bounded ordinary current-scene support actor presentation for backend validation.",
    "Use only ordinary local roles allowed by the schema and anchorRef must be the current SceneFrame scene ref.",
    "Do not create named people, key NPCs, faction leaders, secret contacts, hidden actors, remote actors, family members, persistent actors, or campaign-critical roles.",
    "Do not include dialogue content, world facts, relationship changes, item state, route truth, future relevance, private knowledge, old tool ids, backend refs, or durable event claims.",
    "Set identityBounds exactly to temporary/current_scene/minor_support/reactive_only/mayBecomePersistentHere=false.",
    "Set reusePolicy to reuse_matching_temporary_current_scene_or_create and all forbiddenPayloads fields to false.",
    "Use only refs from the accepted checklist step and SceneFrame.citableRefs.",
  ].join("\n");
}

export function buildStage4SupportActorRequestPrompt(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
}): string {
  return [
    "Produce one support_actor_create effect for this accepted checklist step.",
    "Required effect shape:",
    "{ kind, authorityKind, anchorScope, anchorRef, roleKind, roleLabel, publicPresentation, identityBounds, reusePolicy, reason, evidenceRefs, forbiddenPayloads }",
    "Accepted checklist step:",
    JSON.stringify(input.step, null, 2),
    "Authoritative SceneFrame:",
    JSON.stringify(promptFrameForSupportActor(input.frame), null, 2),
  ].join("\n\n");
}

function buildStage4SupportActorRepairPrompt(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  candidate: unknown;
  issues: Stage4SupportActorRequestValidationIssue[];
}): string {
  return [
    "Repair the support_actor_create effect so it satisfies the clean P66 support actor contract.",
    "Do not add unsupported fields, old tool ids, backend refs, dialogue, world facts, relationships, item state, route truth, future relevance, private knowledge, or durable events.",
    "Validation issues:",
    JSON.stringify(input.issues, null, 2),
    "Original candidate:",
    JSON.stringify(input.candidate, null, 2),
    "Accepted checklist step:",
    JSON.stringify(input.step, null, 2),
    "Authoritative SceneFrame:",
    JSON.stringify(promptFrameForSupportActor(input.frame), null, 2),
  ].join("\n\n");
}

async function generateSupportActorEffectCandidate(input: {
  provider: ProviderConfig;
  request: Stage4SupportActorRequestCandidateRequest;
}): Promise<unknown> {
  const generated = await safeGenerateObject({
    model: createModel(input.provider, { role: "storyteller", reasoningMode: "bypass" }),
    schema: cleanStage4SupportActorCreateEffectSchema,
    system: input.request.system,
    prompt: input.request.prompt,
    temperature: 0.2,
    maxOutputTokens: 900,
    mode: "native_json",
    retries: 1,
    allowTextFallback: false,
    allowRepair: false,
    strictSchema: true,
  });
  return generated.object;
}

function supportActorRequestFromEffect(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  effect: SupportActorCreateEffect;
}): CleanStage4Request {
  return assertCleanStage4Request({
    version: "gameplay-runtime.stage4-request.v1",
    requestId: `stage4-request-${randomUUID()}`,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    stepId: input.step.stepId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      checklistVersion: "gm-action-checklist.v1",
      checklistId: input.checklist.checklistId,
      checklistStepId: input.step.stepId,
    },
    base: input.frame.base,
    author: "model_from_stage4_support_actor_request",
    modelAuthored: true,
    capabilityId: "support_actor_create",
    effect: input.effect,
  });
}

function placeholderSupportActorRequest(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
}): CleanStage4Request {
  const labels = supportActorLabels("helper");
  return supportActorRequestFromEffect({
    ...input,
    effect: {
      kind: "support_actor_create",
      authorityKind: "ordinary_current_scene_support_actor",
      anchorScope: "current_scene",
      anchorRef: input.frame.scene.currentScene.ref,
      roleKind: "helper",
      roleLabel: labels.roleLabel,
      publicPresentation: {
        publicSummary: "No accepted support actor request was generated.",
        visibleCue: null,
        voiceHint: null,
      },
      identityBounds: {
        tier: "temporary",
        persistence: "current_scene",
        significance: "minor_support",
        agency: "reactive_only",
        mayBecomePersistentHere: false,
      },
      reusePolicy: "reuse_matching_temporary_current_scene_or_create",
      reason: "Fallback placeholder for failed support actor request generation.",
      evidenceRefs: uniqueStrings(["Player", input.frame.scene.currentScene.ref, ...input.step.evidenceRefs]).slice(0, 12),
      forbiddenPayloads: {
        dialogueContent: false,
        worldFact: false,
        relationship: false,
        itemState: false,
        routeTruth: false,
        futureRelevance: false,
        privateKnowledge: false,
      },
    },
  });
}

async function buildSupportActorRequest(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  provider?: ProviderConfig;
  generateSupportActorRequest?: Stage4SupportActorRequestGenerator;
}): Promise<{ status: "accepted"; request: CleanStage4Request; issues: [] } | {
  status: "failed";
  request: CleanStage4Request;
  issues: Stage4SupportActorRequestValidationIssue[];
}> {
  const system = buildStage4SupportActorRequestSystemPrompt();
  const prompt = buildStage4SupportActorRequestPrompt({
    frame: input.frame,
    step: input.step,
  });
  const generator = input.generateSupportActorRequest
    ?? (input.provider
      ? ((request: Stage4SupportActorRequestCandidateRequest) => generateSupportActorEffectCandidate({
        provider: input.provider as ProviderConfig,
        request,
      }))
      : null);
  if (!generator) {
    return {
      status: "failed",
      request: placeholderSupportActorRequest(input),
      issues: [{
        code: "schema_invalid",
        path: "<generation>",
        message: "P66 support actor execution requires a Stage 4 support actor request generator.",
      }],
    };
  }

  let firstCandidate: unknown;
  try {
    firstCandidate = await generator({ system, prompt });
  } catch (error) {
    return {
      status: "failed",
      request: placeholderSupportActorRequest(input),
      issues: [{
        code: "schema_invalid",
        path: "<generation>",
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }

  const firstValidation = validateSupportActorRequestEffectCandidate({
    frame: input.frame,
    step: input.step,
    candidate: firstCandidate,
  });
  if (firstValidation.status === "accepted") {
    return {
      status: "accepted",
      request: supportActorRequestFromEffect({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        effect: firstValidation.effect,
      }),
      issues: [],
    };
  }

  try {
    const repairCandidate = await generator({
      system,
      prompt: buildStage4SupportActorRepairPrompt({
        frame: input.frame,
        step: input.step,
        candidate: firstCandidate,
        issues: firstValidation.issues,
      }),
      repairOf: {
        candidate: firstCandidate,
        issues: firstValidation.issues,
      },
    });
    const repairValidation = validateSupportActorRequestEffectCandidate({
      frame: input.frame,
      step: input.step,
      candidate: repairCandidate,
    });
    if (repairValidation.status === "accepted") {
      return {
        status: "accepted",
        request: supportActorRequestFromEffect({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          effect: repairValidation.effect,
        }),
        issues: [],
      };
    }
    return {
      status: "failed",
      request: placeholderSupportActorRequest(input),
      issues: [...firstValidation.issues, ...repairValidation.issues],
    };
  } catch (error) {
    return {
      status: "failed",
      request: placeholderSupportActorRequest(input),
      issues: [
        ...firstValidation.issues,
        {
          code: "schema_invalid",
          path: "<repair>",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

function clockLedgerReasonKind(reasonKind: "brief_local_action" | "wait" | "short_rest"): string {
  if (reasonKind === "short_rest") return "rest";
  if (reasonKind === "wait") return "wait";
  return "other_elapsed_time";
}

function executeObserveVisible(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): CleanStage4Receipt {
  const actors = input.frame.actors
    .filter((actor) => actor.role !== "player")
    .map((actor) => actor.label)
    .slice(0, 12);
  const visibleFacts = [
    ...input.frame.scene.visibleFacts.map((fact) => fact.summary),
    ...input.frame.scene.recentLocalFacts.map((fact) => fact.summary),
  ].slice(0, 12);
  const inventory = input.frame.inventory.map((item) => item.label).slice(0, 12);
  const movementOptions = input.frame.movementOptions.map((option) => option.label).slice(0, 32);
  const summary = [
    `Current visible place is ${input.frame.scene.currentScene.label}.`,
    actors.length > 0 ? `Visible actors include ${actors.join(", ")}.` : null,
    movementOptions.length > 0 ? `Visible routes include ${movementOptions.join(", ")}.` : null,
    inventory.length > 0 ? `Inventory includes ${inventory.join(", ")}.` : null,
  ].filter((part): part is string => Boolean(part)).join(" ");
  const receipt = baseReceipt({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    request: input.request,
    status: "accepted",
    capabilityId: "observe_visible",
    summary,
    visibleRefs: ["Player", input.frame.scene.currentScene.ref, ...input.frame.actors.map((actor) => actor.ref)].slice(0, 12),
    visibleObservation: {
      type: "visible_observation",
      currentScene: input.frame.scene.currentScene.label,
      currentLocation: input.frame.scene.currentLocation.label,
      visibleActors: actors,
      visibleFacts,
      inventory,
      movementOptions,
    },
  });
  input.store.insert(receipt);
  return receipt;
}

function executeRouteOptions(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): CleanStage4Receipt {
  const options = input.frame.movementOptions.map((option) => ({
    label: option.label,
    connected: option.connected,
    travelCost: option.travelCost,
  }));
  const summary = options.length > 0
    ? `Visible route options from ${input.frame.scene.currentLocation.label} include ${options.map((option) => option.label).join(", ")}.`
    : `No route options are exposed by the current scene frame for ${input.frame.scene.currentLocation.label}.`;
  const receipt = baseReceipt({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    request: input.request,
    status: "accepted",
    capabilityId: "route_options",
    summary,
    visibleRefs: ["Player", input.frame.scene.currentLocation.ref, ...input.frame.movementOptions.map((option) => option.ref)].slice(0, 12),
    routeOptions: {
      type: "route_options",
      fromLabel: input.frame.scene.currentLocation.label,
      options,
    },
  });
  input.store.insert(receipt);
  return receipt;
}

function executeSceneBeat(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): CleanStage4Receipt {
  const targetLabels = input.step.targetRefs.map((ref) => labelForRef(input.frame, ref)).slice(0, 8);
  const summary = targetLabels.length > 0
    ? `Player's local visible beat is acknowledged in ${input.frame.scene.currentScene.label} with ${targetLabels.join(", ")}.`
    : `Player's local visible beat is acknowledged in ${input.frame.scene.currentScene.label}.`;
  const receipt = baseReceipt({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    request: input.request,
    status: "accepted",
    capabilityId: "scene_beat_record",
    summary,
    visibleRefs: ["Player", input.frame.scene.currentScene.ref, ...input.step.targetRefs].slice(0, 12),
    sceneBeat: {
      type: "scene_beat",
      beatKind: "generic_scene_beat",
      summary,
      targetLabels,
    },
  });
  input.store.insert(receipt);
  return receipt;
}

async function executeDialogueRecord(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  dependencyResolution?: Stage4DialogueDependencyResolution | null;
  provider?: ProviderConfig;
  generateDialogueRequest?: Stage4DialogueRequestGenerator;
  store: CleanStage4ReceiptStore;
}): Promise<CleanStage4Receipt> {
  const builtRequest = await buildDialogueRequest({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    dependencyResolution: input.dependencyResolution,
    provider: input.provider,
    generateDialogueRequest: input.generateDialogueRequest,
  });
  if (builtRequest.status === "failed") {
    const receipt = failReceipt({
      frame: input.frame,
      checklist: input.checklist,
      step: input.step,
      request: builtRequest.request,
      capabilityId: "dialogue_record",
      kind: "invalid_backend_request",
      message: `Stage 4 dialogue request was not accepted: ${builtRequest.issues[0]?.message ?? "invalid dialogue request"}`,
    });
    input.store.insert(receipt);
    return receipt;
  }

  const effect = builtRequest.request.effect;
  if (effect.kind !== "dialogue_record") {
    const receipt = failReceipt({
      frame: input.frame,
      checklist: input.checklist,
      step: input.step,
      request: builtRequest.request,
      capabilityId: "dialogue_record",
      kind: "invalid_backend_request",
      message: "Stage 4 dialogue request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const speaker = input.frame.actors.find((actor) =>
    actor.role !== "player" && normalizedRef(actor.ref) === normalizedRef(effect.speakerRef)
  );
  if (!speaker) {
    const receipt = failReceipt({
      frame: input.frame,
      checklist: input.checklist,
      step: input.step,
      request: builtRequest.request,
      capabilityId: "dialogue_record",
      kind: "insufficient_grounding",
      message: "Stage 4 dialogue speaker is not an already-visible non-player actor.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const addresseeLabels = effect.addresseeRefs.map((ref) => labelForRef(input.frame, ref)).slice(0, 8);
  const dialogue = {
    type: "dialogue_response" as const,
    authorityKind: "existing_visible_actor" as const,
    speakerLabel: speaker.label,
    addresseeLabels,
    outcomeKind: effect.outcomeKind,
    quotedSpeech: effect.response.quotedSpeech,
    summary: effect.response.summary,
    responseLanguage: "match_player_action" as const,
    claimStatus: "visible_speaker_response_only" as const,
  };
  const receipt = baseReceipt({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    request: builtRequest.request,
    status: "accepted",
    capabilityId: "dialogue_record",
    summary: `${speaker.label} dialogue response recorded (${dialogue.outcomeKind}).`,
    visibleRefs: uniqueStrings(["Player", speaker.ref, ...effect.addresseeRefs]).slice(0, 12),
    dialogue,
  });
  input.store.insert(receipt);
  return receipt;
}

function supportActorMaterializationResult(input: {
  effect: SupportActorCreateEffect;
  resultKind: "created" | "reused";
  actorLabel: string;
  roleLabel: string;
  frame: AuthoritativeSceneFrame;
}): SupportActorMaterializationResult {
  return {
    type: "support_actor_materialization",
    resultKind: input.resultKind,
    actorRef: input.actorLabel,
    actorLabel: input.actorLabel,
    roleKind: input.effect.roleKind,
    roleLabel: input.roleLabel,
    anchorSceneLabel: input.frame.scene.currentScene.label,
    anchorLocationLabel: input.frame.scene.currentLocation.label,
    publicSummary: input.effect.publicPresentation.publicSummary,
    visibleCue: input.effect.publicPresentation.visibleCue,
    identityBounds: {
      tier: "temporary",
      persistence: "current_scene",
      significance: "minor_support",
      agency: "reactive_only",
    },
    claimStatus: "visible_support_actor_materialization_only",
  };
}

function supportActorCollisionMessage(): string {
  return "Stage 4 support actor materialization could not be accepted for the current scene.";
}

async function executeSupportActorCreate(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  provider?: ProviderConfig;
  generateSupportActorRequest?: Stage4SupportActorRequestGenerator;
  store: CleanStage4ReceiptStore;
}): Promise<CleanStage4Receipt> {
  const builtRequest = await buildSupportActorRequest({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    provider: input.provider,
    generateSupportActorRequest: input.generateSupportActorRequest,
  });
  if (builtRequest.status === "failed") {
    const receipt = failReceipt({
      frame: input.frame,
      checklist: input.checklist,
      step: input.step,
      request: builtRequest.request,
      capabilityId: "support_actor_create",
      kind: "invalid_backend_request",
      message: `Stage 4 support actor request was not accepted: ${builtRequest.issues[0]?.message ?? "invalid support actor request"}`,
    });
    input.store.insert(receipt);
    return receipt;
  }

  const effect = builtRequest.request.effect;
  if (effect.kind !== "support_actor_create") {
    const receipt = failReceipt({
      frame: input.frame,
      checklist: input.checklist,
      step: input.step,
      request: builtRequest.request,
      capabilityId: "support_actor_create",
      kind: "invalid_backend_request",
      message: "Stage 4 support actor request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  return withSqliteWriteLock("clean-stage4-support-actor-create", () => {
    const db = getSqliteConnection();
    const transaction = db.transaction(() => {
      const player = readPlayer(input.frame);
      const clock = readClock(input.frame.campaignId);
      const current = validateFrameAndClock({ frame: input.frame, player, clock });
      if (!current.ok || !player?.current_location_id || !player.current_scene_location_id) {
        const receipt = failReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          capabilityId: "support_actor_create",
          kind: "stale_frame_or_clock",
          message: current.ok ? "Stage 4 current scene is unavailable for support actor materialization." : current.message,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const currentLocation = locationByLabel(input.frame, input.frame.scene.currentLocation.label);
      const currentScene = locationByLabel(input.frame, input.frame.scene.currentScene.label);
      if (
        !currentLocation
        || !currentScene
        || player.current_location_id !== currentLocation.id
        || player.current_scene_location_id !== currentScene.id
      ) {
        const receipt = failReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          capabilityId: "support_actor_create",
          kind: "stale_frame_or_clock",
          message: "Stage 4 current scene no longer matches the SceneFrame.",
        });
        input.store.insert(receipt);
        return receipt;
      }

      const labels = supportActorLabels(effect.roleKind);
      const actorLabel = labels.actorLabel;
      const roleLabel = labels.roleLabel;
      const normalizedActorLabel = actorLabel.trim().toLowerCase();
      const visibleLabelCollision = [
        input.frame.player.label,
        ...input.frame.actors.map((actor) => actor.label),
      ].some((label) => label.trim().toLowerCase() === normalizedActorLabel);
      if (visibleLabelCollision) {
        const receipt = failReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          capabilityId: "support_actor_create",
          kind: "insufficient_grounding",
          message: supportActorCollisionMessage(),
        });
        input.store.insert(receipt);
        return receipt;
      }

      const candidateRows = db.prepare(`
        SELECT
          id,
          name,
          persona,
          tags,
          derived_tags,
          tier,
          current_location_id,
          current_scene_location_id
        FROM npcs
        WHERE campaign_id = ?
      `).all(input.frame.campaignId) as NpcSupportRow[];
      const sameNameRows = candidateRows.filter((row) => row.name.trim().toLowerCase() === normalizedActorLabel);
      const reusableRows = candidateRows.filter((row) => isReusableSupportActor({
        row,
        roleKind: effect.roleKind,
        currentLocationId: currentLocation.id,
        currentSceneLocationId: currentScene.id,
      }));
      if (sameNameRows.length > 0) {
        const exactNameReusableRows = sameNameRows.filter((row) => isReusableSupportActor({
          row,
          roleKind: effect.roleKind,
          currentLocationId: currentLocation.id,
          currentSceneLocationId: currentScene.id,
        }));
        if (sameNameRows.length === 1 && exactNameReusableRows.length === 1) {
          const reusable = exactNameReusableRows[0];
          const supportActor = supportActorMaterializationResult({
            effect,
            resultKind: "reused",
            actorLabel: reusable.name,
            roleLabel,
            frame: input.frame,
          });
          const receipt = baseReceipt({
            frame: input.frame,
            checklist: input.checklist,
            step: input.step,
            request: builtRequest.request,
            status: "accepted",
            capabilityId: "support_actor_create",
            summary: `${reusable.name} is already available as a ${roleLabel} in ${input.frame.scene.currentScene.label}.`,
            visibleRefs: uniqueStrings(["Player", input.frame.scene.currentScene.ref, reusable.name]).slice(0, 12),
            supportActor,
            supportActorId: reusable.id,
            supportActorOperation: "reused",
            anchorLocationId: currentLocation.id,
            anchorSceneLocationId: currentScene.id,
          });
          input.store.insert(receipt);
          return receipt;
        }

        const receipt = failReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          capabilityId: "support_actor_create",
          kind: "insufficient_grounding",
          message: supportActorCollisionMessage(),
        });
        input.store.insert(receipt);
        return receipt;
      }
      if (reusableRows.length === 1) {
        const reusable = reusableRows[0];
        const supportActor = supportActorMaterializationResult({
          effect,
          resultKind: "reused",
          actorLabel: reusable.name,
          roleLabel,
          frame: input.frame,
        });
        const receipt = baseReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          status: "accepted",
          capabilityId: "support_actor_create",
          summary: `${reusable.name} is already available as a ${roleLabel} in ${input.frame.scene.currentScene.label}.`,
          visibleRefs: uniqueStrings(["Player", input.frame.scene.currentScene.ref, reusable.name]).slice(0, 12),
          supportActor,
          supportActorId: reusable.id,
          supportActorOperation: "reused",
          anchorLocationId: currentLocation.id,
          anchorSceneLocationId: currentScene.id,
        });
        input.store.insert(receipt);
        return receipt;
      }
      if (reusableRows.length > 1) {
        const receipt = failReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          capabilityId: "support_actor_create",
          kind: "insufficient_grounding",
          message: supportActorCollisionMessage(),
        });
        input.store.insert(receipt);
        return receipt;
      }

      const receiptId = `stage4-receipt-${randomUUID()}`;
      const actorId = `stage4-support-actor-${randomUUID()}`;
      const authorityTraceId = `stage4-authority-${randomUUID()}`;
      const resultWorldVersion = clock.world_version + 1;
      const stateDeltaRefs = [`npc:${actorId}:created`, `scene:${currentScene.id}:support_actors`];
      const now = Date.now();
      const tags = [
        "temporary-support",
        "clean-runtime-support",
        `support-role:${effect.roleKind}`,
        "current-scene",
        "minor-support",
        "reactive-only",
      ];
      const characterRecord = {
        identity: {
          id: actorId,
          campaignId: input.frame.campaignId,
          role: "npc",
          tier: "temporary",
          displayName: actorLabel,
          canonicalStatus: "original",
          baseFacts: {
            biography: effect.publicPresentation.publicSummary,
            socialRole: [roleLabel],
            hardConstraints: [
              "Temporary current-scene support actor.",
              "Reactive only; no persistent significance from creation.",
            ],
          },
          behavioralCore: {
            motives: [],
            pressureResponses: [],
            taboos: [],
            attachments: [],
            selfImage: effect.publicPresentation.publicSummary,
          },
          liveDynamics: {
            attachments: [],
            activeGoals: [],
            beliefDrift: [],
            currentStrains: [],
            earnedChanges: [],
          },
          personality: {
            summary: "",
            voice: effect.publicPresentation.voiceHint ?? "",
            decisionStyle: "",
            worldview: "",
            internalContradictions: [],
            personalMythology: "",
            sampleLines: [],
          },
        },
        profile: {
          species: "",
          gender: "",
          ageText: "",
          appearance: effect.publicPresentation.visibleCue ?? "",
          backgroundSummary: "",
          personaSummary: effect.publicPresentation.publicSummary,
        },
        socialContext: {
          factionId: null,
          factionName: null,
          homeLocationId: null,
          homeLocationName: null,
          currentLocationId: currentLocation.id,
          currentLocationName: input.frame.scene.currentLocation.label,
          relationshipRefs: [],
          socialStatus: [roleLabel],
          originMode: "resident",
        },
        motivations: {
          shortTermGoals: [],
          longTermGoals: [],
          beliefs: [],
          drives: [],
          frictions: [],
        },
        capabilities: {
          traits: [],
          skills: [],
          flaws: [],
          specialties: [],
          wealthTier: null,
        },
        state: {
          hp: 1,
          conditions: [],
          statusFlags: [],
          activityState: "active",
        },
        loadout: {
          inventorySeed: [],
          equippedItemRefs: [],
          currencyNotes: "",
          signatureItems: [],
        },
        startConditions: {},
        provenance: {
          sourceKind: "runtime",
          importMode: null,
          templateId: null,
          archetypePrompt: null,
          worldgenOrigin: null,
          legacyTags: tags,
        },
      };
      const update = db.prepare(`
        UPDATE world_clocks
        SET world_version = ?, updated_at = ?
        WHERE campaign_id = ? AND world_version = ? AND world_time_minutes = ?
      `).run(
        resultWorldVersion,
        now,
        input.frame.campaignId,
        clock.world_version,
        clock.world_time_minutes,
      );
      if (update.changes !== 1) {
        const receipt = failReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          capabilityId: "support_actor_create",
          kind: "stale_frame_or_clock",
          message: "Stage 4 support actor materialization found stale world clock state.",
        });
        input.store.insert(receipt);
        return receipt;
      }
      db.prepare(`
        INSERT INTO npcs (
          id,
          campaign_id,
          name,
          persona,
          character_record,
          derived_tags,
          tags,
          tier,
          current_location_id,
          current_scene_location_id,
          goals,
          beliefs,
          unprocessed_importance,
          inactive_ticks,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        actorId,
        input.frame.campaignId,
        actorLabel,
        effect.publicPresentation.publicSummary,
        JSON.stringify(characterRecord),
        JSON.stringify(tags),
        JSON.stringify(tags),
        "temporary",
        currentLocation.id,
        currentScene.id,
        JSON.stringify({ short_term: [], long_term: [] }),
        "[]",
        0,
        0,
        now,
      );
      db.prepare(`
        INSERT INTO authority_traces (
          id,
          campaign_id,
          operation,
          source_entity_type,
          source_entity_id,
          base_world_version,
          result_world_version,
          world_time_minutes,
          elapsed_world_time_minutes,
          tool_result_id,
          event_ids,
          state_delta_refs,
          witnesses,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        authorityTraceId,
        input.frame.campaignId,
        "gameplay-cycle-runtime.support_actor.materialize.v1",
        "npc",
        actorId,
        clock.world_version,
        resultWorldVersion,
        clock.world_time_minutes,
        0,
        receiptId,
        "[]",
        JSON.stringify(stateDeltaRefs),
        JSON.stringify(effect.evidenceRefs),
        JSON.stringify({
          checklistId: input.checklist.checklistId,
          stepId: input.step.stepId,
          capabilityId: "support_actor_create",
          roleKind: effect.roleKind,
          roleLabel,
          anchorScope: "current_scene",
          anchorRef: effect.anchorRef,
          resultKind: "created",
        }),
        now,
      );

      const supportActor = supportActorMaterializationResult({
        effect,
        resultKind: "created",
        actorLabel,
        roleLabel,
        frame: input.frame,
      });
      const receipt = baseReceipt({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        request: builtRequest.request,
        status: "accepted",
        capabilityId: "support_actor_create",
        summary: `${actorLabel} is materialized as a ${roleLabel} in ${input.frame.scene.currentScene.label}.`,
        visibleRefs: uniqueStrings(["Player", input.frame.scene.currentScene.ref, actorLabel]).slice(0, 12),
        supportActor,
        resultWorldVersion,
        mutationApplied: true,
        authorityTraceId,
        playerId: player.id,
        supportActorId: actorId,
        supportActorOperation: "inserted",
        anchorLocationId: currentLocation.id,
        anchorSceneLocationId: currentScene.id,
        stateDeltaRefs,
      });
      const finalReceipt = assertCleanStage4Receipt({ ...receipt, receiptId });
      input.store.insert(finalReceipt);
      return finalReceipt;
    });

    return transaction();
  });
}

async function executeTimeAdvance(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): Promise<CleanStage4Receipt> {
  const effect = input.request.effect;
  if (effect.kind !== "time_advance") {
    const receipt = failReceipt({
      ...input,
      capabilityId: "time_advance",
      kind: "invalid_backend_request",
      message: "Stage 4 time advance request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  return withSqliteWriteLock("clean-stage4-time-advance", () => {
    const db = getSqliteConnection();
    const transaction = db.transaction(() => {
      const player = readPlayer(input.frame);
      const clock = readClock(input.frame.campaignId);
      const current = validateFrameAndClock({ frame: input.frame, player, clock });
      if (!current.ok) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "time_advance",
          kind: "stale_frame_or_clock",
          message: current.message,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const elapsedMinutes = effect.elapsedMinutes;
      const resultWorldVersion = clock.world_version + 1;
      const resultWorldTimeMinutes = clock.world_time_minutes + elapsedMinutes;
      const resultTick = Math.max(clock.current_tick, input.frame.base.tick) + elapsedMinutes;
      const receiptId = `stage4-receipt-${randomUUID()}`;
      const authorityTraceId = `stage4-authority-${randomUUID()}`;
      const clockReceiptId = `stage4-clock-${randomUUID()}`;
      const stateDeltaRefs = [`world_clock:${receiptId}`];
      const update = db.prepare(`
        UPDATE world_clocks
        SET world_version = ?, world_time_minutes = ?, current_tick = ?, updated_at = ?
        WHERE campaign_id = ? AND world_version = ? AND world_time_minutes = ?
      `).run(
        resultWorldVersion,
        resultWorldTimeMinutes,
        resultTick,
        Date.now(),
        input.frame.campaignId,
        clock.world_version,
        clock.world_time_minutes,
      );
      if (update.changes !== 1) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "time_advance",
          kind: "stale_frame_or_clock",
          message: "Stage 4 time advance clock update found stale world clock state.",
        });
        input.store.insert(receipt);
        return receipt;
      }
      db.prepare(`
        INSERT INTO authority_traces (
          id,
          campaign_id,
          operation,
          source_entity_type,
          source_entity_id,
          base_world_version,
          result_world_version,
          world_time_minutes,
          elapsed_world_time_minutes,
          tool_result_id,
          event_ids,
          state_delta_refs,
          witnesses,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        authorityTraceId,
        input.frame.campaignId,
        "gameplay-cycle-runtime.clock.advance.v1",
        "clean_stage4_receipt",
        receiptId,
        clock.world_version,
        resultWorldVersion,
        resultWorldTimeMinutes,
        elapsedMinutes,
        receiptId,
        "[]",
        JSON.stringify(stateDeltaRefs),
        JSON.stringify(["Player", input.frame.scene.currentScene.ref]),
        JSON.stringify({
          checklistId: input.checklist.checklistId,
          stepId: input.step.stepId,
          sceneRef: input.frame.scene.currentScene.ref,
          reasonKind: effect.reasonKind,
        }),
        Date.now(),
      );
      db.prepare(`
        INSERT INTO turn_clock_ledger (
          clock_receipt_id,
          campaign_id,
          turn_id,
          ui_turn_ordinal,
          base_world_version,
          result_world_version,
          delta_minutes,
          reason_kind,
          source_receipt_ref,
          result_world_time_minutes,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        clockReceiptId,
        input.frame.campaignId,
        input.frame.turnId,
        input.frame.base.tick,
        clock.world_version,
        resultWorldVersion,
        elapsedMinutes,
        clockLedgerReasonKind(effect.reasonKind),
        receiptId,
        resultWorldTimeMinutes,
        Date.now(),
      );

      const receipt = baseReceipt({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        request: input.request,
        status: "accepted",
        capabilityId: "time_advance",
        summary: `${elapsedMinutes} minute(s) pass in ${input.frame.scene.currentScene.label}.`,
        visibleRefs: ["Player", input.frame.scene.currentScene.ref],
        timeAdvance: {
          type: "time_advance",
          elapsedMinutes,
          reasonKind: effect.reasonKind,
        },
        resultTick,
        resultWorldVersion,
        resultWorldTimeMinutes,
        mutationApplied: true,
        authorityTraceId,
        clockReceiptId,
        playerId: player?.id ?? null,
        stateDeltaRefs,
      });
      const finalReceipt = assertCleanStage4Receipt({ ...receipt, receiptId });
      input.store.insert(finalReceipt);
      return finalReceipt;
    });

    return transaction();
  });
}

function executeRouteCheck(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): CleanStage4Receipt {
  const effect = input.request.effect;
  if (effect.kind !== "route_check") {
    const receipt = failReceipt({
      ...input,
      capabilityId: "route_check",
      kind: "invalid_backend_request",
      message: "Stage 4 route check request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  const option = destinationOption(input.frame, effect.destinationRef);
  if (!option) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "route_check",
      kind: "missing_or_ambiguous_destination",
      message: "Stage 4 route check destination is not in the SceneFrame movement options.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  const player = readPlayer(input.frame);
  const clock = readClock(input.frame.campaignId);
  const current = validateFrameAndClock({ frame: input.frame, player, clock });
  if (!current.ok) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "route_check",
      kind: "stale_frame_or_clock",
      message: current.message,
    });
    input.store.insert(receipt);
    return receipt;
  }

  const graph = loadLocationGraph({ campaignId: input.frame.campaignId });
  const destination = locationByLabel(input.frame, option.label);
  if (!player || !destination || !player.current_location_id) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "route_check",
      kind: "missing_or_ambiguous_destination",
      message: "Stage 4 route destination could not be resolved uniquely.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  const path = resolveTravelPath({
    campaignId: input.frame.campaignId,
    fromLocationId: player.current_location_id,
    toLocationId: destination.id,
    edges: graph.edges,
    locations: graph.locations,
    currentTick: input.frame.base.tick,
  });
  const connected = path !== null;
  const receipt = baseReceipt({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    request: input.request,
    status: "accepted",
    capabilityId: "route_check",
    summary: connected
      ? `${option.label} is reachable from the current scene.`
      : `${option.label} is not currently reachable from the current scene.`,
    visibleRefs: ["Player", option.ref],
    routeStatus: connected ? "connected" : "disconnected",
    playerId: player.id,
    fromLocationId: player.current_location_id,
    destinationLocationId: destination.id,
    edgeIds: path?.edgeIds ?? [],
  });
  input.store.insert(receipt);
  return receipt;
}

async function executeMovement(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  priorReceipts: readonly CleanStage4Receipt[];
  store: CleanStage4ReceiptStore;
}): Promise<CleanStage4Receipt> {
  const effect = input.request.effect;
  if (effect.kind !== "movement") {
    const receipt = failReceipt({
      ...input,
      capabilityId: "movement",
      kind: "invalid_backend_request",
      message: "Stage 4 movement request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  const option = destinationOption(input.frame, effect.destinationRef);
  if (!option) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "movement",
      kind: "missing_or_ambiguous_destination",
      message: "Stage 4 movement destination is not in the SceneFrame movement options.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  const dependencyIds = new Set(input.step.dependsOnStepIds);
  const dependencies = input.priorReceipts.filter((receipt) => dependencyIds.has(receipt.stepId));
  if (dependencyIds.size > 0) {
    const connectedRoute = dependencies.some((receipt) =>
      receipt.status === "accepted"
      && receipt.capabilityId === "route_check"
      && receipt.publicResult.routeStatus === "connected"
      && receipt.privateResult.destinationLocationId !== null
    );
    if (!connectedRoute) {
      const receipt = skipReceipt({
        ...input,
        capabilityId: "movement",
        kind: "dependency_not_accepted",
        message: "Stage 4 movement skipped because required route evidence was not accepted.",
      });
      input.store.insert(receipt);
      return receipt;
    }
  } else if (!option.connected) {
    const receipt = skipReceipt({
      ...input,
      capabilityId: "movement",
      kind: "route_disconnected",
      message: `${option.label} is not currently reachable from the current scene.`,
    });
    input.store.insert(receipt);
    return receipt;
  }

  return withSqliteWriteLock("clean-stage4-movement", () => {
    const db = getSqliteConnection();
    const transaction = db.transaction(() => {
      const player = readPlayer(input.frame);
      const clock = readClock(input.frame.campaignId);
      const current = validateFrameAndClock({ frame: input.frame, player, clock });
      if (!current.ok || !player?.current_location_id) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "movement",
          kind: "stale_frame_or_clock",
          message: current.ok ? "Stage 4 player location is unavailable." : current.message,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const graph = loadLocationGraph({ campaignId: input.frame.campaignId });
      const destination = locationByLabel(input.frame, option.label);
      if (!destination) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "movement",
          kind: "missing_or_ambiguous_destination",
          message: "Stage 4 movement destination could not be resolved uniquely.",
        });
        input.store.insert(receipt);
        return receipt;
      }

      const path = resolveTravelPath({
        campaignId: input.frame.campaignId,
        fromLocationId: player.current_location_id,
        toLocationId: destination.id,
        edges: graph.edges,
        locations: graph.locations,
        currentTick: input.frame.base.tick,
      });
      if (!path) {
        const receipt = skipReceipt({
          ...input,
          capabilityId: "movement",
          kind: "route_disconnected",
          message: `${option.label} is not currently reachable from the current scene.`,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const resultWorldVersion = clock.world_version + 1;
      const resultWorldTimeMinutes = clock.world_time_minutes + path.totalTravelCost;
      const resultTick = Math.max(clock.current_tick, input.frame.base.tick) + path.totalTravelCost;
      const receiptId = `stage4-receipt-${randomUUID()}`;
      const authorityTraceId = `stage4-authority-${randomUUID()}`;
      const clockReceiptId = `stage4-clock-${randomUUID()}`;
      const stateDeltaRefs = [`player_location:${receiptId}`];
      const storedRecord = hydrateStoredPlayerRecord({
        id: player.id,
        campaignId: player.campaign_id,
        name: player.name,
        race: player.race,
        gender: player.gender,
        age: player.age,
        appearance: player.appearance,
        hp: player.hp,
        characterRecord: player.character_record,
        derivedTags: player.derived_tags,
        tags: player.tags,
        equippedItems: player.equipped_items,
        currentLocationId: destination.id,
      });
      const projected: PlayerRecordProjection = projectPlayerRecord({
        ...storedRecord,
        socialContext: {
          ...storedRecord.socialContext,
          currentLocationId: destination.id,
          currentLocationName: destination.name,
        },
      });

      db.prepare(`
        UPDATE players
        SET
          current_location_id = ?,
          current_scene_location_id = ?,
          character_record = ?,
          derived_tags = ?,
          tags = ?,
          equipped_items = ?
        WHERE id = ? AND campaign_id = ?
      `).run(
        destination.id,
        destination.id,
        projected.characterRecord,
        projected.derivedTags,
        projected.tags,
        projected.equippedItems,
        player.id,
        input.frame.campaignId,
      );
      db.prepare(`
        UPDATE world_clocks
        SET world_version = ?, world_time_minutes = ?, current_tick = ?, updated_at = ?
        WHERE campaign_id = ?
      `).run(
        resultWorldVersion,
        resultWorldTimeMinutes,
        resultTick,
        Date.now(),
        input.frame.campaignId,
      );
      db.prepare(`
        INSERT INTO authority_traces (
          id,
          campaign_id,
          operation,
          source_entity_type,
          source_entity_id,
          base_world_version,
          result_world_version,
          world_time_minutes,
          elapsed_world_time_minutes,
          tool_result_id,
          event_ids,
          state_delta_refs,
          witnesses,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        authorityTraceId,
        input.frame.campaignId,
        "gameplay-cycle-runtime.player.move.v1",
        "clean_stage4_receipt",
        receiptId,
        clock.world_version,
        resultWorldVersion,
        resultWorldTimeMinutes,
        path.totalTravelCost,
        receiptId,
        "[]",
        JSON.stringify(stateDeltaRefs),
        JSON.stringify(["Player", option.ref]),
        JSON.stringify({
          checklistId: input.checklist.checklistId,
          stepId: input.step.stepId,
          destinationRef: option.ref,
        }),
        Date.now(),
      );
      db.prepare(`
        INSERT INTO turn_clock_ledger (
          clock_receipt_id,
          campaign_id,
          turn_id,
          ui_turn_ordinal,
          base_world_version,
          result_world_version,
          delta_minutes,
          reason_kind,
          source_receipt_ref,
          result_world_time_minutes,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        clockReceiptId,
        input.frame.campaignId,
        input.frame.turnId,
        input.frame.base.tick,
        clock.world_version,
        resultWorldVersion,
        path.totalTravelCost,
        "travel",
        receiptId,
        resultWorldTimeMinutes,
        Date.now(),
      );

      const receipt = baseReceipt({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        request: input.request,
        status: "accepted",
        capabilityId: "movement",
        summary: `You move to ${option.label}.`,
        visibleRefs: ["Player", option.ref],
        locationChange: {
          type: "location_change",
          locationName: option.label,
          travelCost: path.totalTravelCost,
          path: publicPathLabels(path.locationIds, graph.locations),
        },
        resultTick,
        resultWorldVersion,
        resultWorldTimeMinutes,
        mutationApplied: true,
        authorityTraceId,
        clockReceiptId,
        playerId: player.id,
        fromLocationId: player.current_location_id,
        destinationLocationId: destination.id,
        edgeIds: path.edgeIds,
        stateDeltaRefs,
      });
      const finalReceipt = assertCleanStage4Receipt({ ...receipt, receiptId });
      input.store.insert(finalReceipt);
      return finalReceipt;
    });

    return transaction();
  });
}

function branchEligible(frame: AuthoritativeSceneFrame, checklist: GmActionChecklist): boolean {
  return checklist.version === "gm-action-checklist.v1"
    && checklist.campaignId === frame.campaignId
    && checklist.turnId === frame.turnId
    && checklist.frameId === frame.frameId
    && checklist.source.judgeNextStep === "action_plan"
    && checklist.source.judgeCheckNeed === "backend_action_plan_needed";
}

function materializedSpeakerBinding(step: Step): MaterializedSpeakerBinding | null {
  return (step.dependencyBindings ?? []).find((binding) =>
    binding.bindingId === "materialized_speaker"
    && binding.requiredCapabilityId === "support_actor_create"
    && binding.requiredReceiptAuthority === "support_actor_materialization_receipt"
    && binding.sourcePath === "publicResult.supportActor.actorRef"
    && binding.resolveIn === "post_dependency_scene_frame"
    && binding.requiredFramePresence === "actors_and_citableRefs"
  ) ?? null;
}

function refreshedActorForMaterializedSpeaker(input: {
  frame: AuthoritativeSceneFrame;
  actorRef: string;
}): AuthoritativeSceneFrame["actors"][number] | null {
  const citable = new Set(input.frame.citableRefs.map(normalizedRef));
  if (!citable.has(normalizedRef(input.actorRef))) return null;
  const matches = input.frame.actors.filter((actor) =>
    actor.role !== "player"
    && normalizedRef(actor.ref) === normalizedRef(input.actorRef)
  );
  return matches.length === 1 ? matches[0] : null;
}

async function resolveDialogueDependencies(input: {
  initialFrame: AuthoritativeSceneFrame;
  currentFrame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  receipts: readonly CleanStage4Receipt[];
  refreshFrameAfterReceipt?: Stage4FrameRefresh;
}): Promise<{
  status: "ready";
  frame: AuthoritativeSceneFrame;
  resolution: Stage4DialogueDependencyResolution | null;
  refreshed: boolean;
  afterReceiptId: string | null;
} | {
  status: "skip";
  receipt: CleanStage4Receipt;
}> {
  const binding = materializedSpeakerBinding(input.step);
  if (!binding) {
    return {
      status: "ready",
      frame: input.currentFrame,
      resolution: null,
      refreshed: false,
      afterReceiptId: null,
    };
  }

  const placeholderRequest = () => placeholderDialogueRequest({
    frame: input.currentFrame,
    checklist: input.checklist,
    step: input.step,
  });
  const skipDependency = (message: string): { status: "skip"; receipt: CleanStage4Receipt } => ({
    status: "skip",
    receipt: skipReceipt({
      frame: input.currentFrame,
      checklist: input.checklist,
      step: input.step,
      request: placeholderRequest(),
      capabilityId: "dialogue_record",
      kind: "dependency_not_accepted",
      message,
    }),
  });

  const sourceReceipt = input.receipts.find((receipt) =>
    receipt.stepId === binding.fromStepId
    && receipt.capabilityId === "support_actor_create"
  );
  if (
    !sourceReceipt
    || sourceReceipt.status !== "accepted"
    || sourceReceipt.authority.evidenceAuthority !== "support_actor_materialization_receipt"
    || !sourceReceipt.publicResult.supportActor
  ) {
    return skipDependency("Dependent dialogue was skipped because support actor materialization was not accepted.");
  }

  const actorRef = sourceReceipt.publicResult.supportActor.actorRef;
  if (!input.refreshFrameAfterReceipt) {
    return skipDependency("Dependent dialogue was skipped because no post-dependency SceneFrame refresh was available.");
  }

  let refreshedFrame: AuthoritativeSceneFrame;
  try {
    refreshedFrame = await input.refreshFrameAfterReceipt({
      initialFrame: input.initialFrame,
      currentFrame: input.currentFrame,
      checklist: input.checklist,
      step: input.step,
      receipt: sourceReceipt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return skipDependency(`Dependent dialogue was skipped because post-dependency SceneFrame refresh failed: ${message}`);
  }

  const actor = refreshedActorForMaterializedSpeaker({
    frame: refreshedFrame,
    actorRef,
  });
  if (!actor) {
    return {
      status: "skip",
      receipt: skipReceipt({
        frame: refreshedFrame,
        checklist: input.checklist,
        step: input.step,
        request: placeholderDialogueRequest({
          frame: refreshedFrame,
          checklist: input.checklist,
          step: input.step,
        }),
        capabilityId: "dialogue_record",
        kind: "dependency_not_accepted",
        message: "Dependent dialogue was skipped because the materialized support actor was not present in the refreshed SceneFrame actors and citableRefs.",
      }),
    };
  }

  return {
    status: "ready",
    frame: refreshedFrame,
    refreshed: true,
    afterReceiptId: sourceReceipt.receiptId,
    resolution: {
      materializedSpeaker: {
        bindingId: "materialized_speaker",
        fromStepId: binding.fromStepId,
        receiptId: sourceReceipt.receiptId,
        actorRef: actor.ref,
        actorLabel: actor.label,
        refreshedFrameId: refreshedFrame.frameId,
      },
    },
  };
}

export async function runCleanStage4Execution(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  dialogueProvider?: ProviderConfig;
  generateDialogueRequest?: Stage4DialogueRequestGenerator;
  supportActorProvider?: ProviderConfig;
  generateSupportActorRequest?: Stage4SupportActorRequestGenerator;
  refreshFrameAfterReceipt?: Stage4FrameRefresh;
  store?: CleanStage4ReceiptStore;
}): Promise<CleanStage4ExecutionRunResult> {
  if (!branchEligible(input.frame, input.checklist)) {
    return { status: "skipped", execution: null, publicEvents: [] };
  }
  const store = input.store ?? sqliteCleanStage4ReceiptStore;
  const receipts: CleanStage4Receipt[] = [];
  const initialFrame = input.frame;
  let currentFrame = input.frame;
  const frameChain: NonNullable<CleanStage4ExecutionResult["frameChain"]> = [{
    frameId: initialFrame.frameId,
    base: initialFrame.base,
    source: "initial",
    afterReceiptId: null,
  }];

  for (const step of input.checklist.steps) {
    if (step.disposition.kind !== "stage4_backend_resolution_required") {
      const request = requestForStep({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        requiredRouteReceiptId: null,
      });
      const receipt = skipReceipt({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        request,
        capabilityId: cleanStage4CapabilityForKind(step.intended.kind),
        kind: "unsupported_clean_stage4_capability",
        message: "Stage 4 step is not marked for backend resolution.",
      });
      store.insert(receipt);
      receipts.push(receipt);
      continue;
    }
    const implementedKinds: Array<Step["intended"]["kind"]> = [
      "observe_visible",
      "route_options",
      "route_check",
      "movement",
      "dialogue_record",
      "support_actor_create",
      "time_advance",
      "scene_beat_record",
    ];
    if (!implementedKinds.includes(step.intended.kind)) {
      const request = assertCleanStage4Request({
        version: "gameplay-runtime.stage4-request.v1",
        requestId: `stage4-request-${randomUUID()}`,
        campaignId: currentFrame.campaignId,
        turnId: currentFrame.turnId,
        frameId: currentFrame.frameId,
        checklistId: input.checklist.checklistId,
        stepId: step.stepId,
        source: {
          sceneFrameVersion: "scene-frame.v1",
          gmReadVersion: "gm-read.v1",
          judgeVersion: "judge-uncertainty.v1",
          checklistVersion: "gm-action-checklist.v1",
          checklistId: input.checklist.checklistId,
          checklistStepId: step.stepId,
        },
        base: currentFrame.base,
        author: "backend_from_checklist",
        modelAuthored: false,
        capabilityId: "scene_beat_record",
        effect: {
          kind: "scene_beat_record",
          actorRef: "Player",
          sceneRef: currentFrame.scene.currentScene.ref,
          targetRefs: step.targetRefs,
          beatKind: "generic_scene_beat",
          evidenceRefs: step.evidenceRefs,
        },
      });
      const receipt = skipReceipt({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        request,
        capabilityId: "scene_beat_record",
        kind: "unsupported_clean_stage4_capability",
        message: "This Stage 4 capability is not implemented in the clean P64 executor.",
      });
      store.insert(receipt);
      receipts.push(receipt);
      continue;
    }

    if (step.intended.kind === "dialogue_record") {
      const dependency = await resolveDialogueDependencies({
        initialFrame,
        currentFrame,
        checklist: input.checklist,
        step,
        receipts,
        refreshFrameAfterReceipt: input.refreshFrameAfterReceipt,
      });
      if (dependency.status === "skip") {
        store.insert(dependency.receipt);
        receipts.push(dependency.receipt);
        continue;
      }
      if (dependency.refreshed) {
        currentFrame = dependency.frame;
        frameChain.push({
          frameId: currentFrame.frameId,
          base: currentFrame.base,
          source: "post_dependency_scene_frame",
          afterReceiptId: dependency.afterReceiptId,
        });
      }
      const receipt = await executeDialogueRecord({
        frame: dependency.frame,
        checklist: input.checklist,
        step,
        dependencyResolution: dependency.resolution,
        provider: input.dialogueProvider,
        generateDialogueRequest: input.generateDialogueRequest,
        store,
      });
      receipts.push(receipt);
      continue;
    }

    if (step.intended.kind === "support_actor_create") {
      const receipt = await executeSupportActorCreate({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        provider: input.supportActorProvider,
        generateSupportActorRequest: input.generateSupportActorRequest,
        store,
      });
      receipts.push(receipt);
      continue;
    }

    const routeDependency = receipts.find((receipt) =>
      step.dependsOnStepIds.includes(receipt.stepId)
      && receipt.capabilityId === "route_check"
      && receipt.status === "accepted"
    );
    const request = requestForStep({
      frame: currentFrame,
      checklist: input.checklist,
      step,
      requiredRouteReceiptId: routeDependency?.receiptId ?? null,
    });
    let receipt: CleanStage4Receipt;
    if (step.intended.kind === "observe_visible") {
      receipt = executeObserveVisible({ frame: currentFrame, checklist: input.checklist, step, request, store });
    } else if (step.intended.kind === "route_options") {
      receipt = executeRouteOptions({ frame: currentFrame, checklist: input.checklist, step, request, store });
    } else if (step.intended.kind === "route_check") {
      receipt = executeRouteCheck({ frame: currentFrame, checklist: input.checklist, step, request, store });
    } else if (step.intended.kind === "movement") {
      receipt = await executeMovement({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        request,
        priorReceipts: receipts,
        store,
      });
    } else if (step.intended.kind === "time_advance") {
      receipt = await executeTimeAdvance({ frame: currentFrame, checklist: input.checklist, step, request, store });
    } else {
      receipt = executeSceneBeat({ frame: currentFrame, checklist: input.checklist, step, request, store });
    }
    receipts.push(receipt);
  }

  const acceptedReceiptIds = receipts
    .filter((receipt) => receipt.status === "accepted")
    .map((receipt) => receipt.receiptId);
  const skippedStepIds = receipts
    .filter((receipt) => receipt.status === "skipped")
    .map((receipt) => receipt.stepId);
  const failedStepIds = receipts
    .filter((receipt) => receipt.status === "failed")
    .map((receipt) => receipt.stepId);
  const mutationApplied = receipts.some((receipt) => receipt.result.mutationApplied);
  const resultWorldVersion = Math.max(...receipts.map((receipt) => receipt.result.worldVersion), input.frame.base.worldVersion);
  const visibleResults = receipts
    .filter((receipt) => receipt.status === "accepted" || receipt.status === "failed")
    .map((receipt) => ({
      receiptId: receipt.receiptId,
      authority: receipt.authority.evidenceAuthority,
      summary: receipt.publicResult.summary,
      visibleRefs: receipt.publicResult.visibleRefs,
      locationChange: receipt.publicResult.locationChange,
      timeAdvance: receipt.publicResult.timeAdvance,
      dialogue: receipt.publicResult.dialogue,
      supportActor: receipt.publicResult.supportActor,
    }));
  const execution = assertCleanStage4ExecutionResult({
    version: "gameplay-runtime.stage4-execution-result.v1",
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    base: input.frame.base,
    receipts,
    acceptedReceiptIds,
    skippedStepIds,
    failedStepIds,
    mutationApplied,
    resultWorldVersion,
    frameChain,
    visibleResults,
  });
  const publicEvents: Stage4ExecutionEvent[] = [];
  for (const result of visibleResults) {
    if (result.locationChange) {
      publicEvents.push({ type: "state_update", data: result.locationChange });
    }
    if (result.timeAdvance) {
      publicEvents.push({ type: "state_update", data: result.timeAdvance });
    }
  }
  return {
    status: "executed",
    execution,
    publicEvents,
  };
}
