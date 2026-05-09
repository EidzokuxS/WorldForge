/**
 * Phase 58-04 — shared LLM mocks using vi.doMock + dynamic import.
 *
 * Why the hoisted-mock API is NOT used here:
 *   The hoisted auto-register variant is moved to the top of the file by
 *   Vitest, which makes the order independent of imports. That's convenient but
 *   brittle when tests interleave `vi.resetModules()` with `applyMocks()`
 *   because subsequent dynamic `import(...)` calls need to see the mock
 *   registered AT THE TIME OF IMPORT. vi.doMock is NOT hoisted — it
 *   registers at the point of call, so test setup can do:
 *
 *     vi.resetModules();
 *     await applyMocks();
 *     const { default: chatRoutes } = await import("../../routes/chat.js");
 *
 *   This ordering guarantees the subject module graph resolves against
 *   our mocks on every beforeEach.
 *
 * Scope:
 *   These helpers stub the collaborators that must be deterministic for
 *   a seam-coverage test:
 *     - `processTurn` / `processOpeningScene` / snapshot helpers — the
 *       mock yields pipeline-simulator events AND emits real
 *       `log.event(...)` records for each of the 14 engine-owned seams.
 *     - `drainPendingCommittedEvents` / `embedAndUpdateEvent` —
 *       quietly drain queues.
 *     - `resolveImageProvider` / image generation — no-ops.
 *     - `getDb` — returns a player with `hp: 5` so reactive checkpoint
 *       does not fire (we drive checkpoint behavior from the route).
 *   We deliberately let the REAL `../../campaign/index.js`,
 *   `../../lib/index.js`, and `../../lib/logger-setup.js` resolve so
 *   the route exercises the real ALS + logger stack and the JSONL file
 *   is written for real.
 */

import { vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { EXPECTED_18_SEAMS } from "./expected-seams.js";

// Compute absolute module paths so vi.doMock resolves correctly regardless
// of which test file invokes applyMocks (tests live in different
// directories — engine/__tests__/ and routes/__tests__/).
const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(__dirname, "../../../"); // → backend/src/

function mod(rel: string): string {
  return resolve(SRC_ROOT, rel);
}

export function mockStorytellerStream(
  text = "A shadow moves across the tavern floor.",
  toolCalls: Array<{ toolName: string; input: unknown }> = [],
) {
  return {
    fullStream: (async function* () {
      for (const tc of toolCalls) {
        yield {
          type: "tool-call",
          toolCallId: `tc-${tc.toolName}`,
          toolName: tc.toolName,
          input: tc.input,
        };
      }
      for (const ch of text) {
        yield { type: "text-delta", text: ch };
      }
      yield { type: "finish", finishReason: "stop" };
    })(),
    text: Promise.resolve(text),
    toolCalls: Promise.resolve(toolCalls),
    usage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
  };
}

export function mockOracleCall() {
  return {
    chance: 70,
    roll: 50,
    outcome: "hit" as const,
    reasoning: "mocked",
  };
}

export function mockJudgeCall<T>(fake: T) {
  return {
    object: fake,
    usage: { inputTokens: 50, outputTokens: 30 },
  };
}

export function mockEmbedder(dim = 768): number[] {
  return Array(dim)
    .fill(0)
    .map((_, i) => (i % 7) * 0.01);
}

/**
 * Register Vitest doMock stubs for every collaborator the route graph
 * touches that would otherwise make the turn non-deterministic or
 * require real external services.
 *
 * MUST be awaited before any dynamic `import(...)` of the subject
 * module graph.
 *
 * The processTurn mock is a "pipeline simulator" — it uses the REAL
 * logger (via dynamic import) to emit structured `log.event(...)`
 * records for the canonical engine/vector/ai seams, including the
 * Phase 70 compact ScenePlan seams, plus it yields the SSE events the
 * route expects. Route-level seams (turn.begin/turn.end/sse.emit/
 * sse.stream.aggregate) and llm.attempt / prompt.assembled are emitted
 * from this simulator so a single run
 * of app.request("/api/chat/action", ...) leaves a JSONL file on disk
 * whose unique event names covers all 18 EXPECTED_18_SEAMS.
 */
export async function applyMocks(): Promise<void> {
  // ai SDK — the canonical target for vi.doMock per plan.
  vi.doMock("ai", async () => {
    const actual =
      await vi.importActual<typeof import("ai")>("ai");
    return {
      ...actual,
      streamText: vi.fn(() =>
        mockStorytellerStream("A shadow moves across the tavern floor.", [
          {
            toolName: "add_chronicle_entry",
            input: { text: "tavern observed" },
          },
        ]),
      ),
      generateText: vi.fn(async () => ({
        text: "m",
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      })),
      generateObject: vi.fn(async () => ({
        object: mockOracleCall(),
        usage: { inputTokens: 10, outputTokens: 5 },
      })),
      embedMany: vi.fn(async () => ({
        embeddings: [mockEmbedder()],
      })),
      stepCountIs: vi.fn(() => () => false),
    };
  });

  // Engine — emit pipeline-simulator events + real log.event records so
  // the JSONL file contains the canonical engine-owned seams plus
  // llm.attempt / prompt.assembled. Also emit the route-adjacent SSE payloads so
  // writeTurnEventSSE fires sse.emit (incl. oracle_result) and
  // sse.stream.aggregate (via the text-delta chunks).
  vi.doMock(mod("engine/index.js"), async () => {
    const { createLogger } = await import(mod("lib/index.js"));
    const log = createLogger("mock-pipeline");

    async function* simulateTurn(
      input?: {
        playerAction?: string;
        intent?: string;
      },
      source: "player-turn" | "opening-scene" = "player-turn",
    ): AsyncGenerator<
      { type: string; data: unknown },
      void,
      unknown
    > {
      const hostileAction = /\b(attack|strike|slash|stab|shoot|blast|smash|punch|kick|hit)\b/i.test(
        `${input?.playerAction ?? ""} ${input?.intent ?? ""}`,
      );

      // --- pipeline-start seams -------------------------------------
      log.event("movement.detect", {
        from: "tavern",
        to: "tavern",
        moved: false,
      });
      log.event("target.context", {
        targetTags: ["npc:barkeep", "item:tankard"],
        subjectId: "player-1",
      });
      log.event("combat.envelope", {
        source: "player",
        hostileAction,
        built: hostileAction,
        reason: hostileAction ? null : "non_hostile_action",
        targetLabel: "Barkeep",
        matchup: hostileAction ? "advantaged" : null,
      });
      if (source === "opening-scene") {
        log.event("world-brain.scene-direction", {
          source,
          ran: true,
          focalActorCount: 2,
          backgroundActorCount: 1,
          presenceReasonCount: 2,
          causalBeatCount: 2,
          perceivableBeatCount: 1,
          situationSummaryLength: 72,
          sceneQuestionLength: 44,
        });
      } else {
        log.event("scene.frame", {
          source,
          activeActorIds: ["player-1", "npc-barkeep"],
          supportActorIds: [],
          backgroundActorIds: ["npc-stranger"],
          targetCandidateCount: 2,
          movementCandidateCount: 0,
          recentEventCount: 1,
          allowedToolCount: 1,
          durationMs: 4,
        });
      }
      if (hostileAction) {
        log.event("combat.bounds.derived", {
          source: "player",
          targetLabel: "Barkeep",
          outcome: "strong_hit",
          matchup: "advantaged",
          summary: "Truthful read: advantaged strong hit clearly tilts the scene without demanding instant finality.",
          ceilingCount: 2,
          floorCount: 1,
          prohibitionCount: 1,
        });
      }
      log.event("prompt.assembled", {
        pass: source === "player-turn" ? "judge-scene-plan" : "judge-adjudication",
        assembledChars: 4321,
        totalTokens: 1024,
        sectionCount: 8,
      });

      // --- oracle + judge nested -------------------------------------
      log.event("llm.attempt", {
        attemptNum: 1,
        model: "judge-mock",
        success: true,
        latencyMs: 5,
      });
      log.event("oracle.call", {
        input: { chance: 70 },
        output: { roll: 50, outcome: "hit" },
        latencyMs: 8,
      });

      // Emit the oracle_result SSE payload via generator yield (route
      // will flow it through writeTurnEventSSE -> sse.emit).
      yield {
        type: "oracle_result",
        data: { chance: 70, roll: 50, outcome: "hit" },
      };

      if (source === "player-turn") {
        log.event("judge.scene-plan", {
          plannedActionCount: 1,
          supportResponseCount: 0,
          deferredHookCount: 0,
          hiddenRationaleLength: 84,
          durationMs: 40,
        });
        log.event("scene.plan.validation", {
          ok: true,
          issueCount: 0,
          issueCodes: [],
          durationMs: 2,
        });
        log.event("scene.plan.execution", {
          plannedActionCount: 1,
          executedActionCount: 1,
          canonicalEventCount: 1,
          durationMs: 20,
        });
      } else {
        log.event("judge.hidden.plan", {
          actionCount: 1,
          rationaleLen: 84,
          durationMs: 40,
        });
        log.event("judge.hidden.execution", {
          plannedActionCount: 1,
          executedActionCount: 1,
          durationMs: 20,
        });
      }
      log.event("tool.call", {
        toolName: "add_chronicle_entry",
        args: { text: "tavern observed" },
        result: { success: true },
        latencyMs: 3,
      });
      log.event("db.write", {
        table: "chronicle",
        op: "insert",
        rowId: "chron-1",
      });

      // --- present-NPC agent pass ------------------------------------
      log.event("npcAgent.tick", {
        npcId: "npc-barkeep",
        npcName: "Barkeep",
        toolCallCount: 1,
        durationMs: 6,
      });

      // --- final visible-narration pass ------------------------------
      if (source === "player-turn") {
        log.event("scene.packet", {
          visibleActorCount: 2,
          hintSignalCount: 0,
          eventCount: 1,
          responseCount: 1,
          effectCount: 1,
          forbiddenActorCount: 1,
          forbiddenFactMarkerCount: 1,
          durationMs: 3,
        });
      }
      log.event("prompt.assembled", {
        pass: "final-narration",
        assembledChars: 3210,
        totalTokens: 800,
        sectionCount: 7,
      });
      if (source === "player-turn") {
        log.event("visible-narration.packet-guard", {
          stage: "passed",
          attempts: 1,
          retried: false,
          violationCount: 0,
          durationMs: 9,
        });
      }
      log.event("storyteller.visible.call", {
        mode: "final",
        inputTokens: 800,
        outputTokens: 120,
        durationMs: 90,
      });

      // A short delta stream so route writes `sse.stream.aggregate`.
      yield { type: "text-delta", data: "The " };
      yield { type: "text-delta", data: "tavern " };
      yield { type: "text-delta", data: "is quiet." };

      // --- reflection + faction post-turn ----------------------------
      log.event("reflection.tick", {
        npcId: "npc-barkeep",
        npcName: "Barkeep",
        toolCallCount: 0,
        durationMs: 4,
      });
      log.event("faction.tick", {
        factionId: "faction-1",
        action: "observe",
        outcome: "stable",
        targetLocation: "tavern",
        tagChangeCount: 0,
        chronicleEntryId: "chron-2",
      });

      // --- embedder + vector writes ----------------------------------
      log.event("embedder.call", {
        textCount: 1,
        totalChars: 42,
        durationMs: 5,
      });
      log.event("vector.write", {
        table: "episodic_events",
        op: "add",
        count: 1,
      });

      // --- done ------------------------------------------------------
      yield {
        type: "done",
        data: { tick: 0, deltaCount: 3 },
      };
    }

    return {
      processTurn: vi.fn((options?: { playerAction?: string; intent?: string }) => simulateTurn(options, "player-turn")),
      processOpeningScene: vi.fn(() => simulateTurn(undefined, "opening-scene")),
      captureSnapshot: vi.fn(async () => ({ snapshot: "mock" })),
      restoreSnapshot: vi.fn(async () => undefined),
      tickPresentNpcs: vi.fn(async () => undefined),
      simulateOffscreenNpcs: vi.fn(async () => undefined),
      checkAndTriggerReflections: vi.fn(async () => undefined),
      tickFactions: vi.fn(async () => undefined),
      queuePostTurnSimulationProposals: vi.fn((input: { campaignId: string }) => ({
        campaignId: input.campaignId,
        baseWorldVersion: 0,
        worldTimeMinutes: 0,
        queued: [],
      })),
      buildDoneBoundaryData: vi.fn((_campaignId: string, data: unknown) => ({
        ...(data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : { value: data }),
        worldVersion: 0,
        worldTimeMinutes: 0,
      })),
      readWorldClock: vi.fn((campaignId: string) => ({ campaignId, worldVersion: 0, worldTimeMinutes: 0, currentTick: 0, updatedAt: 0 })),
    };
  });

  vi.doMock(mod("engine/grounded-lookup.js"), () => ({
    runGroundedLookup: vi.fn(),
  }));

  vi.doMock(mod("vectors/episodic-events.js"), () => ({
    drainPendingCommittedEvents: vi.fn(() => []),
    embedAndUpdateEvent: vi.fn(async () => undefined),
  }));

  vi.doMock(mod("images/index.js"), () => ({
    generateImage: vi.fn(async () => Buffer.alloc(0)),
    resolveImageProvider: vi.fn(() => null),
    buildScenePrompt: vi.fn(() => ""),
    buildLocationPrompt: vi.fn(() => ""),
    ensureImageDir: vi.fn(),
    cacheImage: vi.fn(),
    imageExists: vi.fn(() => true),
  }));

  vi.doMock(mod("db/index.js"), () => ({
    getDb: vi.fn(() => ({
      select: () => ({
        from: () => ({
          where: () => ({
            get: () => ({
              hp: 5,
              currentLocationId: null,
              currentSceneLocationId: null,
            }),
          }),
        }),
      }),
    })),
  }));

  vi.doMock(mod("settings/index.js"), () => ({
    loadSettings: vi.fn(() => ({
      judge: {
        providerId: "p1",
        model: "judge-model",
        temperature: 0.1,
        maxTokens: 1024,
      },
      storyteller: {
        providerId: "p1",
        model: "st-model",
        temperature: 0.7,
        maxTokens: 2048,
      },
      embedder: {
        providerId: "",
        model: "",
        temperature: 0.1,
        maxTokens: 256,
      },
      providers: [
        {
          id: "p1",
          name: "P1",
          baseUrl: "http://localhost:1234",
          apiKey: "SECRET_KEY_PLACEHOLDER",
          defaultModel: "st-model",
          isBuiltin: false,
        },
      ],
      ui: { showRawReasoning: false },
      research: { maxSearchSteps: 0 },
      images: { stylePrompt: "" },
      observability: {
        enabled: true,
        dumpFullPrompts: false,
        roles: {
          judge: true,
          storyteller: true,
          oracle: true,
          npcAgent: true,
          reflection: true,
          embedder: true,
        },
      },
    })),
  }));

  vi.doMock(mod("routes/helpers.js"), async (importOriginal) => {
    const mod = (await importOriginal()) as Record<string, unknown>;
    return {
      ...mod,
      resolveStoryteller: vi.fn(() => ({
        resolved: {
          provider: {
            id: "p1",
            name: "P1",
            baseUrl: "http://localhost:1234",
            apiKey: "SECRET_KEY_PLACEHOLDER",
            model: "st-model",
          },
          temperature: 0.7,
          maxTokens: 2048,
        },
      })),
      resolveJudge: vi.fn(() => ({
        resolved: {
          provider: {
            id: "p1",
            name: "P1",
            baseUrl: "http://localhost:1234",
            apiKey: "SECRET_KEY_PLACEHOLDER",
            model: "judge-model",
          },
          temperature: 0.1,
          maxTokens: 1024,
        },
      })),
      resolveEmbedder: vi.fn(() => ({ error: "not configured", status: 400 })),
      requireLoadedCampaign: vi.fn(async (_c: unknown, id: string) => ({
        id,
      })),
    };
  });

  vi.doMock(mod("campaign/runtime-state.js"), () => {
    const active = new Set<string>();
    const snapshots = new Map<string, unknown>();
    return {
      tryBeginTurn: (id: string) => {
        if (active.has(id)) return false;
        active.add(id);
        return true;
      },
      endTurn: (id: string) => {
        active.delete(id);
      },
      hasActiveTurn: (id: string) => active.has(id),
      setLastTurnSnapshot: (id: string, snap: unknown) => {
        snapshots.set(id, snap);
      },
      getLastTurnSnapshot: (id: string) => snapshots.get(id),
      clearLastTurnSnapshot: (id: string) => {
        snapshots.delete(id);
      },
      hasLiveTurnSnapshot: (id: string) => snapshots.has(id),
    };
  });

  vi.doMock(mod("campaign/chat-history.js"), () => ({
    buildLookupHistoryMessages: vi.fn(() => []),
  }));

  vi.doMock(mod("campaign/index.js"), async (importOriginal) => {
    const mod = (await importOriginal()) as Record<string, unknown>;
    return {
      ...mod,
      appendChatMessages: vi.fn(),
      getChatHistory: vi.fn(() => []),
      getCampaignPremise: vi.fn(() => "premise"),
      replaceChatMessage: vi.fn(() => true),
      getLastPlayerAction: vi.fn(() => "look around"),
      createCheckpoint: vi.fn(async () => undefined),
      pruneAutoCheckpoints: vi.fn(async () => undefined),
      // readCampaignConfig is NOT mocked — route reads it from disk under
      // GSD_CAMPAIGNS_ROOT (tests seed the config there).
    };
  });
}

// Assert-time helper — fail fast if the test forgets to seed or something
// pulls in a bare module.
export function expectedSeamList(): readonly string[] {
  return EXPECTED_18_SEAMS;
}
