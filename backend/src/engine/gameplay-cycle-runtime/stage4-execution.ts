import { randomUUID } from "node:crypto";

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
  assertCleanStage4Receipt,
  assertCleanStage4Request,
  type AuthoritativeSceneFrame,
  type CleanStage4ExecutionResult,
  type CleanStage4Receipt,
  type CleanStage4Request,
  type GmActionChecklist,
} from "./contracts.js";

type Step = GmActionChecklist["steps"][number];

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
  resultWorldVersion?: number;
  resultWorldTimeMinutes?: number;
  resultTick?: number;
  mutationApplied?: boolean;
  authorityTraceId?: string | null;
  clockReceiptId?: string | null;
  playerId?: string | null;
  fromLocationId?: string | null;
  destinationLocationId?: string | null;
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
                  : input.status === "skipped"
                    ? "skip_receipt"
                    : "failure_receipt",
      mutationAuthority: movementAccepted
        ? "player_location_and_world_clock"
        : timeAccepted
          ? "world_clock_only"
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
                  : input.status === "failed"
                    ? "failure_only"
                    : "none",
      maySupportNarrationClaim: accepted,
      mayAuthorizeMutation: movementAccepted || timeAccepted,
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
    },
    privateResult: {
      playerId: input.playerId ?? null,
      fromLocationId: input.fromLocationId ?? null,
      destinationLocationId: input.destinationLocationId ?? null,
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

export async function runCleanStage4Execution(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  store?: CleanStage4ReceiptStore;
}): Promise<CleanStage4ExecutionRunResult> {
  if (!branchEligible(input.frame, input.checklist)) {
    return { status: "skipped", execution: null, publicEvents: [] };
  }
  const store = input.store ?? sqliteCleanStage4ReceiptStore;
  const receipts: CleanStage4Receipt[] = [];

  for (const step of input.checklist.steps) {
    if (step.disposition.kind !== "stage4_backend_resolution_required") {
      const request = requestForStep({
        frame: input.frame,
        checklist: input.checklist,
        step,
        requiredRouteReceiptId: null,
      });
      const receipt = skipReceipt({
        frame: input.frame,
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
      "time_advance",
      "scene_beat_record",
    ];
    if (!implementedKinds.includes(step.intended.kind)) {
      const request = assertCleanStage4Request({
        version: "gameplay-runtime.stage4-request.v1",
        requestId: `stage4-request-${randomUUID()}`,
        campaignId: input.frame.campaignId,
        turnId: input.frame.turnId,
        frameId: input.frame.frameId,
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
        base: input.frame.base,
        author: "backend_from_checklist",
        modelAuthored: false,
        capabilityId: "scene_beat_record",
        effect: {
          kind: "scene_beat_record",
          actorRef: "Player",
          sceneRef: input.frame.scene.currentScene.ref,
          targetRefs: step.targetRefs,
          beatKind: "generic_scene_beat",
          evidenceRefs: step.evidenceRefs,
        },
      });
      const receipt = skipReceipt({
        frame: input.frame,
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

    const routeDependency = receipts.find((receipt) =>
      step.dependsOnStepIds.includes(receipt.stepId)
      && receipt.capabilityId === "route_check"
      && receipt.status === "accepted"
    );
    const request = requestForStep({
      frame: input.frame,
      checklist: input.checklist,
      step,
      requiredRouteReceiptId: routeDependency?.receiptId ?? null,
    });
    let receipt: CleanStage4Receipt;
    if (step.intended.kind === "observe_visible") {
      receipt = executeObserveVisible({ frame: input.frame, checklist: input.checklist, step, request, store });
    } else if (step.intended.kind === "route_options") {
      receipt = executeRouteOptions({ frame: input.frame, checklist: input.checklist, step, request, store });
    } else if (step.intended.kind === "route_check") {
      receipt = executeRouteCheck({ frame: input.frame, checklist: input.checklist, step, request, store });
    } else if (step.intended.kind === "movement") {
      receipt = await executeMovement({
        frame: input.frame,
        checklist: input.checklist,
        step,
        request,
        priorReceipts: receipts,
        store,
      });
    } else if (step.intended.kind === "time_advance") {
      receipt = await executeTimeAdvance({ frame: input.frame, checklist: input.checklist, step, request, store });
    } else {
      receipt = executeSceneBeat({ frame: input.frame, checklist: input.checklist, step, request, store });
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
