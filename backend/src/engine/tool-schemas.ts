/**
 * Storyteller tool definitions for AI SDK.
 *
 * Factory function creates campaign-scoped tools with Zod input schemas.
 * Each tool's execute callback delegates to the tool-executor for DB validation.
 */

import { tool } from "ai";
import { executeToolCall, toolRequiresExecutionAuthority } from "./tool-executor.js";
import { buildValidationFailureToolResult } from "./tool-result.js";
import type { ToolExecutionContext } from "./tool-execution-context.js";
import {
  executeBridgeCandidateTool,
  type BridgeLookupToolName,
} from "./bridge-candidate-tools.js";
import {
  runtimeToolInputSchemas,
  type RuntimeToolName,
} from "./runtime-tool-input-schemas.js";

export { runtimeToolInputSchemas } from "./runtime-tool-input-schemas.js";
export type { RuntimeToolName } from "./runtime-tool-input-schemas.js";

const {
  list_visible_affordances: listVisibleAffordancesInputSchema,
  list_navigation_options: listNavigationOptionsInputSchema,
  find_location_candidates: bridgeCandidateQueryInputSchema,
  find_actor_candidates: findActorCandidatesInputSchema,
  find_poi_candidates: findPoiCandidatesInputSchema,
  inspect_known_fact: inspectKnownFactInputSchema,
  check_route: checkRouteInputSchema,
  move_actor: moveActorInputSchema,
  create_minor_poi: createMinorPoiInputSchema,
  create_scene_extra: createSceneExtraInputSchema,
  start_search: startSearchInputSchema,
  record_player_intent: recordPlayerIntentInputSchema,
  record_dialogue_outcome: recordDialogueOutcomeInputSchema,
  record_world_fact: recordWorldFactInputSchema,
  add_tag: addTagInputSchema,
  remove_tag: removeTagInputSchema,
  set_relationship: setRelationshipInputSchema,
  add_chronicle_entry: addChronicleEntryInputSchema,
  log_event: logEventInputSchema,
  advance_time: advanceTimeInputSchema,
  offer_quick_actions: offerQuickActionsInputSchema,
  spawn_npc: spawnNpcInputSchema,
  promote_npc: promoteNpcInputSchema,
  spawn_item: spawnItemInputSchema,
  reveal_location: revealLocationInputSchema,
  request_contested_outcome: requestContestedOutcomeInputSchema,
  set_condition: setConditionInputSchema,
  move_to: moveToInputSchema,
  transfer_item: transferItemInputSchema,
} = runtimeToolInputSchemas;


/**
 * Create Storyteller tools bound to a specific campaign and tick.
 * Returns a tools object suitable for passing to streamText().
 */
export function createStorytellerTools(
  campaignId: string,
  tick: number,
  outcomeTier?: string,
  executionContext?: ToolExecutionContext,
) {
  let executionQueue = Promise.resolve();
  const executeRuntimeTool = (
    toolName: RuntimeToolName,
    args: Record<string, unknown>,
    toolOutcomeTier?: string,
  ) => {
    if (!executionContext && toolRequiresExecutionAuthority(toolName)) {
      return Promise.resolve(
        buildValidationFailureToolResult(
          `${toolName} is model-facing and state-bearing; createStorytellerTools requires an execution context with authority before executing it.`,
        ),
      );
    }
    const run = executionQueue.then(() =>
      executeToolCall(
        campaignId,
        toolName,
        args,
        tick,
        toolOutcomeTier,
        executionContext,
      ),
    );
    executionQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  const executeBridgeLookupTool = (
    toolName: BridgeLookupToolName,
    args: Record<string, unknown>,
  ) => executeBridgeCandidateTool(toolName, args, executionContext);

  return {
    list_visible_affordances: tool({
      description:
        "Observation-only lookup. List current visible affordances, legal targets, legal movement, visible fact refs, and allowed tools without mutating world state.",
      inputSchema: listVisibleAffordancesInputSchema,
      execute: (args) => executeBridgeLookupTool("list_visible_affordances", args),
    }),

    list_navigation_options: tool({
      description:
        "Observation-only lookup. Return visible/legal navigation options from model-facing movement candidates; never invent or reveal hidden routes.",
      inputSchema: listNavigationOptionsInputSchema,
      execute: (args) => executeBridgeLookupTool("list_navigation_options", args),
    }),

    find_location_candidates: tool({
      description:
        "Observation-only lookup. Fuzzy-match visible legal locations and movement refs by player-facing words or tags.",
      inputSchema: bridgeCandidateQueryInputSchema,
      execute: (args) => executeBridgeLookupTool("find_location_candidates", args),
    }),

    find_object_candidates: tool({
      description:
        "Observation-only lookup. Fuzzy-match visible object/item candidates only; hidden/offscreen objects are denied by omission.",
      inputSchema: bridgeCandidateQueryInputSchema,
      execute: (args) => executeBridgeLookupTool("find_object_candidates", args),
    }),

    find_actor_candidates: tool({
      description:
        "Observation-only lookup. Fuzzy-match clear visible actor candidates only; hidden/offscreen actor names are never returned.",
      inputSchema: findActorCandidatesInputSchema,
      execute: (args) => executeBridgeLookupTool("find_actor_candidates", args),
    }),

    find_poi_candidates: tool({
      description:
        "Observation-only lookup. Find visible/current-area POI candidates or a generic potential local POI hint when explicitly requested.",
      inputSchema: findPoiCandidatesInputSchema,
      execute: (args) => executeBridgeLookupTool("find_poi_candidates", args),
    }),

    inspect_known_fact: tool({
      description:
        "Observation-only lookup. Inspect only player-visible or player-known facts; private/offscreen facts deny without naming them.",
      inputSchema: inspectKnownFactInputSchema,
      execute: (args) => executeBridgeLookupTool("inspect_known_fact", args),
    }),

    check_route: tool({
      description:
        "Observation-only lookup. Check whether a destination ref is already here or a visible legal movement route; illegal/hidden routes deny without leaks.",
      inputSchema: checkRouteInputSchema,
      execute: (args) => executeBridgeLookupTool("check_route", args),
    }),

    move_actor: tool({
      description:
        "State-bearing bridge. Move only the current player/subject actor along a legal movement candidate backed by visible destination labels/current aliases or route/check_route helper aliases; returns destination, path, travel cost, and actor refs.",
      inputSchema: moveActorInputSchema,
      execute: (args) => executeRuntimeTool("move_actor", args),
    }),

    create_minor_poi: tool({
      description:
        "State-bearing bridge. Create only an ordinary local low-impact public POI in current scope: tea stall, street vendor, shrine desk, notice board, or courier desk. Rejects secret, remote, faction, rare, key, or plot-critical places.",
      inputSchema: createMinorPoiInputSchema,
      execute: (args) => executeRuntimeTool("create_minor_poi", args),
    }),

    create_scene_extra: tool({
      description:
        "State-bearing bridge. Create only a temporary visible service/witness/crowd/support extra in current_scene/current_location; not a key or persistent NPC.",
      inputSchema: createSceneExtraInputSchema,
      execute: (args) => executeRuntimeTool("create_scene_extra", args),
    }),

    start_search: tool({
      description:
        "State-bearing bridge. Record that the current actor starts searching; does not create a found target, proof, or discovery.",
      inputSchema: startSearchInputSchema,
      execute: (args) => executeRuntimeTool("start_search", args),
    }),

    record_player_intent: tool({
      description:
        "State-bearing bridge. Record player intent, stance, or claim as unconfirmed; does not make the hinted target true.",
      inputSchema: recordPlayerIntentInputSchema,
      execute: (args) => executeRuntimeTool("record_player_intent", args),
    }),

    record_dialogue_outcome: tool({
      description:
        "State-bearing semantic dialogue outcome. Use for an NPC/source answer, refusal, silence, gesture, warning, redirect, unavailable role, or no-current-answer result. Outcome semantics live in enum fields; quote/summary may be any language and are display/evidence only.",
      inputSchema: recordDialogueOutcomeInputSchema,
      execute: (args) => executeRuntimeTool("record_dialogue_outcome", args),
    }),

    record_world_fact: tool({
      description:
        "State-bearing semantic world fact. Use when the player compares, verifies, or records future-usable public/known facts without an NPC dialogue outcome. Semantics live in sourceKind/truthStatus/factKind/topicKind/claims; summary may be any language and is display/evidence only. claims[].subjectRef, subjectRefs, and sourceRefs use visible labels/current aliases/helper aliases only; put ordinary labels like notice board or route-log mismatch in subjectText.",
      inputSchema: recordWorldFactInputSchema,
      execute: (args) => executeRuntimeTool("record_world_fact", args),
    }),

    add_tag: tool({
      description:
        "Add a tag to an entity (player, NPC, location, item, or faction). Tags represent traits, states, skills, relationships. For document/proof items, use this for durable states such as reviewed, officially-unsealed, docketed, stamped, receipt, or warning-rider.",
      inputSchema: addTagInputSchema,
      execute: (args) => executeRuntimeTool("add_tag", args),
    }),

    remove_tag: tool({
      description:
        "Remove a tag from an entity. Use when a state, trait, or condition no longer applies.",
      inputSchema: removeTagInputSchema,
      execute: (args) => executeRuntimeTool("remove_tag", args),
    }),

    set_relationship: tool({
      description:
        "Set or update a relationship between two entities. Upserts -- creating or updating the relationship.",
      inputSchema: setRelationshipInputSchema,
      execute: (args) => executeRuntimeTool("set_relationship", args),
    }),

    add_chronicle_entry: tool({
      description:
        "Record a significant event in the campaign chronicle. Use for major story beats, discoveries, or turning points.",
      inputSchema: addChronicleEntryInputSchema,
      execute: (args) => executeRuntimeTool("add_chronicle_entry", args),
    }),

    log_event: tool({
      description:
        "Log a scene beat. Use scene_local for attempted, refused, witnessed, conversational, sensory/non-durable, or bluff beats. Use durable only for future-relevant facts that should matter later; never use durable log_event itself to grant possession, access, item use, document state, route revelation, or completed movement.",
      inputSchema: logEventInputSchema,
      execute: (args) => executeRuntimeTool("log_event", args),
    }),

    advance_time: tool({
      description:
        "Advance the campaign clock when the player intentionally waits, travels, rests, shops, observes, or otherwise spends meaningful in-world time. The GM chooses minutes from the action and scene; backend only validates and commits the clock advance.",
      inputSchema: advanceTimeInputSchema,
      execute: (args) => executeRuntimeTool("advance_time", args),
    }),

    offer_quick_actions: tool({
      description:
        "Suggest 3-5 quick action options for the player to choose from. Keep the options varied, concrete, and grounded in the current scene, present NPCs, available items, and visible threats.",
      inputSchema: offerQuickActionsInputSchema,
      execute: (args) => executeRuntimeTool("offer_quick_actions", args),
    }),

    spawn_npc: tool({
      description:
        "Spawn a temporary support NPC only when a concrete local actor is needed for play or future pressure. Use current_scene/current_location; never copy backend location ids or assistant prose to introduce a continuing actor, and never use this to pretend an unrevealed room exists.",
      inputSchema: spawnNpcInputSchema,
      execute: (args) => executeRuntimeTool("spawn_npc", args),
    }),

    promote_npc: tool({
      description:
        "Promote a visible temporary NPC upward to persistent or key when the scene makes them future-relevant.",
      inputSchema: promoteNpcInputSchema,
      execute: (args) => executeRuntimeTool("promote_npc", args),
    }),

    spawn_item: tool({
      description:
        "Spawn a tangible, persistent item that the player or visible actors can later inspect, use, own, carry, transfer, or owe action around. Spawn every future-usable receipt, docket, warning rider, stamp, permit, proof artifact, or document the player may later cite, with document/state tags. Do not leave future-relevant props or obligations only in assistant prose. Do not create casual props, set dressing, atmospheric details, or generic scenery.",
      inputSchema: spawnItemInputSchema,
      execute: (args) => executeRuntimeTool("spawn_item", args),
    }),

    reveal_location: tool({
      description:
        "Reveal a new local sublocation/ephemeral scene and connect it to an existing legal local anchor. Use connectedToName current_scene/current_location unless copying an exact legal ref; use before moving into, populating, or making future-relevant a newly discovered room, back area, booth, alley mouth, recessed door, narrow stair, or other specific route/place.",
      inputSchema: revealLocationInputSchema,
      execute: (args) => executeRuntimeTool("reveal_location", args),
    }),

    request_contested_outcome: tool({
      description:
        "Ask the backend rules for bounded actor-vs-actor contest/combat authority before narrating or committing a hit, escape, capture, restraint, pursuit, or defense result. This returns allowed/prohibited consequences and does not itself change HP, position, inventory, tags, or relationships.",
      inputSchema: requestContestedOutcomeInputSchema,
      execute: (args) => executeRuntimeTool("request_contested_outcome", args),
    }),

    set_condition: tool({
      description:
        "Modify a player character's HP when violence, injury, healing, or combat aftermath changes durable player condition. Use delta for relative damage or healing, or value for an absolute HP set. Only works on player characters, not NPCs.",
      inputSchema: setConditionInputSchema,
      execute: (args) => executeRuntimeTool("set_condition", args, outcomeTier),
    }),

    move_to: tool({
      description:
        "Move the player to a connected location by targetLocationName when travel to an established destination succeeds. Do not describe completed route traversal in assistant prose unless a successful move_to observation or existing state already supports it.",
      inputSchema: moveToInputSchema,
      execute: (args) => executeRuntimeTool("move_to", args),
    }),

    transfer_item: tool({
      description:
        "Transfer an existing item to a different character/actor/NPC/player or location. Use targetType character for actors; npc/player/actor aliases are accepted. Character targets can optionally equip the item; location targets always drop it carried and unequipped. For partial payments, deposits, split stacks, or bundled resources, provide transferredItemName and remainingItemName to atomically split the source item while preserving the old holder's remainder.",
      inputSchema: transferItemInputSchema,
      execute: (args) => executeRuntimeTool("transfer_item", args),
    }),
  };
}
