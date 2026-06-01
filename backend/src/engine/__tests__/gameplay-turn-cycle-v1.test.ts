import { describe, expect, it } from "vitest";
import {
  assertLocalConsequencePassAcceptedV1,
  assertRequiredToolStepsAcceptedV1,
  assertNarrationRespectsSettledPacketV1,
  assertNoExecutableGmReadPayloadV1,
  acceptedStepContextV1,
  attachStateReceiptsToToolStepResultV1,
  bridgeLookupRepairFeedbackV1,
  buildLocalConsequenceResultFromActorPassV1,
  buildNarratorPromptFromSettledPacketV1,
  buildSceneFrameForecastRefsV1,
  emptyLocalConsequenceResultV1,
  GM_TOOL_REQUEST_SYSTEM_PROMPT_V1,
  gmActionChecklistSystemPromptV1,
  gmActionChecklistV1Schema,
  mutatingGmActionChecklistV1Schema,
  nextExecutableChecklistStepV1,
  selectAllowedToolNamesForStepV1,
  toolContractHint,
  toolInputLanguageContractV1,
  toolRequestSchemaForAllowedToolsV1,
  validateAndNormalizeToolRequestV1,
  type SettledTurnPacketV1,
  type GameplayFrameEnvelopeV1,
} from "../gameplay-turn-cycle-v1.js";
import type { GmRead } from "../gm-turn-read.js";
import type { SceneFrame } from "../scene-frame.js";
import type { ToolResult } from "../tool-result.js";

function directRead(overrides: Partial<GmRead> = {}): GmRead {
  return {
    version: "gm-read.v1",
    path: "direct",
    situationSummary: "The player studies the marked door.",
    sceneQuestion: "What does the player learn?",
    focalActorRefs: ["player-1"],
    backgroundActorRefs: [],
    actionInterpretation: {
      intent: "inspect the door",
      targetRefs: ["door-1"],
    },
    rationale: "Inspection does not mutate world state.",
    evidenceRefs: ["door-1"],
    turnGrounding: {
      requiresGrounding: false,
      groundingKind: "none",
      evidenceRefs: [],
    },
    narrationGuardrails: [],
    directResolutionNotes: "The marks look fresh, but the door stays closed.",
    ...overrides,
  } as GmRead;
}

describe("gameplay turn cycle v1 contracts", () => {
  it("accepts a GM Read that stays out of backend execution ownership", () => {
    expect(() => assertNoExecutableGmReadPayloadV1(directRead())).not.toThrow();
  });

  it("rejects executable tool payload fields inside GM Read", () => {
    const read = directRead({
      actionInterpretation: {
        intent: "inspect the door",
        targetRefs: ["door-1"],
        candidateToolRequest: {
          toolName: "mutate_world",
          input: { targetId: "door-1" },
        },
      } as never,
    });

    expect(() => assertNoExecutableGmReadPayloadV1(read)).toThrow(
      /candidateToolRequest.*toolName.*input/u,
    );
  });

  it("rejects executable tool payload fields inside the Stage 3 checklist", () => {
    expect(() =>
      gmActionChecklistV1Schema.parse({
        version: "gm-action-checklist.v1",
        turnPath: "mutating",
        steps: [{
          stepId: "step-1",
          purpose: "Move the player to the market road.",
          evidenceRefs: ["Market Road"],
          dependsOnStepIds: [],
          expectedVisibleEffect: "The player reaches the market road.",
          requiredAction: "backend_tool",
          toolNeed: "movement",
          toolName: "move_to",
          input: { targetLocationName: "Market Road" },
        }],
      }),
    ).toThrow(/executable tool payload fields/u);
  });

  it("requires a backend tool step for mutating Stage 3 checklists", () => {
    expect(() =>
      mutatingGmActionChecklistV1Schema.parse({
        version: "gm-action-checklist.v1",
        turnPath: "mutating",
        steps: [{
          stepId: "step-1",
          purpose: "Resolve a location change.",
          evidenceRefs: ["Cellar Stairs"],
          dependsOnStepIds: [],
          expectedVisibleEffect: "The player reaches the cellar stairs.",
          requiredAction: "narration_constraint",
        }],
      }),
    ).toThrow();

    expect(() =>
      mutatingGmActionChecklistV1Schema.parse({
        version: "gm-action-checklist.v1",
        turnPath: "mutating",
        steps: [{
          stepId: "step-1",
          purpose: "Resolve a location change.",
          evidenceRefs: ["Cellar Stairs"],
          dependsOnStepIds: [],
          expectedVisibleEffect: "The player reaches the cellar stairs.",
          requiredAction: "backend_tool",
          toolNeed: "movement",
        }],
      }),
    ).not.toThrow();
  });

  it("accepts bounded multi-step planning-only checklists", () => {
    const checklist = mutatingGmActionChecklistV1Schema.parse({
      version: "gm-action-checklist.v1",
      turnPath: "mutating",
      steps: [
        {
          stepId: "step-1",
          purpose: "Check the route.",
          evidenceRefs: ["Market Road"],
          dependsOnStepIds: [],
          expectedVisibleEffect: "The route is known.",
          requiredAction: "backend_tool",
          settlementPolicy: "required",
          toolNeed: "route_check",
        },
        {
          stepId: "step-2",
          purpose: "Move after the route is checked.",
          evidenceRefs: ["Market Road"],
          dependsOnStepIds: ["step-1"],
          expectedVisibleEffect: "The player reaches the road.",
          requiredAction: "backend_tool",
          settlementPolicy: "required",
          toolNeed: "movement",
        },
      ],
    });

    expect(checklist.steps).toHaveLength(2);
    expect(checklist.steps[1]!.dependsOnStepIds).toEqual(["step-1"]);
  });

  it("rejects invalid multi-step checklist graphs and budgets", () => {
    const step = (stepId: string, dependsOnStepIds: string[] = []) => ({
      stepId,
      purpose: `Resolve ${stepId}.`,
      evidenceRefs: ["evidence"],
      dependsOnStepIds,
      expectedVisibleEffect: `Effect ${stepId}.`,
      requiredAction: "backend_tool" as const,
      settlementPolicy: "required" as const,
      toolNeed: "entity_tag",
    });

    expect(() =>
      mutatingGmActionChecklistV1Schema.parse({
        version: "gm-action-checklist.v1",
        turnPath: "mutating",
        steps: [step("step-1"), step("step-1")],
      }),
    ).toThrow(/Duplicate checklist stepId/u);

    expect(() =>
      mutatingGmActionChecklistV1Schema.parse({
        version: "gm-action-checklist.v1",
        turnPath: "mutating",
        steps: [step("step-2", ["step-1"])],
      }),
    ).toThrow(/must refer to an earlier step/u);

    expect(() =>
      mutatingGmActionChecklistV1Schema.parse({
        version: "gm-action-checklist.v1",
        turnPath: "mutating",
        steps: [
          step("step-1"),
          step("step-2"),
          step("step-3"),
          step("step-4"),
          step("step-5"),
        ],
      }),
    ).toThrow();
  });

  it("narrows Stage 4 tool selection to the checklist state-effect need", () => {
    const allowed = selectAllowedToolNamesForStepV1(
      { toolNeed: "movement" },
      {
        allowedTools: [
          "find_location_candidates",
          "move_actor",
          "move_to",
          "reveal_location",
        ],
      },
    );

    expect(allowed).toEqual(["move_actor", "move_to"]);
  });

  it("tells Stage 3 to split physical annotations from dialogue outcomes", () => {
    const prompt = gmActionChecklistSystemPromptV1();

    expect(prompt).toContain("multiple backend-owned consequences");
    expect(prompt).toContain("toolNeed=entity_tag");
    expect(prompt).toContain("Do not fold player-applied physical marks or annotations into record_dialogue_outcome");
  });

  it("narrows Stage 4 tool selection for terminal and helper needs", () => {
    expect(selectAllowedToolNamesForStepV1(
      { toolNeed: "entity_tag" },
      { allowedTools: ["add_tag", "remove_tag", "record_dialogue_outcome", "check_route"] },
    )).toEqual(["add_tag", "remove_tag"]);
    expect(selectAllowedToolNamesForStepV1(
      { toolNeed: "create_scene_extra" },
      { allowedTools: ["add_tag", "create_scene_extra", "record_dialogue_outcome"] },
    )).toEqual(["create_scene_extra"]);
    expect(selectAllowedToolNamesForStepV1(
      { toolNeed: "record_dialogue_outcome" },
      { allowedTools: ["create_scene_extra", "record_dialogue_outcome"] },
    )).toEqual(["record_dialogue_outcome"]);
    expect(selectAllowedToolNamesForStepV1(
      { toolNeed: "actor_creation" },
      { allowedTools: ["create_scene_extra", "record_dialogue_outcome"] },
    )).toEqual(["create_scene_extra"]);
    expect(selectAllowedToolNamesForStepV1(
      { toolNeed: "dialogue_recording" },
      { allowedTools: ["create_scene_extra", "record_dialogue_outcome"] },
    )).toEqual(["record_dialogue_outcome"]);
    expect(selectAllowedToolNamesForStepV1(
      { toolNeed: "dialogue_outcome" },
      { allowedTools: ["add_tag", "record_dialogue_outcome", "record_world_fact"] },
    )).toEqual(["record_dialogue_outcome"]);
    expect(selectAllowedToolNamesForStepV1(
      { toolNeed: "route_check" },
      { allowedTools: ["check_route", "move_actor"] },
    )).toEqual(["check_route"]);
    expect(selectAllowedToolNamesForStepV1(
      { toolNeed: "inspect_known_fact" },
      {
        allowedTools: [
          "inspect_known_fact",
          "find_object_candidates",
          "find_actor_candidates",
          "add_tag",
          "list_navigation_options",
        ],
      },
    )).toEqual(["inspect_known_fact", "find_object_candidates", "find_actor_candidates"]);
  });

  it("selects the next dependency-ready backend step deterministically", () => {
    const checklist = mutatingGmActionChecklistV1Schema.parse({
      version: "gm-action-checklist.v1",
      turnPath: "mutating",
      steps: [
        {
          stepId: "step-1",
          purpose: "Resolve first.",
          evidenceRefs: ["first"],
          dependsOnStepIds: [],
          expectedVisibleEffect: "First accepted.",
          requiredAction: "backend_tool",
          settlementPolicy: "required",
          toolNeed: "entity_tag",
        },
        {
          stepId: "step-2",
          purpose: "Resolve second.",
          evidenceRefs: ["second"],
          dependsOnStepIds: ["step-1"],
          expectedVisibleEffect: "Second accepted.",
          requiredAction: "backend_tool",
          settlementPolicy: "required",
          toolNeed: "entity_tag",
        },
      ],
    });

    expect(nextExecutableChecklistStepV1(checklist, [])?.stepId).toBe("step-1");
    expect(nextExecutableChecklistStepV1(checklist, [{
      stepId: "step-1",
      purpose: "Resolve first.",
      status: "accepted",
      result: { success: true },
    }])?.stepId).toBe("step-2");
  });

  it("validates Stage 4 tool requests against the selected tool input schema", () => {
    const schema = toolRequestSchemaForAllowedToolsV1(["add_tag"]);

    expect(() =>
      schema.parse({
        version: "gm-tool-request.v1",
        stepId: "step-1",
        toolName: "add_tag",
        input: {
          value: "{\"entityName\":\"condition report\",\"entityType\":\"item\",\"tag\":\"durable-smoke\"}",
        },
        evidenceRefs: ["condition report"],
      }),
    ).toThrow(/entityName/u);

    expect(schema.parse({
      version: "gm-tool-request.v1",
      stepId: "step-1",
      toolName: "add_tag",
      input: {
        entityName: "condition report",
        entityType: "item",
        tag: "durable-smoke",
      },
      evidenceRefs: ["condition report"],
    })).toMatchObject({
      toolName: "add_tag",
      input: {
        entityName: "condition report",
        entityType: "item",
        tag: "durable-smoke",
      },
    });
  });

  it("rejects Stage 4 tool requests for the wrong checklist step", () => {
    const request = toolRequestSchemaForAllowedToolsV1(["add_tag"]).parse({
      version: "gm-tool-request.v1",
      stepId: "other-step",
      toolName: "add_tag",
      input: {
        entityName: "condition report",
        entityType: "item",
        tag: "durable-smoke",
      },
      evidenceRefs: ["condition report"],
    });

    const validation = validateAndNormalizeToolRequestV1(
      request,
      { allowedTools: ["add_tag"] } as SceneFrame,
      {
        stepId: "step-1",
        purpose: "Mark report.",
        evidenceRefs: ["condition report"],
        dependsOnStepIds: [],
        expectedVisibleEffect: "Report marked.",
        requiredAction: "backend_tool",
        settlementPolicy: "required",
        toolNeed: "entity_tag",
      },
    );

    expect(validation.failure).toMatch(/does not match checklist stepId/u);
  });

  it("aborts before packet persistence when required mutating tool step has no receipt", () => {
    const checklist = mutatingGmActionChecklistV1Schema.parse({
      version: "gm-action-checklist.v1",
      turnPath: "mutating",
      steps: [{
        stepId: "step-1",
        purpose: "Mark the report.",
        evidenceRefs: ["condition report"],
        dependsOnStepIds: [],
        expectedVisibleEffect: "The report has a durable mark.",
        requiredAction: "backend_tool",
        toolNeed: "entity_tag",
      }],
    });

    expect(() =>
      assertRequiredToolStepsAcceptedV1({
        checklist,
        stepSettlements: [{
          stepId: "step-1",
          purpose: "Mark the report.",
          status: "failed",
          toolName: "add_tag",
          input: { value: "{\"entityName\":\"condition report\"}" },
          reason: "entityName missing",
        }],
      }),
    ).toThrow(/failed before settled packet persistence/u);
  });

  it("scopes forecast refs to local scene-frame entities and candidates", () => {
    const frame = {
      campaignId: "campaign-1",
      playerActorId: "player-1",
      currentLocationId: "loc-1",
      currentSceneScopeId: "scene-1",
      currentLocationName: "Old Gate",
      currentSceneScopeName: "North Arch",
      roster: {
        active: [{
          id: "player-1",
          actorId: "player-actor-1",
          type: "player",
          label: "Mira",
          locationId: "loc-1",
          sceneScopeId: "scene-1",
          awareness: "present",
          tags: ["scout"],
        }],
        support: [],
        background: [],
      },
      movementCandidates: [{
        id: "move-1",
        locationId: "loc-2",
        label: "Market Road",
        connected: true,
        path: ["loc-1", "loc-2"],
      }],
      targetCandidates: [{
        id: "door-1",
        type: "location",
        label: "Marked Door",
        locationId: "loc-3",
        tags: ["sealed"],
      }],
    } as unknown as SceneFrame;

    expect(buildSceneFrameForecastRefsV1(frame)).toEqual([
      "campaign-1",
      "player-1",
      "loc-1",
      "scene-1",
      "Old Gate",
      "North Arch",
      "player-actor-1",
      "Mira",
      "scout",
      "move-1",
      "loc-2",
      "Market Road",
      "door-1",
      "loc-3",
      "Marked Door",
      "sealed",
    ]);
  });

  it("builds Stage 6 narrator prompt from settled evidence without failed or private terms", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 1,
      resultWorldVersion: 1,
      tick: 4,
      playerAction: "Я осматриваюсь.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player is at the gate.",
        sceneQuestion: "What is visible?",
        actionInterpretation: {
          intent: "look around",
          targetRefs: [],
        },
        rationale: "Observation only.",
        evidenceRefs: ["gate"],
        narrationGuardrails: [],
      },
      oracleResult: null,
      visibleFacts: [
        "Gate plaza is visible.",
        "SECRET_ROUTE_TOKEN must not leak.",
      ],
      skippedSteps: [{ stage: "step-2", reason: "Planned ambush did not happen." }],
      failedSteps: [{ stage: "step-3", reason: "Hidden trap failed validation." }],
      checklist: null,
      stepSettlements: [],
      acceptedToolResults: [],
      localConsequenceResult: null,
      acceptedActorResults: [],
      acceptedDurableEventIds: [],
      producedDurableEventIds: [],
      privateGuardTerms: ["SECRET_ROUTE_TOKEN"],
    };

    const built = buildNarratorPromptFromSettledPacketV1(packet);
    expect(built.system).toContain("Write in Russian.");
    expect(built.system).toContain("ordinary prose words, connectors, articles");
    expect(built.system).toContain("exact accepted label/name/canon term");
    expect(built.system).toContain("requisite поля");
    expect(built.prompt).toContain("Russian prose");
    expect(built.prompt).toContain("English only for exact accepted labels/names/canon terms");
    expect(built.prompt).toContain("Gate plaza is visible.");
    expect(built.prompt).not.toContain("SECRET_ROUTE_TOKEN");
    expect(built.prompt).not.toContain("Planned ambush did not happen.");
    expect(built.prompt).not.toContain("Hidden trap failed validation.");
    expect(built.prompt).toContain("failedStepCount");
    expect(built.prompt).toContain("skippedStepCount");
  });

  it("includes concrete object-shaped tool result text in Stage 6 accepted evidence", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 1,
      resultWorldVersion: 2,
      tick: 4,
      playerAction: "Я спрашиваю архивного клерка про CRN-7843-V.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player asks a clerk.",
        sceneQuestion: "What does the clerk answer?",
        actionInterpretation: {
          intent: "ask clerk",
          targetRefs: ["архивный клерк"],
        },
        rationale: "Dialogue outcome must be recorded.",
        evidenceRefs: ["current_scene"],
        narrationGuardrails: [],
      },
      oracleResult: null,
      visibleFacts: [],
      skippedSteps: [],
      failedSteps: [],
      checklist: null,
      stepSettlements: [],
      acceptedToolResults: [{
        stepId: "step-1",
        toolName: "record_dialogue_outcome",
        input: {},
        result: {
          success: true,
          status: "success",
          result: {
            text: "Dialogue outcome redirected on procedure. Summary: No seal-intact duplicate can be issued for CRN-7843-V.",
          },
        },
      }],
      localConsequenceResult: null,
      acceptedActorResults: [],
      acceptedDurableEventIds: [],
      producedDurableEventIds: [],
      privateGuardTerms: [],
    };

    const built = buildNarratorPromptFromSettledPacketV1(packet);
    expect(built.prompt).toContain("No seal-intact duplicate can be issued for CRN-7843-V.");
    expect(built.prompt).not.toContain("Мир принял результат действия.");
  });

  it("includes concrete bridge lookup candidates in Stage 6 accepted evidence", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      tick: 0,
      playerAction: "Я проверяю вещи и маршруты.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player checks inventory and routes.",
        sceneQuestion: "Which objects and routes are available?",
        actionInterpretation: {
          intent: "check inventory and routes",
          targetRefs: ["Burner phone", "Delivery manifest"],
        },
        rationale: "Bridge lookups must ground visible options.",
        evidenceRefs: ["Player"],
        narrationGuardrails: [],
      },
      oracleResult: null,
      visibleFacts: [],
      skippedSteps: [],
      failedSteps: [],
      checklist: null,
      stepSettlements: [],
      acceptedToolResults: [
        {
          stepId: "step-1",
          toolName: "find_object_candidates",
          input: { query: "delivery manifest burner phone" },
          result: {
            success: true,
            status: "success",
            kind: "observation",
            observationOnly: true,
            result: {
              toolName: "find_object_candidates",
              candidates: [
                { label: "Burner phone" },
                { label: "Delivery manifest" },
              ],
            },
          },
        },
        {
          stepId: "step-2",
          toolName: "list_navigation_options",
          input: { actorRef: "Player", maxResults: 6 },
          result: {
            success: true,
            status: "success",
            kind: "observation",
            observationOnly: true,
            result: {
              toolName: "list_navigation_options",
              current: { locationName: "Shibuya Ward" },
              candidates: [
                { label: "East Exit Underground Passage" },
                { label: "Dogenzaka Apartment Safehouse" },
              ],
            },
          },
        },
      ],
      localConsequenceResult: null,
      acceptedActorResults: [],
      acceptedDurableEventIds: [],
      producedDurableEventIds: [],
      privateGuardTerms: [],
    };

    const built = buildNarratorPromptFromSettledPacketV1(packet);
    expect(built.prompt).toContain("Burner phone");
    expect(built.prompt).toContain("Delivery manifest");
    expect(built.prompt).toContain("East Exit Underground Passage");
    expect(built.prompt).toContain("Dogenzaka Apartment Safehouse");
    expect(built.prompt).not.toContain("Ты осматриваешься вокруг.");
  });

  it("uses accepted log_event input text as actor-visible settled evidence", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 1,
      resultWorldVersion: 2,
      tick: 4,
      playerAction: "Я показываю журнал Silk Maren.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player shows a ledger.",
        sceneQuestion: "How does Silk Maren react?",
        actionInterpretation: {
          intent: "show ledger",
          targetRefs: ["Silk Maren"],
        },
        rationale: "The actor can react locally.",
        evidenceRefs: ["Silk Maren"],
        narrationGuardrails: [],
      },
      oracleResult: null,
      visibleFacts: [],
      skippedSteps: [],
      failedSteps: [],
      checklist: null,
      stepSettlements: [],
      acceptedToolResults: [],
      localConsequenceResult: {
        version: "local-consequence-result.v1",
        runId: "run-1",
        stage: "local_actor_reactions",
        trigger: {
          gmReadPath: "tool_plan",
          acceptedGmStepIds: ["step-1"],
          acceptedToolResultRefs: ["step-1:record_dialogue_outcome"],
        },
        baseWorldVersion: 1,
        frameWorldVersion: 1,
        resultWorldVersion: 2,
        route: "required_before_packet",
        actorSettlements: [],
        queuedSimulationProposalRefs: [],
        skipped: [],
        failed: [],
      },
      acceptedActorResults: [{
        settlementId: "local-actor:npc-silk:1",
        actorId: "npc-silk",
        actorLabel: "Silk Maren",
        toolName: "log_event",
        input: {
          text: "Silk Maren leans over the ledger and confirms the burned route numbers are visible.",
        },
        result: {
          success: true,
          status: "success",
          result: {
            durability: "scene_local",
            persisted: false,
          },
        },
      }],
      acceptedDurableEventIds: [],
      producedDurableEventIds: [],
      privateGuardTerms: [],
    };

    const built = buildNarratorPromptFromSettledPacketV1(packet);
    expect(built.prompt).toContain(
      "Silk Maren leans over the ledger and confirms the burned route numbers are visible.",
    );
    expect(built.prompt).not.toContain("The world accepted the action result.");
  });

  it("includes accepted local actor consequence facts in Stage 6 evidence", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 1,
      resultWorldVersion: 3,
      tick: 4,
      playerAction: "Я ставлю печать на отчет.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player marks a report near the clerk.",
        sceneQuestion: "How does the clerk react?",
        actionInterpretation: {
          intent: "mark report",
          targetRefs: ["report-1"],
        },
        rationale: "The action mutates a visible item.",
        evidenceRefs: ["report-1"],
        narrationGuardrails: [],
      },
      oracleResult: null,
      visibleFacts: ["The clerk says the urgent seal is accepted into the desk log."],
      skippedSteps: [],
      failedSteps: [],
      checklist: null,
      stepSettlements: [],
      acceptedToolResults: [],
      localConsequenceResult: {
        version: "local-consequence-result.v1",
        runId: "run-1",
        stage: "local_actor_reactions",
        trigger: {
          gmReadPath: "tool_plan",
          acceptedGmStepIds: ["step-1"],
          acceptedToolResultRefs: ["tool-result-1"],
        },
        baseWorldVersion: 1,
        frameWorldVersion: 2,
        resultWorldVersion: 3,
        route: "required_before_packet",
        actorSettlements: [],
        queuedSimulationProposalRefs: [],
        skipped: [{ reason: "Offscreen actor queued after done.", actorId: "npc-offscreen" }],
        failed: [{ reason: "Failed offscreen probe.", actorId: "npc-hidden" }],
      },
      acceptedActorResults: [{
        settlementId: "local-actor:npc-clerk:1",
        actorId: "npc-clerk",
        actorLabel: "Desk Clerk",
        toolName: "record_dialogue_outcome",
        input: {},
        result: {
          success: true,
          status: "success",
          result: {
            text: "The clerk says the urgent seal is accepted into the desk log.",
          },
        },
        visibleFact: "The clerk says the urgent seal is accepted into the desk log.",
      }],
      acceptedDurableEventIds: [],
      producedDurableEventIds: [],
      privateGuardTerms: [],
    };

    const built = buildNarratorPromptFromSettledPacketV1(packet);
    expect(built.prompt).toContain("urgent seal is accepted into the desk log");
    expect(built.prompt).toContain("failedLocalConsequenceCount");
    expect(built.prompt).not.toContain("Failed offscreen probe");
  });

  it("builds accepted LocalConsequenceResultV1 from required actor pass receipts", () => {
    const frame = {
      campaignId: "campaign-1",
      tick: 5,
      worldVersion: 2,
      playerActorId: "player-1",
      currentLocationId: "loc-1",
      currentSceneScopeId: "scene-1",
      playerAction: "Я ставлю печать на отчет.",
      roster: { active: [], support: [], background: [] },
      perception: { visible: [], hidden: [] },
      recentEvents: [],
      targetCandidates: [],
      movementCandidates: [],
      deferredHooks: [],
      allowedTools: ["record_dialogue_outcome"],
      oracle: null,
    } as unknown as SceneFrame;
    const envelope = {
      version: "gameplay-frame-envelope.v1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseTick: 4,
      baseWorldVersion: 1,
      frame,
      scopedForecastExcerpt: null,
    } satisfies GameplayFrameEnvelopeV1;

    const result = buildLocalConsequenceResultFromActorPassV1({
      envelope,
      read: directRead({ path: "tool_plan" as GmRead["path"] }),
      acceptedToolResults: [{
        stepId: "step-1",
        toolName: "add_tag",
        input: { targetId: "report-1", tag: "urgent" },
        result: {
          success: true,
          status: "success",
          authority: { toolResultId: "tool-result-1", stateDeltaRefs: ["item:report-1:tags"] } as never,
        },
      }],
      refreshedFrame: frame,
      actorPass: {
        schedule: {
          campaignId: "campaign-1",
          baseWorldVersion: 2,
          worldTimeMinutes: 5,
          decisions: [{
            actorId: "npc-clerk",
            actorName: "Desk Clerk",
            route: "required_before_done",
            reason: "visible local reaction",
            signals: [],
            writeScopes: ["npc:npc-clerk:state"],
          }],
        },
        decisions: [{
          schedule: {
            actorId: "npc-clerk",
            actorName: "Desk Clerk",
            route: "required_before_done",
            reason: "visible local reaction",
            signals: [],
            writeScopes: ["npc:npc-clerk:state"],
          },
          actorFrame: {} as never,
          packet: {} as never,
          processUpdateStatus: "updated",
          actionResults: [{
            order: 0,
            actionId: "actor-action-1",
            actionRef: "actor-tool:npc-clerk:record_dialogue_outcome:1",
            actorId: "npc-clerk",
            toolName: "record_dialogue_outcome",
            input: {},
            args: {},
            result: {
              success: true,
              status: "success",
              result: {
                eventId: "actor-event-1",
                text: "The clerk logs the urgent seal.",
              },
              authority: {
                toolResultId: "actor-tool-result-1",
                eventRefs: ["actor-authority-event-1"],
                stateDeltaRefs: ["npc:npc-clerk:state"],
              } as never,
            },
          }],
        }],
        actionResults: [],
        parallelFrameRetrievalTrace: [],
        parallelPrepTrace: [],
      },
      resultWorldVersion: 3,
    });

    expect(result.route).toBe("required_before_packet");
    expect(result.actorSettlements[0]).toMatchObject({
      actorId: "npc-clerk",
      status: "accepted",
      visibleToPlayer: true,
      visibleFacts: ["The clerk logs the urgent seal."],
    });
    expect(result.actorSettlements[0]!.actionResults[0]).toMatchObject({
      toolName: "record_dialogue_outcome",
      visibleFact: "The clerk logs the urgent seal.",
    });
    expect(() => assertLocalConsequencePassAcceptedV1(result)).not.toThrow();
  });

  it("keeps a required actor settlement accepted when an extra actor tool is rejected after a receipt", () => {
    const frame = {
      campaignId: "campaign-1",
      tick: 5,
      worldVersion: 2,
      playerActorId: "player-1",
      currentLocationId: "loc-1",
      currentSceneScopeId: "scene-1",
      playerAction: "Я требую свидетельское подтверждение.",
      roster: { active: [], support: [], background: [] },
      perception: { visible: [], hidden: [] },
      recentEvents: [],
      targetCandidates: [],
      movementCandidates: [],
      deferredHooks: [],
      allowedTools: ["log_event", "set_relationship"],
      oracle: null,
    } as unknown as SceneFrame;
    const envelope = {
      version: "gameplay-frame-envelope.v1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseTick: 4,
      baseWorldVersion: 1,
      frame,
      scopedForecastExcerpt: null,
    } satisfies GameplayFrameEnvelopeV1;

    const result = buildLocalConsequenceResultFromActorPassV1({
      envelope,
      read: directRead({ path: "tool_plan" as GmRead["path"] }),
      acceptedToolResults: [{
        stepId: "step-1",
        toolName: "log_event",
        input: { text: "The player demands witness confirmation." },
        result: {
          success: true,
          status: "success",
          authority: { toolResultId: "gm-tool-result-1", eventRefs: ["gm-event-1"] } as never,
        },
      }],
      refreshedFrame: frame,
      actorPass: {
        schedule: {
          campaignId: "campaign-1",
          baseWorldVersion: 2,
          worldTimeMinutes: 5,
          decisions: [{
            actorId: "npc-clerk",
            actorName: "Desk Clerk",
            route: "required_before_done",
            reason: "visible local reaction",
            signals: [],
            writeScopes: ["npc:npc-clerk:state"],
          }],
        },
        decisions: [{
          schedule: {
            actorId: "npc-clerk",
            actorName: "Desk Clerk",
            route: "required_before_done",
            reason: "visible local reaction",
            signals: [],
            writeScopes: ["npc:npc-clerk:state"],
          },
          actorFrame: {} as never,
          packet: {} as never,
          processUpdateStatus: "updated",
          actionResults: [
            {
              order: 0,
              actionId: "actor-action-1",
              actionRef: "actor-tool:npc-clerk:log_event:1",
              actorId: "npc-clerk",
              toolName: "log_event",
              input: { text: "The clerk refuses to testify without compensation." },
              args: { text: "The clerk refuses to testify without compensation." },
              result: {
                success: true,
                status: "success",
                result: {
                  eventId: "actor-event-1",
                  persisted: true,
                },
                authority: {
                  toolResultId: "actor-tool-result-1",
                  eventRefs: ["actor-authority-event-1"],
                  stateDeltaRefs: ["npc:npc-clerk:state"],
                } as never,
              },
            },
            {
              order: 1,
              actionId: "actor-action-2",
              actionRef: "actor-tool:npc-clerk:set_relationship:2",
              actorId: "npc-clerk",
              toolName: "set_relationship",
              input: { entityA: "Desk Clerk", entityB: "Player", tag: "wary" },
              args: { entityA: "Desk Clerk", entityB: "Player", tag: "wary" },
              result: {
                success: false,
                status: "failure",
                error: "authority_write_scope_mismatch:world:relationship",
              },
            },
          ],
        }],
        actionResults: [],
        parallelFrameRetrievalTrace: [],
        parallelPrepTrace: [],
      },
      resultWorldVersion: 3,
    });

    expect(result.actorSettlements[0]).toMatchObject({
      status: "accepted",
      visibleFacts: ["The clerk refuses to testify without compensation."],
    });
    expect(result.failed).toEqual([]);
    expect(result.skipped[0]).toMatchObject({
      reason: "Actor extra tool rejected after accepted local reaction: set_relationship.",
      actorId: "npc-clerk",
    });
    expect(() => assertLocalConsequencePassAcceptedV1(result)).not.toThrow();
  });

  it("exposes bridge lookup maxResults bounds to Stage 4 tool request prompts", () => {
    expect(toolContractHint("list_navigation_options")).toMatchObject({
      input: {
        maxResults: expect.stringContaining("never exceed 8"),
      },
    });
    expect(toolContractHint("inspect_known_fact")).toMatchObject({
      input: {
        maxResults: expect.stringContaining("never exceed 8"),
      },
    });
  });

  it("exposes exact record_dialogue_outcome enum and optional-field contracts to Stage 4 prompts", () => {
    expect(toolContractHint("record_dialogue_outcome")).toMatchObject({
      input: {
        futureUseKind: expect.stringContaining("route_choice|permission_check|evidence"),
        requestedRoleText: expect.stringContaining("never empty string"),
      },
    });
    expect(JSON.stringify(toolContractHint("record_dialogue_outcome"))).toContain(
      "use evidence for proof/documentary value",
    );
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("futureUseKind=evidence");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("never futureUseKind=proof");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("Never send empty strings for optional fields");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("acceptedContext exposes a prior stateReceipts");
  });

  it("requires Stage 4 model-authored tool input prose to follow the turn language", () => {
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("responseLanguage/toolInputLanguageContract");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("model-authored prose input field");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("Preserve exact refs, names, item labels");
    expect(toolInputLanguageContractV1("ru")).toContain("durable, official, stamped");
    expect(toolInputLanguageContractV1("ru")).toContain("procedурные");
  });

  it("forbids backend-only refs in Stage 4 tool input refs", () => {
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("use only model-safe visible labels/current aliases");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("Never copy backend-only refs like knowledge:*");
    expect(toolContractHint("record_world_fact")).toMatchObject({
      input: {
        sourceRefs: [expect.stringContaining("never knowledge:*")],
        subjectRefs: [expect.stringContaining("never knowledge:*")],
      },
    });
  });

  it("exposes backend-issued state receipts from accepted structural steps to later Stage 4 dialogue requests", () => {
    const result: ToolResult = {
      success: true,
      status: "success",
      result: {
        entity: "petition-grade paper and small ink vial",
        entityType: "item",
        appliedTag: "discrepancy-form",
        tags: ["document", "discrepancy-form"],
      },
      authority: {
        toolResultId: "tool-result-1",
        campaignId: "campaign-1",
        sourceEntity: { type: "player", id: "player-1" },
        baseWorldVersion: 1,
        resultWorldVersion: 2,
        worldTimeMinutes: 0,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["item:petition-grade-paper-and-small-ink-vial:tag"],
        eventRefs: [],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };

    const withReceipts = attachStateReceiptsToToolStepResultV1({
      toolName: "add_tag",
      toolInput: {
        entityName: "petition-grade paper and small ink vial",
        entityType: "item",
        tag: "discrepancy-form",
      },
      result,
      previousSettlements: [],
    });

    expect(withReceipts.stateReceipts?.[0]).toMatchObject({
      stateReceipt: "state_receipt_1_1",
      tool: "add_tag",
      key: "tag",
      value: "discrepancy-form",
    });
    expect(acceptedStepContextV1([{
      stepId: "step-1",
      purpose: "Mark petition paper as a discrepancy form.",
      status: "accepted",
      toolName: "add_tag",
      input: {
        entityName: "petition-grade paper and small ink vial",
        entityType: "item",
        tag: "discrepancy-form",
      },
      result: withReceipts,
    }])).toEqual([expect.objectContaining({
      stepId: "step-1",
      stateReceipts: expect.arrayContaining([{ stateReceipt: "state_receipt_1_1" }]),
    })]);
  });

  it("repairs inspect_known_fact misses toward visible-object bridge lookups", () => {
    expect(bridgeLookupRepairFeedbackV1(
      { toolName: "inspect_known_fact", input: { query: "delivery manifest" } },
      {
        success: false,
        error: "no_player_visible_or_known_fact",
        contractFailure: undefined,
      } as never,
    )).toContain("find_object_candidates");

    expect(bridgeLookupRepairFeedbackV1(
      { toolName: "find_object_candidates", input: { query: "delivery manifest" } },
      {
        success: false,
        error: "no_player_visible_or_known_fact",
        contractFailure: undefined,
      } as never,
    )).toBeNull();
  });

  it("fails closed for required local actor failures and keeps deferred skips audit-only", () => {
    const emptyResult = emptyLocalConsequenceResultV1({
      envelope: {
        version: "gameplay-frame-envelope.v1",
        turnId: "turn-1",
        campaignId: "campaign-1",
        baseTick: 1,
        baseWorldVersion: 1,
        frame: { worldVersion: 1 } as SceneFrame,
        scopedForecastExcerpt: null,
      },
      read: directRead(),
    });
    expect(() => assertLocalConsequencePassAcceptedV1(emptyResult)).not.toThrow();

    expect(() => assertLocalConsequencePassAcceptedV1({
      ...emptyResult,
      route: "required_before_packet",
      failed: [{ reason: "actor tool rejected", actorId: "npc-clerk" }],
    })).toThrow(/failed before settled packet persistence/u);

    expect(() => assertLocalConsequencePassAcceptedV1({
      ...emptyResult,
      route: "required_before_packet",
      skipped: [{ reason: "routed proposal_after_done", actorId: "npc-clerk" }],
    })).not.toThrow();
  });

  it("rejects Stage 6 narration that leaks structured or private material", () => {
    const packet = {
      privateGuardTerms: ["SECRET_ROUTE_TOKEN"],
    } as SettledTurnPacketV1;

    expect(() => assertNarrationRespectsSettledPacketV1("Ты видишь площадь.", packet)).not.toThrow();
    expect(() => assertNarrationRespectsSettledPacketV1("{\"text\":\"bad\"}", packet)).toThrow(
      /structured data/u,
    );
    expect(() => assertNarrationRespectsSettledPacketV1("toolName: list_visible_affordances", packet)).toThrow(
      /non-player-facing marker/u,
    );
    expect(() => assertNarrationRespectsSettledPacketV1("SECRET_ROUTE_TOKEN", packet)).toThrow(
      /private forecast/u,
    );
  });
});
