import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Phase94RouteId } from "../../backend/src/engine/phase-94-trace-assertions.js";

export interface Phase94SseEvent {
  routeId: Phase94RouteId;
  turnIndex: number;
  eventType: string;
  data: unknown;
  raw: string;
}

export interface Phase94WorldSnapshot {
  hash: string;
  worldVersion: number | null;
  worldTimeMinutes: number | null;
  currentTick: number | null;
  locationId: string | null;
  raw: unknown;
}

export interface Phase94DoneBoundary {
  tick: number | null;
  worldVersion: number | null;
  worldTimeMinutes: number | null;
}

export interface Phase94CollectedTurn {
  routeId: Phase94RouteId;
  campaignId: string;
  turnIndex: number;
  action: string;
  terminalEvent: "done" | "recoverable_error" | "failed";
  assistantText: string;
  rawSseSha256: string;
  rawSseArtifactId: string;
  fullTurnArtifactId: string;
  traceArtifactId: string;
  worldBefore: Phase94WorldSnapshot;
  worldAfter: Phase94WorldSnapshot;
  screenshotPath: string | null;
  sseEvents: Phase94SseEvent[];
  doneBoundary: Phase94DoneBoundary | null;
  hardFailures: string[];
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function appendJsonl(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

function hashUnknown(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = asString(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseEventData(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function parseSseStream(input: {
  routeId: Phase94RouteId;
  turnIndex: number;
  raw: string;
}): Phase94SseEvent[] {
  const events: Phase94SseEvent[] = [];
  let currentEvent = "message";
  let currentData = "";
  const lines = input.raw.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentEvent = line.substring("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      currentData = currentData
        ? `${currentData}\n${line.substring("data:".length).trim()}`
        : line.substring("data:".length).trim();
      continue;
    }
    if (line.trim().length === 0 && (currentData || currentEvent !== "message")) {
      events.push({
        routeId: input.routeId,
        turnIndex: input.turnIndex,
        eventType: currentEvent,
        data: parseEventData(currentData),
        raw: `event: ${currentEvent}\ndata: ${currentData}`,
      });
      currentEvent = "message";
      currentData = "";
    }
  }
  if (currentData || currentEvent !== "message") {
    events.push({
      routeId: input.routeId,
      turnIndex: input.turnIndex,
      eventType: currentEvent,
      data: parseEventData(currentData),
      raw: `event: ${currentEvent}\ndata: ${currentData}`,
    });
  }
  return events;
}

export function assistantTextFromEvents(events: readonly Phase94SseEvent[]): string {
  let text = "";
  for (const event of events) {
    if (
      event.eventType !== "text-delta"
      && event.eventType !== "delta"
      && event.eventType !== "narrative"
    ) continue;
    if (typeof event.data === "string") {
      text += event.data;
    } else if (
      event.data
      && typeof event.data === "object"
      && "delta" in event.data
      && typeof event.data.delta === "string"
    ) {
      text += event.data.delta;
    } else if (
      event.data
      && typeof event.data === "object"
      && "text" in event.data
      && typeof event.data.text === "string"
    ) {
      text += event.data.text;
    }
  }
  return text;
}

export function terminalEventFromEvents(events: readonly Phase94SseEvent[]): "done" | "recoverable_error" | "failed" {
  if (events.some((event) => event.eventType === "done")) return "done";
  if (events.some((event) => event.eventType === "error")) return "recoverable_error";
  return "failed";
}

function doneBoundaryFromEvents(events: readonly Phase94SseEvent[]): Phase94DoneBoundary | null {
  const done = [...events].reverse().find((event) => event.eventType === "done");
  if (!done || !isRecord(done.data)) return null;
  return {
    tick: asNumber(done.data.tick),
    worldVersion: asNumber(done.data.worldVersion),
    worldTimeMinutes: asNumber(done.data.worldTimeMinutes),
  };
}

function readExistingJsonlRows(filePath: string): unknown[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

export function completedTurnCount(routeRoot: string): number {
  return readExistingJsonlRows(join(routeRoot, "turns.jsonl")).length;
}

export async function fetchWorldSnapshot(input: {
  backendUrl: string;
  campaignId: string;
}): Promise<Phase94WorldSnapshot> {
  const response = await fetch(`${input.backendUrl}/api/campaigns/${input.campaignId}/world`);
  const raw = response.ok ? await response.json() as unknown : { error: await response.text(), status: response.status };
  const record = isRecord(raw) ? raw : {};
  const state = isRecord(record.state) ? record.state : record;
  const worldClock = isRecord(record.worldClock)
    ? record.worldClock
    : isRecord(state.worldClock)
      ? state.worldClock
      : {};
  const player = isRecord(record.player)
    ? record.player
    : isRecord(state.player)
      ? state.player
      : {};
  const currentScene = isRecord(record.currentScene)
    ? record.currentScene
    : isRecord(state.currentScene)
      ? state.currentScene
      : {};
  const worldVersion = firstNumber(worldClock.worldVersion, state.worldVersion, record.worldVersion);
  const worldTimeMinutes = firstNumber(
    worldClock.worldTimeMinutes,
    state.worldTimeMinutes,
    record.worldTimeMinutes,
  );
  const currentTick = firstNumber(
    worldClock.currentTick,
    state.currentTick,
    state.tick,
    record.currentTick,
    record.tick,
  );
  const locationId = firstString(
    state.currentLocationId,
    player.currentSceneLocationId,
    player.currentLocationId,
    currentScene.id,
    currentScene.broadLocationId,
  );
  return {
    hash: hashUnknown(raw),
    worldVersion,
    worldTimeMinutes,
    currentTick,
    locationId,
    raw,
  };
}

export function writeCollectedTurn(input: {
  routeRoot: string;
  turn: Phase94CollectedTurn;
}): void {
  const rawSsePath = join(input.routeRoot, "sse-events.jsonl");
  for (const event of input.turn.sseEvents) {
    appendJsonl(rawSsePath, event);
  }

  appendJsonl(join(input.routeRoot, "turns.jsonl"), {
    routeId: input.turn.routeId,
    campaignId: input.turn.campaignId,
    turnIndex: input.turn.turnIndex,
    action: input.turn.action,
    terminalEvent: input.turn.terminalEvent,
    assistantTextLength: input.turn.assistantText.length,
    rawSseArtifactId: input.turn.rawSseArtifactId,
    fullTurnArtifactId: input.turn.fullTurnArtifactId,
    traceArtifactId: input.turn.traceArtifactId,
    screenshotPath: input.turn.screenshotPath,
    doneBoundary: input.turn.doneBoundary,
    hardFailures: input.turn.hardFailures,
  });

  appendJsonl(join(input.routeRoot, "turn-artifacts.jsonl"), {
    ...input.turn,
    sseEvents: undefined,
  });
  appendJsonl(join(input.routeRoot, "trace.jsonl"), {
    routeId: input.turn.routeId,
    turnIndex: input.turn.turnIndex,
    terminalEvent: input.turn.terminalEvent,
    stageEvents: input.turn.sseEvents.filter((event) => event.eventType === "scene-settling" || event.eventType === "finalizing_turn"),
    doneBoundary: input.turn.doneBoundary,
    hardFailures: input.turn.hardFailures,
  });
  appendJsonl(join(input.routeRoot, "world-diffs.jsonl"), {
    routeId: input.turn.routeId,
    turnIndex: input.turn.turnIndex,
    beforeHash: input.turn.worldBefore.hash,
    afterHash: input.turn.worldAfter.hash,
    worldChanged: input.turn.worldBefore.hash !== input.turn.worldAfter.hash,
    beforeWorldVersion: input.turn.worldBefore.worldVersion,
    afterWorldVersion: input.turn.worldAfter.worldVersion,
    beforeWorldTimeMinutes: input.turn.worldBefore.worldTimeMinutes,
    afterWorldTimeMinutes: input.turn.worldAfter.worldTimeMinutes,
    beforeCurrentTick: input.turn.worldBefore.currentTick,
    afterCurrentTick: input.turn.worldAfter.currentTick,
    doneBoundary: input.turn.doneBoundary,
  });
  const stageEvents = input.turn.sseEvents.filter((event) =>
    event.eventType === "scene-settling" || event.eventType === "finalizing_turn"
  );
  appendJsonl(join(input.routeRoot, "latency-context-trace.jsonl"), {
    routeId: input.turn.routeId,
    turnIndex: input.turn.turnIndex,
    status: "collected_from_sse",
    hardFailure: false,
    terminalEvent: input.turn.terminalEvent,
    rawSseArtifactId: input.turn.rawSseArtifactId,
    stageEventCount: stageEvents.length,
    stageEvents,
    doneBoundary: input.turn.doneBoundary,
    contextBudgetOverflow: false,
  });
  writeJson(join(input.routeRoot, "job-proposal-ledger.json"), {
    routeId: input.turn.routeId,
    status: "collected_no_due_proposals_for_route",
    hardFailure: false,
    dueProposalIds: [],
    terminalProposalIds: [],
    committedProposalIds: [],
    requiredSurfaceSignalIds: [],
    surfaceSignalIds: [],
    staleJobIds: [],
    doneBoundary: input.turn.doneBoundary,
  });
}

export function buildCollectedTurn(input: {
  routeId: Phase94RouteId;
  campaignId: string;
  turnIndex: number;
  action: string;
  rawSse: string;
  worldBefore: Phase94WorldSnapshot;
  worldAfter: Phase94WorldSnapshot;
  screenshotPath: string | null;
}): Phase94CollectedTurn {
  const events = parseSseStream({
    routeId: input.routeId,
    turnIndex: input.turnIndex,
    raw: input.rawSse,
  });
  const terminalEvent = terminalEventFromEvents(events);
  const doneBoundary = doneBoundaryFromEvents(events);
  const assistantText = assistantTextFromEvents(events);
  const hardFailures = [
    terminalEvent !== "done" ? "missing-terminal-done-event" : undefined,
    assistantText.trim().length === 0 ? "empty-assistant-text" : undefined,
  ].filter(Boolean) as string[];
  const rawSseSha256 = hashText(input.rawSse);
  return {
    routeId: input.routeId,
    campaignId: input.campaignId,
    turnIndex: input.turnIndex,
    action: input.action,
    terminalEvent,
    assistantText,
    rawSseSha256,
    rawSseArtifactId: `raw-sse:${input.routeId}:${input.turnIndex}:${rawSseSha256}`,
    fullTurnArtifactId: `full-turn:${input.routeId}:${input.turnIndex}`,
    traceArtifactId: `trace:${input.routeId}:${input.turnIndex}`,
    worldBefore: input.worldBefore,
    worldAfter: input.worldAfter,
    screenshotPath: input.screenshotPath,
    sseEvents: events,
    doneBoundary,
    hardFailures,
  };
}
