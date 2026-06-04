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
  buildTurnTargetBindingV1,
  emptyLocalConsequenceResultV1,
  GM_TOOL_REQUEST_SYSTEM_PROMPT_V1,
  gmActionChecklistSystemPromptV1,
  gmActionChecklistV1Schema,
  mutatingGmActionChecklistV1Schema,
  nextExecutableChecklistStepV1,
  normalizeChecklistForGmReadV1,
  selectAllowedToolNamesForStepV1,
  toolContractHint,
  toolRequestExampleForStepV1,
  toolInputLanguageContractV1,
  toolRequestSchemaForAllowedToolsV1,
  validateAndNormalizeToolRequestV1,
  visibleFactsFromRead,
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

  it("does not promote mutating GM Read intent text into visible facts", () => {
    const read = {
      ...directRead({
        path: "tool_plan",
        situationSummary: "Player picks up the tube from the counter.",
        actionInterpretation: {
          intent: "pick up the tube and confirm possession",
          targetRefs: ["Sealed lacquer message tube"],
        },
        rationale: "A runtime receipt must own possession truth.",
      }),
      turnIntent: "Ground the possession change before narration claims it happened.",
    } as Extract<GmRead, { path: "tool_plan" }>;

    expect(visibleFactsFromRead(read, null)).toEqual([]);
  });

  it("keeps direct resolution text as visible fact for no-mutation direct reads", () => {
    const read = directRead({
      situationSummary: "Player studies the door.",
      actionInterpretation: {
        intent: "inspect the door",
        targetRefs: ["door-1"],
      },
      directResolutionNotes: "The door marks are fresh, but the door stays closed.",
    });

    expect(visibleFactsFromRead(read, null)).toEqual([
      "The door marks are fresh, but the door stays closed.",
    ]);
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

  it("tells Stage 3 to split movement from post-move device observations", () => {
    const prompt = gmActionChecklistSystemPromptV1();

    expect(prompt).toContain("Movement tools own only departure, route, travel cost, and arrival/current-scene change");
    expect(prompt).toContain("carried item/device/phone receives a signal, message, call, instruction");
    expect(prompt).toContain("create a separate required observation step after the movement step with toolNeed=start_search");
    expect(prompt).toContain("never fold that observation into toolNeed=movement or move_actor");
  });

  it("tells Stage 3 to keep scene-local positioning out of movement tools", () => {
    const prompt = gmActionChecklistSystemPromptV1();

    expect(prompt).toContain("repositions within the current scene");
    expect(prompt).toContain("use log_event with durability=scene_local");
    expect(prompt).toContain("Never use toolNeed=movement or move_actor for scene-local positioning");
  });

  it("tells Stage 3 not to move to an unrelated route for unknown POI directions", () => {
    const prompt = gmActionChecklistSystemPromptV1();

    expect(prompt).toContain("speaker-provided street directions toward a named POI/micro-location");
    expect(prompt).toContain("do not use move_actor to a different nearby/known route");
    expect(prompt).toContain("Use scene-local log_event for following directions plus start_search/find_poi_candidates/find_location_candidates/create_minor_poi/reveal_location");
  });

  it("tells Stage 4 not to substitute a legal connected route for an unmodeled target", () => {
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("destinationRef must be the exact connected destination the player requested");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("Never substitute another legal connected route");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("named target or speaker-provided directions are not modeled");
  });

  it("tells Stage 3 to split dialogue from local stance and possession posture", () => {
    const prompt = gmActionChecklistSystemPromptV1();

    expect(prompt).toContain("dialogue/social action also includes local stance or possession posture");
    expect(prompt).toContain("keeping distance, stepping back, taking cover");
    expect(prompt).toContain("explicitly not handing an item over");
    expect(prompt).toContain("create a separate scene-local log_event step before the dialogue step");
    expect(prompt).toContain("Do not fold those physical micro-actions into record_dialogue_outcome");
  });

  it("tells Stage 3 not to turn already-held item stowing into transfer_item", () => {
    const prompt = gmActionChecklistSystemPromptV1();

    expect(prompt).toContain("Do not create transfer_item");
    expect(prompt).toContain("already in playerInventory/current possession");
    expect(prompt).toContain("unless ownership, location, or equip state actually changes");
  });

  it("tells Stage 3 not to turn unmodeled small currency into transfer_item", () => {
    const prompt = gmActionChecklistSystemPromptV1();

    expect(prompt).toContain("ordinary small/unmodeled currency");
    expect(prompt).toContain("unless that money exists as a visible/current/inventory item");
    expect(prompt).toContain("For a paid answer, sold hint, named price, refusal, or bargain");
    expect(prompt).toContain("use one record_dialogue_outcome step");
  });

  it("tells Stage 3 to use start_search for unconfirmed object details", () => {
    const prompt = gmActionChecklistSystemPromptV1();

    expect(prompt).toContain("Use toolNeed=find_object_candidates only when the needed result is which visible/current/inventory object labels match");
    expect(prompt).toContain("mixed current-scene affordance");
    expect(prompt).toContain("Never satisfy a visible-person request with routes, points of interest, objects, or gmRead refs alone");
    expect(prompt).toContain("Use toolNeed=start_search");
    expect(prompt).toContain("registration numbers");
    expect(prompt).toContain("must not assert the searched detail exists or is absent");
  });

  it("tells Stage 3 to cover explicit visible-people requests with actor authority", () => {
    const prompt = gmActionChecklistSystemPromptV1();

    expect(prompt).toContain("If the player asks who/which people/actors/NPCs/guards/traders/porters are visible");
    expect(prompt).toContain("include a required list_visible_affordances or find_actor_candidates step");
    expect(prompt).toContain("Never satisfy a visible-person request with routes, points of interest, objects, or gmRead refs alone");
    expect(prompt).toContain("steps covering every requested category");
  });

  it("tells Stage 3 not to materialize already-visible addressed actors", () => {
    const prompt = gmActionChecklistSystemPromptV1();

    expect(prompt).toContain("Never use toolNeed=create_scene_extra for actor labels already present");
    expect(prompt).toContain("If the player addresses multiple visible actors");
    expect(prompt).toContain("record one dialogue outcome from an existing primary speaker");
  });

  it("exposes transfer_item target contract without item targets", () => {
    const hint = toolContractHint("transfer_item");

    expect(JSON.stringify(hint)).toContain("character|npc|player|actor|location; never item");
    expect(JSON.stringify(hint)).toContain("never a container item label");
    expect(JSON.stringify(hint)).toContain("Do not use when the player merely keeps, pockets, hides, carries, or stows");
    expect(JSON.stringify(hint)).toContain("ordinary small/unmodeled currency");
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
      { toolNeed: "local_positioning" },
      { allowedTools: ["move_actor", "log_event", "start_search"] },
    )).toEqual(["log_event"]);
    expect(selectAllowedToolNamesForStepV1(
      { toolNeed: "device_signal_observation" },
      { allowedTools: ["inspect_known_fact", "start_search", "record_world_fact"] },
    )).toEqual(["start_search"]);
    expect(selectAllowedToolNamesForStepV1(
      { toolNeed: "start_search" },
      { allowedTools: ["list_visible_affordances", "inspect_known_fact"] },
    )).toEqual([]);
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

  it("removes temporary-responder checklist steps when GM Read already binds a visible speaker", () => {
    const checklist = mutatingGmActionChecklistV1Schema.parse({
      version: "gm-action-checklist.v1",
      turnPath: "mutating",
      steps: [
        {
          stepId: "prose-role-responder",
          purpose: "Materialize the addressed temporary responder for \"Road Warden and Gate Clerk\".",
          evidenceRefs: ["Player", "Road Warden", "Gate Clerk"],
          dependsOnStepIds: [],
          expectedVisibleEffect: "A current-scene support responder is available.",
          requiredAction: "backend_tool",
          settlementPolicy: "required",
          toolNeed: "create_scene_extra",
        },
        {
          stepId: "step-1",
          purpose: "Record the answer from the existing visible speakers.",
          evidenceRefs: ["Player", "Road Warden", "Gate Clerk"],
          dependsOnStepIds: ["prose-role-responder"],
          expectedVisibleEffect: "The procedural answer is recorded.",
          requiredAction: "backend_tool",
          settlementPolicy: "required",
          toolNeed: "record_dialogue_outcome",
        },
      ],
    });

    const normalized = normalizeChecklistForGmReadV1(
      checklist,
      {
        ...directRead({
          path: "tool_plan",
          turnIntent: "Record visible actor answer.",
          actionInterpretation: {
            intent: "ask visible actors",
            targetRefs: ["Road Warden", "Gate Clerk"],
          },
          evidenceRefs: ["Player", "Road Warden", "Gate Clerk"],
          runtimeRequirement: {
            kind: "dialogue_outcome",
            durability: "durable",
            topicKind: "procedure",
            speakerBinding: { kind: "visible_actor", speakerRef: "Road Warden" },
          },
        }),
      } as GmRead,
      {
        allowedTools: ["create_scene_extra", "record_dialogue_outcome"],
        roster: {
          active: [
            {
              id: "player",
              actorId: "player",
              type: "player",
              label: "Player",
              locationId: null,
              sceneScopeId: null,
              awareness: "clear",
            },
            {
              id: "warden",
              actorId: "warden",
              type: "npc",
              label: "Road Warden",
              locationId: null,
              sceneScopeId: null,
              awareness: "clear",
            },
          ],
          support: [
            {
              id: "clerk",
              actorId: "clerk",
              type: "npc",
              label: "Gate Clerk",
              locationId: null,
              sceneScopeId: null,
              awareness: "clear",
            },
          ],
          background: [],
        },
      } as unknown as SceneFrame,
    );

    expect(normalized.steps).toEqual([expect.objectContaining({
      stepId: "step-1",
      toolNeed: "record_dialogue_outcome",
      dependsOnStepIds: [],
    })]);
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

  it("fails closed when an exact runtime toolNeed is not exposed", () => {
    const schema = toolRequestSchemaForAllowedToolsV1([]);
    expect(() =>
      schema.parse({
        version: "gm-tool-request.v1",
        stepId: "step-1",
        toolName: "list_visible_affordances",
        input: { scope: "current_scene", maxResults: 4 },
        evidenceRefs: [],
      }),
    ).toThrow(/No runtime tool is exposed/u);

    const validation = validateAndNormalizeToolRequestV1(
      {
        version: "gm-tool-request.v1",
        stepId: "step-1",
        toolName: "list_visible_affordances",
        input: { scope: "current_scene", maxResults: 4 },
        evidenceRefs: [],
      },
      { allowedTools: ["list_visible_affordances"] } as SceneFrame,
      {
        stepId: "step-1",
        purpose: "Actively check the phone for a signal.",
        evidenceRefs: ["Burner phone"],
        dependsOnStepIds: [],
        expectedVisibleEffect: "The phone check is recorded.",
        requiredAction: "backend_tool",
        settlementPolicy: "required",
        toolNeed: "start_search",
      },
    );
    expect(validation.failure).toMatch(/does not satisfy checklist toolNeed=start_search/u);
  });

  it("rejects move_actor when scene-local positioning selects an unrequested exit route", () => {
    const validation = validateAndNormalizeToolRequestV1(
      {
        version: "gm-tool-request.v1",
        stepId: "step-1",
        toolName: "move_actor",
        input: {
          destinationRef: "Shibuya District",
          mode: "walk",
          intentSummary: "Stand by the third poster column in the underpass.",
          evidenceRefs: ["Shibuya District"],
        },
        evidenceRefs: ["Shibuya District"],
      },
      {
        playerAction: "Я выбираю третью колонну справа в Shibuya Pedestrian Underpass, подхожу к ней и встаю рядом.",
        currentLocationName: "Shibuya Pedestrian Underpass",
        currentSceneScopeName: "Shibuya Pedestrian Underpass",
        allowedTools: ["move_actor", "log_event"],
      } as SceneFrame,
      {
        stepId: "step-1",
        purpose: "The player takes a local position near the third column.",
        evidenceRefs: ["Shibuya Pedestrian Underpass"],
        dependsOnStepIds: [],
        expectedVisibleEffect: "The player is waiting near the third column.",
        requiredAction: "backend_tool",
        settlementPolicy: "required",
        toolNeed: "movement",
      },
    );

    expect(validation.failure).toContain("scene-local positioning");
    expect(validation.failure).toContain("Use log_event with durability=scene_local");
  });

  it("rejects move_actor when directions to a named POI are substituted with another connected route", () => {
    const validation = validateAndNormalizeToolRequestV1(
      {
        version: "gm-tool-request.v1",
        stepId: "step-1",
        toolName: "move_actor",
        input: {
          actorRef: "Hayashi Ren",
          destinationRef: "Shibuya Back-Alley Meeting Point",
          mode: "walk",
          intentSummary: "Следовать указаниям прохожего: до конца улицы, направо за кофейней, искать синюю вывеску Laundry King слева через квартал.",
          evidenceRefs: ["Shibuya Back-Alley Meeting Point"],
        },
        evidenceRefs: ["Shibuya Back-Alley Meeting Point"],
      },
      {
        playerAction: "Я следую подсказке прохожего: иду по улице до конца, поворачиваю направо за кофейней и внимательно ищу синюю вывеску Laundry King слева через квартал.",
        currentLocationName: "Shibuya District",
        currentSceneScopeName: "Shibuya District",
        allowedTools: ["move_actor", "start_search", "create_minor_poi", "log_event"],
      } as SceneFrame,
      {
        stepId: "step-1",
        purpose: "Process the described route to Laundry King: straight to end of street, turn right after the coffee shop, traverse one block.",
        evidenceRefs: ["Player", "Прохожий"],
        dependsOnStepIds: [],
        expectedVisibleEffect: "Player finds the new street position near the blue Laundry King sign.",
        requiredAction: "backend_tool",
        settlementPolicy: "required",
        toolNeed: "move_actor",
      },
    );

    expect(validation.failure).toContain("different named target");
    expect(validation.failure).toContain("Laundry King");
    expect(validation.failure).toContain("may not silently substitute an unrelated legal route");
  });

  it("binds speaker directions to an unresolved target instead of a connected substitute", () => {
    const binding = buildTurnTargetBindingV1(
      {
        playerAction: "Я следую подсказке прохожего и ищу синюю вывеску Laundry King слева через квартал.",
        movementCandidates: [
          { label: "Shibuya Back-Alley Meeting Point", connected: true },
        ],
      } as SceneFrame,
      {
        purpose: "Follow the directions toward Laundry King.",
        expectedVisibleEffect: "Laundry King sign may be found.",
      },
    );

    expect(binding.requestedTargetText).toBe("Laundry King");
    expect(binding.requestedTargetKind).toBe("unmodeled_poi_or_micro_location");
    expect(binding.boundMovementRefs).toEqual([]);
    expect(selectAllowedToolNamesForStepV1(
      {
        toolNeed: "movement",
        purpose: "Follow the directions toward Laundry King.",
        expectedVisibleEffect: "Laundry King sign may be found.",
      },
      {
        playerAction: "Я следую подсказке прохожего и ищу синюю вывеску Laundry King слева через квартал.",
        movementCandidates: [
          { label: "Shibuya Back-Alley Meeting Point", connected: true },
        ],
        allowedTools: ["move_actor", "check_route", "start_search"],
      } as SceneFrame,
    )).toEqual([]);
  });

  it("derives unresolved movement target binding from structured GM Read targetRefs", () => {
    const checklist = normalizeChecklistForGmReadV1(
      {
        version: "gm-action-checklist.v1",
        turnPath: "mutating",
        steps: [{
          stepId: "step-1",
          purpose: "Follow the directions toward the named shop.",
          evidenceRefs: ["Player", "Прохожий", "Laundry King"],
          dependsOnStepIds: [],
          expectedVisibleEffect: "The player follows the lead toward the shop.",
          requiredAction: "backend_tool",
          settlementPolicy: "required",
          toolNeed: "movement",
        }],
      },
      directRead({
        path: "tool_plan",
        actionInterpretation: {
          intent: "follow speaker directions toward Laundry King",
          targetRefs: ["Laundry King"],
        },
        evidenceRefs: ["Player", "Прохожий"],
      }) as Extract<GmRead, { path: "tool_plan" }>,
      {
        playerAction: "Я следую подсказке прохожего и ищу синюю вывеску Laundry King слева через квартал.",
        movementCandidates: [
          { label: "Shibuya Back-Alley Meeting Point", connected: true },
        ],
        allowedTools: ["move_actor", "check_route", "start_search"],
      } as SceneFrame,
    );

    expect(checklist.steps[0]?.targetBinding).toMatchObject({
      targetText: "Laundry King",
      targetKind: "unmodeled_poi_or_micro_location",
      movementAuthority: "none",
      allowedDestinationRefs: [],
    });
    expect(selectAllowedToolNamesForStepV1(
      checklist.steps[0]!,
      {
        playerAction: "Я следую подсказке прохожего и ищу синюю вывеску Laundry King слева через квартал.",
        movementCandidates: [
          { label: "Shibuya Back-Alley Meeting Point", connected: true },
        ],
        allowedTools: ["move_actor", "check_route", "start_search"],
      } as SceneFrame,
    )).toEqual([]);
  });

  it("does not seed a first-connected movement example when the named POI is unresolved", () => {
    const example = toolRequestExampleForStepV1(
      {
        stepId: "step-1",
        purpose: "Follow the directions toward Laundry King.",
        evidenceRefs: ["Player", "Прохожий"],
        dependsOnStepIds: [],
        expectedVisibleEffect: "Laundry King sign may be found.",
        requiredAction: "backend_tool",
        settlementPolicy: "required",
        toolNeed: "movement",
      },
      directRead(),
      {
        playerAction: "Я следую подсказке прохожего и ищу синюю вывеску Laundry King слева через квартал.",
        movementCandidates: [
          { label: "Shibuya Back-Alley Meeting Point", connected: true },
        ],
        allowedTools: ["move_actor", "start_search"],
        roster: { active: [], support: [] },
      } as unknown as SceneFrame,
      ["move_actor"],
    );

    expect(example).toBeNull();
  });

  it("accepts movement when the requested named target is an exact connected destination", () => {
    const validation = validateAndNormalizeToolRequestV1(
      {
        version: "gm-tool-request.v1",
        stepId: "step-1",
        toolName: "move_actor",
        input: {
          destinationRef: "Laundry King",
          mode: "walk",
          intentSummary: "Go to Laundry King.",
          evidenceRefs: ["Laundry King"],
        },
        evidenceRefs: ["Laundry King"],
      },
      {
        playerAction: "Я иду к Laundry King.",
        currentLocationName: "Shibuya District",
        currentSceneScopeName: "Shibuya District",
        movementCandidates: [
          { label: "Laundry King", connected: true },
          { label: "Shibuya Back-Alley Meeting Point", connected: true },
        ],
        allowedTools: ["move_actor"],
      } as SceneFrame,
      {
        stepId: "step-1",
        purpose: "Move to Laundry King.",
        evidenceRefs: ["Laundry King"],
        dependsOnStepIds: [],
        expectedVisibleEffect: "Player arrives at Laundry King.",
        requiredAction: "backend_tool",
        settlementPolicy: "required",
        toolNeed: "movement",
      },
    );

    expect(validation.failure).toBeNull();
  });

  it("rejects check_route when unmodeled POI directions are substituted with another route", () => {
    const validation = validateAndNormalizeToolRequestV1(
      {
        version: "gm-tool-request.v1",
        stepId: "step-1",
        toolName: "check_route",
        input: {
          actorRef: "Player",
          destinationRef: "Shibuya Back-Alley Meeting Point",
          mode: "walk",
        },
        evidenceRefs: ["Shibuya Back-Alley Meeting Point"],
      },
      {
        playerAction: "Я следую подсказке прохожего и ищу Laundry King.",
        currentLocationName: "Shibuya District",
        currentSceneScopeName: "Shibuya District",
        movementCandidates: [
          { label: "Shibuya Back-Alley Meeting Point", connected: true },
        ],
        allowedTools: ["check_route"],
      } as SceneFrame,
      {
        stepId: "step-1",
        purpose: "Check route while following directions toward Laundry King.",
        evidenceRefs: ["Player", "Прохожий"],
        dependsOnStepIds: [],
        expectedVisibleEffect: "Laundry King route is clarified.",
        requiredAction: "backend_tool",
        settlementPolicy: "required",
        toolNeed: "route_check",
      },
    );

    expect(validation.failure).toContain("may not silently substitute an unrelated legal route");
    expect(validation.failure).toContain("Laundry King");
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
    expect(built.system).toContain("unrelated non-Russian scripts");
    expect(built.system).toContain("Chinese, Japanese, Korean, Arabic, Vietnamese");
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
    expect(built.system).toContain("Do not infer object contents");
    expect(built.prompt).toContain("не подтверждает содержимое");
    expect(built.prompt).not.toContain("Ты осматриваешься вокруг.");
  });

  it("summarizes start_search as unconfirmed discovery rather than absence", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      tick: 0,
      playerAction: "Я ищу регистрационный номер на sealed tube.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player searches for a registration number.",
        sceneQuestion: "Is a number established?",
        actionInterpretation: {
          intent: "search for registration number",
          targetRefs: ["Sealed tube"],
        },
        rationale: "Search target is unconfirmed.",
        evidenceRefs: ["Player", "Sealed tube"],
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
        toolName: "start_search",
        input: { query: "registration number on sealed tube", method: "inspect" },
        result: {
          success: true,
          status: "success",
          result: {
            kind: "search_started",
            query: "registration number on sealed tube",
            status: "active",
            targetTruth: "unconfirmed",
            found: false,
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
    expect(built.prompt).toContain("Конкретная находка");
    expect(built.prompt).toContain("это не доказывает их отсутствие");
  });

  it("forbids narrator from turning phone start_search found=false into device status truth", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      tick: 0,
      playerAction: "Я иду в переход и смотрю, появится ли сообщение на Burner phone.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player moves and watches a phone.",
        sceneQuestion: "Does the phone have confirmed status?",
        actionInterpretation: {
          intent: "watch the phone for a message",
          targetRefs: ["Burner phone"],
        },
        rationale: "Phone status needs observation evidence.",
        evidenceRefs: ["Player", "Burner phone"],
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
        toolName: "start_search",
        input: {
          query: "сигнал, сообщение или инструкция на Burner phone",
          method: "look",
          intentSummary: "Проверить экран Burner phone после прибытия.",
        },
        result: {
          success: true,
          status: "success",
          result: {
            kind: "search_started",
            query: "сигнал, сообщение или инструкция на Burner phone",
            status: "active",
            targetTruth: "unconfirmed",
            found: false,
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
    expect(built.system).toContain("found=false means no concrete discovery/receipt was created");
    expect(built.prompt).toContain("Не пиши, что экран пуст");
    expect(built.prompt).toContain("сообщение/звонок/уведомление/инструкция есть или отсутствует");
    expect(built.prompt).toContain("конкретный статус не установлен");
  });

  it("forbids narrator from turning a ready phone mention into screen status", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      tick: 0,
      playerAction: "Я встаю у колонны и держу Burner phone наготове.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player waits by a column with phone ready.",
        sceneQuestion: "What local position is established?",
        actionInterpretation: {
          intent: "wait by the column",
          targetRefs: ["Burner phone"],
        },
        rationale: "Local positioning is scene-local.",
        evidenceRefs: ["Player", "Burner phone"],
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
        toolName: "log_event",
        input: {
          text: "Игрок встаёт у третьей колонны и держит Burner phone наготове.",
          importance: 3,
          participants: ["Hayashi Ren"],
          durability: "scene_local",
        },
        result: {
          success: true,
          status: "success",
          result: { persisted: false },
        },
      }],
      localConsequenceResult: null,
      acceptedActorResults: [],
      acceptedDurableEventIds: [],
      producedDurableEventIds: [],
      privateGuardTerms: [],
    };

    const built = buildNarratorPromptFromSettledPacketV1(packet);
    expect(built.system).toContain("phone/device is held, ready, carried, or at hand is not screen/status evidence");
    expect(built.system).toContain("screen brightness/darkness");
  });

  it("treats playerAction as framing rather than settlement evidence for physical micro-actions", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      tick: 0,
      playerAction: "Я держу дистанцию, не отдаю пакет и спрашиваю, тот ли это склад.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player asks a visible NPC whether this is the warehouse.",
        sceneQuestion: "What does the NPC answer?",
        actionInterpretation: {
          intent: "ask about the warehouse address",
          targetRefs: ["Kenjaku", "Worn courier bag"],
        },
        rationale: "Dialogue answer must be recorded.",
        evidenceRefs: ["Player", "Kenjaku"],
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
        input: {
          speakerRef: "Kenjaku",
          addresseeRefs: ["Player"],
          outcomeKind: "redirected",
          topicKind: "other",
          authorityKind: "not_authorized",
          truthStatus: "speaker_asserted",
          durability: "scene_local",
          quote: "Ворота - деталь второстепенная.",
          claims: [{
            claimKind: "other",
            polarity: "redirects",
            subjectText: "подтверждение адреса",
            summary: "Kenjaku уходит от прямого подтверждения адреса.",
          }],
          stateEffects: [],
        },
        result: {
          success: true,
          status: "success",
          result: {
            outcomeKind: "redirected",
            topicKind: "other",
            quote: "Ворота - деталь второстепенная.",
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

    expect(built.system).toContain("playerAction is the player's attempted/requested first-person action, not accepted evidence by itself");
    expect(built.system).toContain("stepping back, keeping distance, taking cover");
    expect(built.system).toContain("not handing something over");
    expect(built.prompt).toContain("playerAction is request/framing, not settlement evidence");
  });

  it("keeps empty candidate lookup evidence scoped to its own category", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      tick: 0,
      playerAction: "Я ищу торговца, носильщика или указатель.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player looks for a person or sign.",
        sceneQuestion: "What is visible?",
        actionInterpretation: {
          intent: "find help or a sign",
          targetRefs: ["merchant", "porter", "sign"],
        },
        rationale: "Mixed category lookup must stay scoped.",
        evidenceRefs: ["Player"],
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
        toolName: "find_object_candidates",
        input: { query: "merchant porter sign" },
        result: {
          success: true,
          status: "success",
          kind: "observation",
          observationOnly: true,
          result: {
            toolName: "find_object_candidates",
            queryMatched: false,
            candidates: [],
            count: 0,
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
    expect(built.prompt).toContain("Совпавшие видимые предметы этим lookup не подтверждены");
    expect(built.prompt).toContain("Это не проверяет видимых людей");
    expect(built.prompt).toContain("не доказывает их отсутствие");
  });

  it("summarizes empty known-fact lookup as a checked non-confirmation, not generic look-around", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      tick: 16,
      playerAction: "Я проверяю delivery manifest на строку, которая может относиться к North Barrier Blind Spot.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player checks whether a manifest line is known.",
        sceneQuestion: "Does the known information confirm the line?",
        actionInterpretation: {
          intent: "check manifest against known facts",
          targetRefs: ["delivery manifest", "North Barrier Blind Spot"],
        },
        rationale: "Known-fact lookup must ground the answer.",
        evidenceRefs: ["delivery manifest"],
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
        toolName: "inspect_known_fact",
        input: { query: "delivery manifest North Barrier Blind Spot", scope: "known", maxResults: 3 },
        result: {
          success: true,
          status: "success",
          kind: "observation",
          observationOnly: true,
          result: {
            toolName: "inspect_known_fact",
            query: "delivery manifest North Barrier Blind Spot",
            facts: [],
            candidates: [],
            count: 0,
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
    expect(built.prompt).toContain("Проверка известных игроку фактов по запросу");
    expect(built.prompt).toContain("delivery manifest North Barrier Blind Spot");
    expect(built.prompt).toContain("Совпавший видимый или уже известный игроку факт не подтверждён");
    expect(built.prompt).toContain("не является общим осмотром сцены");
    expect(built.prompt).not.toContain("Ты осматриваешься вокруг.");
  });

  it("keeps non-player GM Read refs from becoming the subject of the player action", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 1,
      resultWorldVersion: 1,
      tick: 2,
      playerAction: "В текущем месте я останавливаюсь и проверяю доступные выходы, видимых людей и явные признаки опасности.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player checks exits, visible people, and danger signs.",
        sceneQuestion: "What does the player see?",
        actionInterpretation: {
          intent: "check the current place",
          targetRefs: ["Chizuru Oba"],
        },
        rationale: "Observation read.",
        evidenceRefs: ["Player", "Chizuru Oba", "East Exit Underground Passage"],
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
        toolName: "find_actor_candidates",
        input: { query: "visible people", scope: "current_scene", maxResults: 4 },
        result: {
          success: true,
          status: "success",
          kind: "observation",
          observationOnly: true,
          result: {
            toolName: "find_actor_candidates",
            queryMatched: false,
            candidates: [],
            count: 0,
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
    expect(built.system).toContain("The playerAction is the player's attempted/requested first-person action, not accepted evidence by itself");
    expect(built.system).toContain("Never make a non-player gmRead targetRef or evidenceRef");
    expect(built.system).toContain("Never narrate a non-player actor as present, visible, nearby");
    expect(built.system).toContain("Movement acceptedEvidence is not device/status evidence");
    expect(built.system).toContain("signal, message, call, instruction, alert, or status appeared or did not appear");
    expect(built.prompt).toContain("\"playerActionSubject\": \"player\"");
    expect(built.prompt).toContain("playerAction is request/framing, not settlement evidence");
    expect(built.prompt).toContain("gmRead targetRefs/evidenceRefs are never the subject");
    expect(built.prompt).toContain("gmRead targetRefs/evidenceRefs/narrationGuardrails never establish NPC presence or visibility");
    expect(built.prompt).toContain("Совпавшие видимые люди или акторы этим lookup не подтверждены");
  });

  it("summarizes equipped visible items as carried, not unattended scene objects", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      tick: 0,
      playerAction: "Я осматриваюсь на базаре.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player looks around.",
        sceneQuestion: "What is visible?",
        actionInterpretation: {
          intent: "look around",
          targetRefs: [],
        },
        rationale: "Observation only.",
        evidenceRefs: ["Player"],
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
        toolName: "list_visible_affordances",
        input: { maxResults: 8 },
        result: {
          success: true,
          status: "success",
          kind: "observation",
          observationOnly: true,
          result: {
            toolName: "list_visible_affordances",
            current: { locationName: "Lowwater Bazaar" },
            visibleActors: [],
            legalTargets: [
              { type: "item", label: "Courier satchel", visibleTags: ["equipped"] },
              { type: "location", label: "Anchor Chain Pylon" },
            ],
            legalMovement: [{ label: "Anchor Chain Pylon" }],
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
    expect(built.prompt).toContain("При тебе: Courier satchel.");
    expect(built.prompt).toContain("В поле внимания есть: Anchor Chain Pylon.");
    expect(built.prompt).not.toContain("В поле внимания есть: Courier satchel");
  });

  it("summarizes accepted route checks and movement as completed arrival evidence", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 4,
      resultWorldVersion: 5,
      tick: 8,
      playerAction: "Я выбираю безопасный путь к Shibuya Backstreet Collection Point и иду туда.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player chooses a safe route and moves.",
        sceneQuestion: "Which route is safe?",
        actionInterpretation: {
          intent: "choose route and move",
          targetRefs: ["Shibuya Backstreet Collection Point"],
        },
        rationale: "Movement changes current scene.",
        evidenceRefs: ["Player"],
        narrationGuardrails: ["Do not narrate movement before it is accepted."],
      },
      oracleResult: null,
      visibleFacts: [],
      skippedSteps: [],
      failedSteps: [],
      checklist: null,
      stepSettlements: [],
      acceptedToolResults: [{
        stepId: "step-1",
        toolName: "check_route",
        input: {
          actorRef: "Player",
          destinationRef: "Shibuya Backstreet Collection Point",
          mode: "walk",
        },
        result: {
          success: true,
          status: "success",
          kind: "observation",
          observationOnly: true,
          result: {
            routeStatus: "legal",
            current: {
              locationName: "Shibuya Ward",
            },
            destination: {
              type: "location",
              label: "Shibuya Backstreet Collection Point",
            },
            path: ["current_location", "Shibuya Backstreet Collection Point"],
          },
        },
      }, {
        stepId: "step-2",
        toolName: "move_actor",
        input: {
          destinationRef: "Shibuya Backstreet Collection Point",
          mode: "walk",
        },
        result: {
          success: true,
          status: "success",
          result: {
            kind: "move_actor",
            locationName: "Shibuya Backstreet Collection Point",
            path: ["Shibuya Ward", "Shibuya Backstreet Collection Point"],
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
    expect(built.system).toContain("narrate the completed arrival");
    expect(built.system).toContain("route availability only");
    expect(built.prompt).toContain("Проверка маршрута выполнена из текущей сцены: Shibuya Ward.");
    expect(built.prompt).toContain("Проверка маршрута подтвердила доступность направления: Shibuya Backstreet Collection Point.");
    expect(built.prompt).toContain("Этот результат не перемещает игрока и не меняет текущую сцену");
    expect(built.prompt).toContain("Перемещение завершено: текущая сцена теперь Shibuya Backstreet Collection Point.");
    expect(built.prompt).not.toContain("Мир принял результат действия.");
    expect(built.prompt).not.toContain("The world accepted the action result.");
  });

  it("anchors failed route checks to the tool current scene instead of stale player-origin text", () => {
    const packet: SettledTurnPacketV1 = {
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      turnId: "turn-1",
      campaignId: "campaign-1",
      baseWorldVersion: 4,
      resultWorldVersion: 4,
      tick: 8,
      playerAction: "Я иду из Shibuya Ward к Shibuya Backstreet Collection Point.",
      gmRead: {
        path: "tool_plan",
        situationSummary: "Player checks a route from stale wording.",
        sceneQuestion: "Which current-scene route is legal?",
        actionInterpretation: {
          intent: "check route to collection point",
          targetRefs: ["Shibuya Backstreet Collection Point"],
        },
        rationale: "Route checks must use current tool evidence.",
        evidenceRefs: ["Player"],
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
        toolName: "check_route",
        input: {
          actorRef: "Player",
          destinationRef: "Shibuya Backstreet Collection Point",
          mode: "walk",
        },
        result: {
          success: true,
          status: "success",
          kind: "observation",
          observationOnly: true,
          result: {
            routeStatus: "not_visible_or_legal",
            current: {
              locationName: "East Exit Underground Passage",
            },
            destination: null,
            path: [],
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

    expect(built.prompt).toContain("Проверка маршрута выполнена из текущей сцены: East Exit Underground Passage.");
    expect(built.prompt).toContain("Статус маршрута: not_visible_or_legal.");
    expect(built.prompt).toContain("текущая сцена остаётся: East Exit Underground Passage");
    expect(built.prompt).toContain("Если текст игрока называл другую исходную локацию, она не является авторитетной.");
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
        outcomeKind: expect.stringContaining("never use unavailable/no_current_answer with speakerRef"),
        authorityKind: expect.stringContaining("no_visible_authority only with unavailable/no_current_answer"),
        claims: [expect.objectContaining({
          claimKind: expect.stringContaining("use other for procedure/document/authority/policy categories"),
          summary: expect.stringContaining("including unavailable/no_current_answer"),
        })],
        requestedRoleText: expect.stringContaining("must also omit speakerRef"),
        quote: expect.stringContaining("every outcome needs quote or claims"),
      },
    });
    expect(JSON.stringify(toolContractHint("record_dialogue_outcome"))).toContain(
      "use evidence for proof/documentary value",
    );
    expect(toolContractHint("start_search")).toMatchObject({
      input: {
        query: expect.stringContaining("specific unconfirmed detail"),
        intentSummary: expect.stringContaining("do not claim the detail was found"),
      },
      notes: [
        expect.stringContaining("specific unconfirmed detail"),
        expect.stringContaining("targetTruth=unconfirmed"),
      ],
    });
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("futureUseKind=evidence");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("never futureUseKind=proof");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("claims[].claimKind must be one of");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("use other rather than inventing a new enum");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("Never send empty strings for optional fields");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("every outcome requires quote or claims");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("visible speaker/speakerRef, never use outcomeKind=unavailable");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("no_current_answer are only for no visible/current speaker");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("acceptedContext exposes a prior stateReceipts");
  });

  it("keeps Oracle outcomes from becoming movement evidence by themselves", () => {
    const read = directRead({
      path: "roll_oracle",
      rollRequest: {
        actorRef: "Player",
        question: "Does the risky exit work?",
        stakes: "The player escapes or is blocked.",
        evidenceRefs: ["Player"],
      },
      turnGrounding: {
        intentKind: "combat_pressure",
        requiresGrounding: true,
        groundingKind: "roll_oracle",
        topicKind: "safety",
        durability: "scene_local",
        reason: "The risk is uncertain.",
      },
    } as Partial<GmRead>);

    expect(visibleFactsFromRead(read, {
      chance: 80,
      roll: 10,
      outcome: "strong_hit",
      reasoning: "The exit is clear.",
    })).toEqual([
      expect.stringContaining("Oracle outcome only: strong_hit"),
    ]);
    expect(visibleFactsFromRead(read, {
      chance: 80,
      roll: 10,
      outcome: "strong_hit",
      reasoning: "The exit is clear.",
    })[0]).toContain("No location, inventory, condition, or other backend state changes");
    expect(buildNarratorPromptFromSettledPacketV1({
      version: "settled-turn-packet.v1",
      packetId: "packet-1",
      campaignId: "campaign-1",
      turnId: "turn-1",
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      tick: 1,
      playerAction: "Я выхожу в Shibuya Ward.",
      gmRead: {
        path: "roll_oracle",
        situationSummary: "The player tries a risky exit.",
        sceneQuestion: "Does the exit pressure resolve?",
        actionInterpretation: { intent: "exit", targetRefs: ["Shibuya Ward"] },
        rationale: "The risk is uncertain.",
        evidenceRefs: ["Player"],
        narrationGuardrails: [],
      },
      oracleResult: {
        chance: 80,
        roll: 10,
        outcome: "strong_hit",
        reasoning: "The exit is clear.",
      },
      visibleFacts: ["Oracle outcome only: strong_hit. The exit is clear. No location, inventory, condition, or other backend state changes are accepted unless accepted tool evidence says so."],
      checklist: null,
      stepSettlements: [],
      acceptedToolResults: [],
      localConsequenceResult: null,
      acceptedActorResults: [],
      acceptedDurableEventIds: [],
      producedDurableEventIds: [],
      failedSteps: [],
      skippedSteps: [],
      privateGuardTerms: [],
    }).system).toContain("Oracle result is not a movement");
    expect(buildNarratorPromptFromSettledPacketV1({
      version: "settled-turn-packet.v1",
      packetId: "packet-2",
      campaignId: "campaign-1",
      turnId: "turn-2",
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      tick: 2,
      playerAction: "Я следую подсказке и ищу синюю вывеску Laundry King.",
      gmRead: {
        path: "roll_oracle",
        situationSummary: "The player follows directions toward Laundry King.",
        sceneQuestion: "Does the lead pan out?",
        actionInterpretation: { intent: "find Laundry King", targetRefs: ["Laundry King"] },
        rationale: "The lead is uncertain.",
        evidenceRefs: ["Player", "Прохожий"],
        narrationGuardrails: [],
      },
      oracleResult: {
        chance: 45,
        roll: 24,
        outcome: "weak_hit",
        reasoning: "The lead partly pans out.",
      },
      visibleFacts: ["Oracle outcome only: weak_hit. No location, inventory, condition, or other backend state changes are accepted unless accepted tool evidence says so."],
      checklist: null,
      stepSettlements: [],
      acceptedToolResults: [],
      localConsequenceResult: null,
      acceptedActorResults: [],
      acceptedDurableEventIds: [],
      producedDurableEventIds: [],
      failedSteps: [],
      skippedSteps: [],
      privateGuardTerms: [],
    }).system).toContain("never narrate walking progress along directions");
    expect(buildNarratorPromptFromSettledPacketV1({
      version: "settled-turn-packet.v1",
      packetId: "packet-3",
      campaignId: "campaign-1",
      turnId: "turn-3",
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      tick: 3,
      playerAction: "Я следую подсказке и ищу синюю вывеску Laundry King.",
      gmRead: {
        path: "roll_oracle",
        situationSummary: "The player follows directions toward Laundry King.",
        sceneQuestion: "Does the lead pan out?",
        actionInterpretation: { intent: "find Laundry King", targetRefs: ["Laundry King"] },
        rationale: "The lead is uncertain.",
        evidenceRefs: ["Player", "Прохожий"],
        narrationGuardrails: [],
      },
      oracleResult: {
        chance: 45,
        roll: 24,
        outcome: "weak_hit",
        reasoning: "The lead partly pans out.",
      },
      visibleFacts: [],
      checklist: null,
      stepSettlements: [],
      acceptedToolResults: [],
      localConsequenceResult: null,
      acceptedActorResults: [],
      acceptedDurableEventIds: [],
      producedDurableEventIds: [],
      failedSteps: [],
      skippedSteps: [],
      privateGuardTerms: [],
    }).system).toContain("POI discovery");
  });

  it("requires Stage 4 model-authored tool input prose to follow the turn language", () => {
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("responseLanguage/toolInputLanguageContract");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("model-authored prose input field");
    expect(GM_TOOL_REQUEST_SYSTEM_PROMPT_V1).toContain("Preserve exact refs, names, item labels");
    expect(toolInputLanguageContractV1("ru")).toContain("unrelated non-turn scripts");
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
