import { runtimeToolInputSchemas, type RuntimeToolName } from "./tool-schemas.js";

export const ENGINE_CONTRACT_MARKER_PREFIX = "STRUCTURED_OUTPUT_CONTRACT:";

const runtimeToolNames = Object.keys(runtimeToolInputSchemas) as RuntimeToolName[];
const hiddenAdjudicationToolNames = runtimeToolNames.filter(
  (toolName) => toolName !== "request_contested_outcome",
);

const runtimeToolInputShapes = {
  list_visible_affordances: [
    '{ "scope"?: "current_scene"|"current_location"|"visible"|"known", "maxResults"?: integer 1-8 }',
    "Observation-only lookup; returns visible/legal affordances and refs without world mutation.",
  ],
  list_navigation_options: [
    '{ "actorRef"?: string, "fromLocationRef"?: string, "maxResults"?: integer 1-8 }',
    "Observation-only lookup over visible legal movement options.",
  ],
  find_location_candidates: [
    '{ "query": string, "scope"?: "current_scene"|"current_location"|"visible"|"known", "tags"?: string[], "maxResults"?: integer 1-8 }',
    "Observation-only fuzzy lookup over visible legal location/movement refs.",
  ],
  find_object_candidates: [
    '{ "query": string, "scope"?: "current_scene"|"current_location"|"visible"|"known", "tags"?: string[], "maxResults"?: integer 1-8 }',
    "Observation-only fuzzy lookup over visible item/object refs.",
  ],
  find_actor_candidates: [
    '{ "query": string, "relationHint"?: string, "scope"?: "current_scene"|"current_location"|"visible"|"known", "tags"?: string[], "maxResults"?: integer 1-8 }',
    "Observation-only fuzzy lookup over clear visible actor refs only.",
  ],
  find_poi_candidates: [
    '{ "query": string, "areaRef"?: string, "includePotential"?: boolean, "scope"?: "current_scene"|"current_location"|"visible"|"known", "tags"?: string[], "maxResults"?: integer 1-8 }',
    "Observation-only POI lookup; potential hints are current-area only and still not world mutation.",
  ],
  inspect_known_fact: [
    '{ "query"?: string, "ref"?: string, "scope"?: "current_scene"|"current_location"|"visible"|"known", "maxResults"?: integer 1-8 }',
    "Observation-only fact lookup; returns only player-visible/player-known facts or a generic denial.",
  ],
  check_route: [
    '{ "destinationRef": string, "actorRef"?: string, "mode"?: "walk"|"travel"|"follow_route"|"unknown" }',
    "Observation-only route check over visible legal movement refs; hidden routes deny without names.",
  ],
  move_actor: [
    '{ "actorRef"?: string, "destinationRef": string, "routeId"?: string, "mode"?: "walk"|"travel"|"follow_route"|"unknown", "intentSummary"?: string, "evidenceRefs": string[] }',
    "Move only the current player/subject actor along a legal movement candidate backed by route/check_route evidence.",
    "Returns destination, path, travel cost, and actor refs; do not narrate completed movement without a successful result.",
  ],
  create_minor_poi: [
    '{ "areaRef"?: string, "poiType": "tea_stall"|"street_vendor"|"shrine_desk"|"notice_board"|"courier_desk", "name"?: string, "description"?: string, "tags"?: string[], "persistence"?: "scene_local"|"ephemeral", "visibility"?: "public"|"visible", "reason": string }',
    "Create only ordinary local low-impact public POIs in current scope.",
    "Reject secret, remote, faction, rare, weapon, key, or plot-critical places.",
  ],
  create_scene_extra: [
    '{ "locationRef"?: "current_scene"|"current_location", "role": "service"|"witness"|"crowd"|"support"|"vendor"|"courier"|"clerk"|"porter", "name"?: string, "tags"?: string[], "persistence"?: "temporary", "visibility"?: "visible", "reason": string }',
    "Create only a temporary visible current-scene/current-location support extra.",
    "Do not create key, persistent, remote, secret, or plot-critical NPCs.",
  ],
  start_search: [
    '{ "actorRef"?: string, "query": string, "scope"?: "current_scene"|"current_location"|"visible", "method"?: "look"|"ask"|"inspect"|"listen"|"track"|"browse", "intentSummary"?: string }',
    "Record an active search/intent only; never create a found target, proof, or discovery.",
  ],
  record_player_intent: [
    '{ "actorRef"?: string, "intentType": "seek"|"ask"|"claim"|"avoid"|"follow"|"inspect"|"negotiate"|"travel"|"other", "targetHint"?: string, "stance"?: "intends"|"claims"|"suspects"|"asks"|"refuses"|"offers"|"unknown", "summary"?: string }',
    "Record player intent, stance, or claim as unconfirmed; do not make hinted target truth.",
  ],
  record_dialogue_outcome: [
    '{ "speakerRef"?: string, "addresseeRefs": string[], "outcomeKind": "answered"|"refused"|"silent"|"gestured"|"warned"|"redirected"|"unavailable"|"no_current_answer", "topicKind": "social"|"procedure"|"permission"|"proof"|"route"|"safety"|"trade"|"status"|"other", "authorityKind": "role_authority"|"public_service"|"witness"|"hearsay"|"not_authorized"|"no_visible_authority"|"unknown", "truthStatus": "settled_by_backend"|"speaker_asserted"|"unconfirmed"|"contested"|"conflicting", "durability": "durable"|"scene_local", "futureUseKind"?: "route_choice"|"permission_check"|"evidence"|"safety"|"obligation"|"npc_memory"|"relationship"|"other", "futureRelevance"?: string, "requestedRoleText"?: string, "quote"?: string, "summary": string, "claims"?: [{ "claimKind": "requirement"|"permission"|"prohibition"|"office"|"route_status"|"warning"|"lead"|"document_status"|"other", "polarity": "allows"|"denies"|"requires"|"redirects"|"unknown"|"states", "subjectRef"?: string, "subjectText"?: string, "summary": string }], "sourceRefs": string[] }',
    "Use for NPC/source answer, refusal, silence, gesture, warning, redirect, unavailable role, or no-current-answer outcomes.",
    "Semantics live in enum fields and structured claims. quote/summary/futureRelevance may be any language and are never parsed to decide whether an answer happened.",
    "Durable outcomes require futureUseKind and futureRelevance. Durable procedural answered/warned/redirected outcomes require at least one claim.",
    "Use unavailable/no_current_answer with authorityKind no_visible_authority and requestedRoleText when the requested role/office is not visibly reachable.",
  ],
  record_world_fact: [
    '{ "sourceKind": "direct_observation"|"public_record"|"report_message"|"rumor"|"claim"|"comparison"|"memory"|"other", "truthStatus": "observed"|"verified"|"reported"|"rumored"|"claimed"|"believed"|"disputed"|"unknown", "factKind": "public_record"|"procedure"|"route_status"|"permission_boundary"|"warning"|"lead"|"status"|"contradiction"|"gap"|"other", "topicKind": "social"|"procedure"|"permission"|"proof"|"route"|"safety"|"trade"|"status"|"other", "durability": "durable", "futureUseKind": "route_choice"|"permission_check"|"evidence"|"safety"|"obligation"|"npc_memory"|"relationship"|"other", "futureRelevance": string, "summary": string, "claims": [{ "claimKind": "public_record"|"requirement"|"permission_boundary"|"prohibition"|"office"|"route_status"|"warning"|"lead"|"status"|"contradiction"|"gap"|"other", "polarity": "allows"|"denies"|"requires"|"redirects"|"unknown"|"states", "subjectRef"?: string, "subjectText"?: string, "summary": string }], "subjectRefs"?: string[], "sourceRefs": string[] }',
    "Use when the player compares, verifies, or records future-usable public/known facts without an NPC/source dialogue outcome.",
    "Semantics live in sourceKind/truthStatus/factKind/topicKind/claims. summary/futureRelevance may be any language and are not parsed to decide the fact.",
    "sourceRefs, subjectRefs, and claims[].subjectRef must be visible/current refs or player-known fact refs returned by the frame/lookup tools.",
    "If a subject is an ordinary label such as notice board, posted date, route-log mismatch, office name, permit, or procedure, put it in claims[].subjectText, not subjectRef.",
    "Use truthStatus unknown only for factKind gap or contradiction; do not turn unknowns into positive facts.",
  ],
  add_tag: [
    '{ "entityName": string, "entityType": "player"|"npc"|"location"|"item"|"faction", "tag": string }',
    "Use lowercase, hyphenated tags already justified by the current scene.",
  ],
  remove_tag: [
    '{ "entityName": string, "entityType": "player"|"npc"|"location"|"item"|"faction", "tag": string }',
    "Remove only an existing or explicitly resolved state/tag.",
  ],
  set_relationship: [
    '{ "entityA": string, "entityB": string, "tag": string, "reason": string }',
    "Reason is a brief source-grounded relationship explanation.",
  ],
  add_chronicle_entry: [
    '{ "text": string }',
    "Text records a significant campaign chronicle event.",
  ],
  log_event: [
    '{ "text": string, "importance": number 1-10, "participants": string[], "durability"?: "durable"|"scene_local", "futureRelevance"?: string }',
    "Participants are explicit character/entity names from current context.",
    'Default durability is "scene_local"; scene_local beats are not persisted to episodic memory, location recent events, pending committed facts, or reflection inputs.',
    'Use durability "durable" only for future-relevant facts and include futureRelevance explaining why this should matter later.',
    "Participants must be clear local/current actors from model-facing refs; omit names from participants if they appear only in recent transcript or memory.",
    "Do not use durable log_event to grant or confirm player possession, access, item-use, or completed movement claims; those require a successful concrete backend tool/state result first.",
    "If the player is bluffing, requesting, attempting, being refused, or being merely witnessed, record the beat as scene_local or use a concrete state tool for the NPC/location consequence.",
    "Routine direct beats such as asking a price, paying for coffee, sitting down, greeting, or service flavor should stay scene_local.",
    "Durable examples: promised to return, made an enemy, found a hidden door, changed faction standing.",
  ],
  advance_time: [
    '{ "minutes": integer 1-525600, "reason": string }',
    "Use when a player action intentionally spends meaningful in-world time: waiting, travel, resting, shopping, observing, training, research, downtime, or stated elapsed duration.",
    "The GM chooses the elapsed minutes from the player action and scene context; backend only validates and commits the clock.",
    "Call this before other state tools for the same elapsed-time beat so due-world-work and later observations see the correct world time.",
    "Do not use this for instant actions or as a substitute for movement, item, condition, relationship, or memory tools.",
  ],
  offer_quick_actions: [
    '{ "actions": [{ "label": string, "action": string }] }',
    "Provide 3-5 actions. label max 80 chars; action max 220 chars and must be the full text if selected.",
  ],
  spawn_npc: [
    '{ "name": string, "tags": string[], "locationRef"?: "current_scene"|"current_location", "locationId"?: string, "locationName"?: string }',
    "Prefer locationRef=current_scene/current_location. locationId is allowed only when exposed in legal refs; locationName is legacy only.",
    "Spawn only if the current local facts justify a new temporary NPC.",
  ],
  promote_npc: [
    '{ "npcRef": string, "newTier": "persistent"|"key", "reason": string }',
    "npcRef must be a visible current-scene NPC id or name.",
    "Promote only upward when the NPC became future-relevant; do not promote routine one-scene support actors.",
  ],
  spawn_item: [
    '{ "name": string, "tags": string[], "ownerName": string, "ownerType": "character"|"location" }',
    "Owner must be an explicit character or location.",
  ],
  reveal_location: [
    '{ "name": string, "description": string, "tags": string[], "connectedToName": string }',
    "Reveal only a location justified by the current scene/world facts.",
    'Use connectedToName "current_scene" or "current_location" unless copying an exact legal ref from the model-facing view; do not shorten or paraphrase location labels.',
  ],
  request_contested_outcome: [
    '{ "actorName": string, "targetName": string, "mode": "attack"|"restrain"|"escape"|"pursue"|"defend"|"contest", "intent": string, "stakes": string, "evidenceRefs": string[] }',
    "Use before committing combat or active opposition outcomes such as hits, captures, escapes, restraints, or defenses.",
    "The result supplies backend bounds only; apply HP, movement, inventory, tags, or relationships with separate successful tools.",
  ],
  set_condition: [
    '{ "targetName": string, "delta": number } or { "targetName": string, "value": number 0-5 }',
    "Use delta for damage/healing or value for an absolute HP set.",
  ],
  move_to: [
    '{ "targetLocationName": string }',
    "Destination must be an established connected location.",
  ],
  transfer_item: [
    '{ "itemName": string, "targetName": string, "targetType": "character", "equipState"?: "carried"|"equipped", "equippedSlot"?: string }',
    '{ "itemName": string, "targetName": string, "targetType": "location" }',
    "Transfer only an existing item to an explicit character or location.",
  ],
} satisfies Record<RuntimeToolName, string[]>;

const runtimeToolExampleInputs = {
  list_visible_affordances: '{ "scope": "visible", "maxResults": 6 }',
  list_navigation_options: '{ "actorRef": "Player", "maxResults": 6 }',
  find_location_candidates: '{ "query": "tea stall", "tags": ["shop"], "maxResults": 4 }',
  find_object_candidates: '{ "query": "sealed letter", "maxResults": 4 }',
  find_actor_candidates: '{ "query": "warden", "relationHint": "speaker", "maxResults": 3 }',
  find_poi_candidates: '{ "query": "tea shop", "includePotential": true, "maxResults": 4 }',
  inspect_known_fact: '{ "query": "bridge key", "scope": "known", "maxResults": 2 }',
  check_route: '{ "actorRef": "Player", "destinationRef": "Old Shrine Road", "mode": "walk" }',
  move_actor:
    '{ "actorRef": "Player", "destinationRef": "Old Shrine Road", "routeId": "Old Shrine Road", "mode": "walk", "intentSummary": "The player follows the obvious road.", "evidenceRefs": ["Old Shrine Road"] }',
  create_minor_poi:
    '{ "areaRef": "current_location", "poiType": "tea_stall", "name": "Lantern Tea Stall", "reason": "The public market supports ordinary tea service." }',
  create_scene_extra:
    '{ "locationRef": "current_scene", "role": "courier", "name": "Local Courier", "reason": "The current courier desk needs a temporary clerk to answer routine questions." }',
  start_search:
    '{ "actorRef": "Player", "query": "tea stall", "scope": "current_location", "method": "browse", "intentSummary": "The player looks for a place to drink tea." }',
  record_player_intent:
    '{ "actorRef": "Player", "intentType": "seek", "targetHint": "tea stall", "stance": "intends", "summary": "The player wants to find tea without knowing an exact shop id." }',
  record_dialogue_outcome:
    '{ "speakerRef": "Road Warden", "addresseeRefs": ["Player"], "outcomeKind": "answered", "topicKind": "proof", "authorityKind": "role_authority", "truthStatus": "speaker_asserted", "durability": "durable", "futureUseKind": "permission_check", "futureRelevance": "The named proof requirement controls later lawful passage attempts.", "quote": "Bring a seal-verified transit chit to the registry desk.", "summary": "The warden names the required proof.", "claims": [{ "claimKind": "requirement", "polarity": "requires", "subjectText": "seal-verified transit chit", "summary": "A seal-verified transit chit is required." }], "sourceRefs": ["Road Warden", "Player"] }',
  record_world_fact:
    '{ "sourceKind": "comparison", "truthStatus": "disputed", "factKind": "contradiction", "topicKind": "procedure", "durability": "durable", "futureUseKind": "route_choice", "futureRelevance": "The contradiction should guide which office the player asks before choosing a route.", "summary": "The posted date and the route log do not currently agree; treat the mismatch as unresolved.", "claims": [{ "claimKind": "contradiction", "polarity": "unknown", "subjectText": "posted date vs route log", "summary": "The date mismatch is unresolved." }], "subjectRefs": ["route log"], "sourceRefs": ["Player"] }',
  add_tag: '{ "entityName": "Road Warden", "entityType": "npc", "tag": "alert" }',
  remove_tag:
    '{ "entityName": "Road Warden", "entityType": "npc", "tag": "distracted" }',
  set_relationship:
    '{ "entityA": "Player", "entityB": "Road Warden", "tag": "cautious", "reason": "The player asked direct questions at the gate." }',
  add_chronicle_entry:
    '{ "text": "The road warden warned the player about fresh tracks near the gate." }',
  log_event:
    '{ "text": "The road warden promises to guide the player at dawn.", "importance": 6, "participants": ["Road Warden", "Player"], "durability": "durable", "futureRelevance": "This promise should affect future travel and trust." }',
  advance_time:
    '{ "minutes": 60, "reason": "The player spends an hour watching canal traffic instead of delivering the message." }',
  offer_quick_actions:
    '{ "actions": [{ "label": "Ask about the road", "action": "Ask the road warden what happened here." }, { "label": "Inspect tracks", "action": "Inspect the muddy tracks near the gate." }, { "label": "Keep moving", "action": "Continue toward the shrine while staying alert." }] }',
  spawn_npc:
    '{ "name": "Market Runner", "tags": ["messenger"], "locationRef": "current_scene" }',
  promote_npc:
    '{ "npcRef": "Market Runner", "newTier": "persistent", "reason": "The runner agreed to carry future messages for the player." }',
  spawn_item:
    '{ "name": "Mud-Spattered Token", "tags": ["clue"], "ownerName": "Town Gate", "ownerType": "location" }',
  reveal_location:
    '{ "name": "Old Shrine Road", "description": "A narrow path leaving the gate toward the forest shrine.", "tags": ["road"], "connectedToName": "current_location" }',
  request_contested_outcome:
    '{ "actorName": "Road Warden", "targetName": "Player", "mode": "restrain", "intent": "Stop the player from forcing the gate.", "stakes": "Whether the warden can pin the player before they slip through.", "evidenceRefs": ["Road Warden", "Player"] }',
  set_condition: '{ "targetName": "Road Warden", "delta": -1 }',
  move_to: '{ "targetLocationName": "Old Shrine Road" }',
  transfer_item:
    '{ "itemName": "Gate Key", "targetName": "Player", "targetType": "character", "equipState": "carried" }',
} satisfies Record<RuntimeToolName, string>;

function selectRuntimeToolNames(toolNames?: readonly RuntimeToolName[]): RuntimeToolName[] {
  if (!toolNames) return runtimeToolNames;
  const allowed = new Set(toolNames);
  return runtimeToolNames.filter((toolName) => allowed.has(toolName));
}

function buildRuntimeToolCallExample(
  toolName: RuntimeToolName,
  fieldName: "input" | "payload",
): string {
  return `{ "toolName": "${toolName}", "${fieldName}": ${runtimeToolExampleInputs[toolName]} }`;
}

function buildRuntimeToolValidExampleLines(
  selectedToolNames: readonly RuntimeToolName[],
): string[] {
  if (selectedToolNames.length === 0) {
    return [
      "Compact valid example:",
      "- none; no runtime tools are allowed for this call.",
    ];
  }

  return [
    "Compact valid examples:",
    ...selectedToolNames.map((toolName) => `- ${buildRuntimeToolCallExample(toolName, "input")}`),
  ];
}

function buildRuntimeToolInvalidExampleLines(
  selectedToolNames: readonly RuntimeToolName[],
): string[] {
  if (selectedToolNames.length === 0) {
    return [
      "Invalid examples:",
      "- any runtime tool call is invalid because no runtime tools are allowed for this call.",
    ];
  }

  const invalidExamples: string[] = [];

  if (selectedToolNames.includes("offer_quick_actions")) {
    invalidExamples.push(
      '- missing "actions[].action": { "toolName": "offer_quick_actions", "input": { "actions": [{ "label": "Look around" }] } }',
    );
  }

  const payloadExampleToolName = selectedToolNames.includes("log_event")
    ? "log_event"
    : selectedToolNames[0];
  invalidExamples.push(
    `- payload in primary output: ${buildRuntimeToolCallExample(payloadExampleToolName, "payload")}`,
    '- unsupported toolName: { "toolName": "search_environment", "input": { "query": "anything" } }',
  );

  return ["Invalid examples:", ...invalidExamples];
}

export function buildRuntimeToolInputContract(options: {
  toolNames?: readonly RuntimeToolName[];
} = {}): string {
  const selectedToolNames = selectRuntimeToolNames(options.toolNames);
  const allowedToolList =
    selectedToolNames.length > 0
      ? selectedToolNames.map((toolName) => `"${toolName}"`).join(", ")
      : "(none)";
  const toolSections = selectedToolNames.map((toolName) => {
    const [shape, ...notes] = runtimeToolInputShapes[toolName];
    return [
      `- "${toolName}" input: ${shape}`,
      ...notes.map((note) => `  - ${note}`),
    ].join("\n");
  });

  return [
    "RUNTIME TOOL INPUT CONTRACT",
    `Allowed RuntimeToolName values from runtimeToolInputSchemas: ${allowedToolList}.`,
    "Every planned tool call must use { \"toolName\": RuntimeToolName, \"input\": object }.",
    "Use input as the primary field. \"payload\" is compatibility-only and must not be emitted in primary output.",
    "Runtime tool input shapes:",
    toolSections.length > 0 ? toolSections.join("\n") : "- none",
    "",
    ...buildRuntimeToolValidExampleLines(selectedToolNames),
    "",
    "This section defines nested runtime tool calls only. Use the caller-specific minimal output below for the complete top-level JSON object.",
    "",
    ...buildRuntimeToolInvalidExampleLines(selectedToolNames),
    "",
    "Backend authority:",
    "backend owns IDs, reference resolution, trimming, caps, alias compatibility, execution, and final validation.",
    "Backend must not invent source truth, actor intent, targets, lore, quick-action labels, tool actions, or canonical facts to make validation pass.",
  ].join("\n");
}

export function buildScenePlannerPromptContract(options: {
  allowedTools?: readonly RuntimeToolName[];
} = {}): string {
  return [
    `${ENGINE_CONTRACT_MARKER_PREFIX} scene-planner.v1`,
    "Return one semantic ScenePlan JSON object only.",
    "GM decision path is binding for this turn. Do not change direct, continue, clarification, roll_oracle, tool_plan, or combat_transition into another path.",
    "Oracle outcome is present only when a GM roll_oracle decision requested backend randomness; when present, it is binding. Do not request or invent a fresh Oracle result from ScenePlanner.",
    "Direct, continue, and clarification decisions may produce plannedActions: [] and must not manufacture mutating tools.",
    "Tool and combat plans must use concrete refs/tools from candidates and ALLOWED TOOLS. Tool/combat paths may consume an existing Oracle result, but must not trigger Oracle directly.",
    "Top-level fields: actionInterpretation, primaryResponse, supportResponses, plannedActions, deferredHooks, hiddenRationale.",
    'plannedActions shape: { "plannedActions": [{ "toolName": RuntimeToolName, "input": object }] } with optional actorRef.',
    "Use actorRef values from allowed actor ids or labels only. Backend maps refs and validates with semanticScenePlanSchema.",
    "backend will generate event/action/response/narrator IDs; backend generates event/action/response/narrator IDs deterministically. Do not output id, eventId, actionId, responseId, narratorFacts, actionIds, responseIds, or toolResultRefs.",
    buildRuntimeToolInputContract({ toolNames: options.allowedTools }),
    "ScenePlanner minimal valid output:",
    '{ "actionInterpretation": { "actorRef": "Player", "intent": "ask a question", "targetRefs": [] }, "primaryResponse": { "actorRef": "Player", "responseKind": "spoken", "visibleToPlayer": true, "targetRefs": [] }, "supportResponses": [], "plannedActions": [], "deferredHooks": [], "hiddenRationale": "" }',
    "ScenePlanner anti-patterns: missing nested actions[].action, unsupported toolName, payload instead of input, model-generated backend IDs.",
  ].join("\n");
}

export function buildGmTurnDecisionPromptContract(options: {
  allowedTools?: readonly RuntimeToolName[];
} = {}): string {
  return [
    `${ENGINE_CONTRACT_MARKER_PREFIX} gm-turn-decision.v1`,
    "Return one GmTurnDecision JSON object only.",
    'Allowed path values exactly: "direct", "roll_oracle", "tool_plan", "combat_transition", "clarification", "continue".',
    "Inputs to interpret: raw playerAction text, neutral SceneFrame evidence, candidate refs from the frame only, and allowed tools from frame.allowedTools.",
    "No required Act/Speak/Observe command mode. Do not invent action categories.",
    "Backend authority: backend owns IDs, validation, allowed tools, deterministic math, random rolls, persistence, rollback, and final truth.",
    "GM proposes fictional interpretation and candidate-backed refs only; backend validates and executes.",
    "Do not author time, stat, inventory, location, relationship, HP, condition, persistence, or state delta fields outside validated tool proposals.",
    "Do not invent target/tool semantics. Missing required target/tool meaning must fail closed as clarification or invalid output.",
    "roll_oracle is the only path that may request backend randomness or Oracle. If a tool/combat outcome needs uncertainty, choose roll_oracle first; later tool/combat planning may consume the existing roll result but must not request a second roll.",
    "Per-path required fields:",
    '- direct: { "path": "direct", "directResolutionNotes": string, "narrationGuidance"?: string } only; no state deltas.',
    '- continue: { "path": "continue", "continuationGuidance": string } only; no invented action category.',
    '- clarification: { "path": "clarification", "clarificationPrompt": string }.',
    '- roll_oracle: { "path": "roll_oracle", "rollRequest": { "actorRef": string, "targetRef"?: string, "question": string, "stakes": string, "evidenceRefs": string[] } }.',
    '- tool_plan: { "path": "tool_plan", "plannedTools": [{ "toolName": RuntimeToolName, "actorRef": string, "targetRefs": string[], "input": object, "evidenceRefs": string[] }] }; no rollRequest.',
    '- combat_transition: { "path": "combat_transition", "actorRef": string, "targetRef": string, "combatFraming": string, "stakes": string, "evidenceRefs": string[] }; no rollRequest.',
    "",
    buildRuntimeToolInputContract({ toolNames: options.allowedTools }),
    "",
    "Compact valid path examples:",
    '{ "path": "direct", "directResolutionNotes": "Answer the greeting without mechanics.", "evidenceRefs": ["Player"] }',
    '{ "path": "continue", "continuationGuidance": "Let the scene breathe around the current tension.", "evidenceRefs": ["current-scene"] }',
    '{ "path": "clarification", "clarificationPrompt": "Which door are you opening?", "evidenceRefs": ["north-door", "south-door"] }',
    '{ "path": "roll_oracle", "rollRequest": { "actorRef": "Player", "targetRef": "Road Warden", "question": "Does the warden believe the bluff?", "stakes": "Trust opens or closes the gate.", "evidenceRefs": ["Player", "Road Warden"] }, "evidenceRefs": ["Player", "Road Warden"] }',
    '{ "path": "tool_plan", "plannedTools": [{ "toolName": "log_event", "actorRef": "Player", "targetRefs": [], "input": { "text": "The player promises to return before dusk.", "importance": 6, "participants": ["Player"], "durability": "durable", "futureRelevance": "The promise should shape future NPC trust." }, "evidenceRefs": ["Player"] }], "evidenceRefs": ["Player"] }',
    '{ "path": "combat_transition", "actorRef": "Player", "targetRef": "Road Warden", "combatFraming": "The player commits to an attack.", "stakes": "Whether the warden can answer before harm lands.", "evidenceRefs": ["Player", "Road Warden"] }',
    "",
    "Invalid examples: unsupported toolName, invented actor refs, missing required target for tool/combat paths, rollRequest on any path except roll_oracle, and free text over schema caps.",
  ].join("\n");
}

export function buildGmReadPromptContract(options: {
  allowedTools?: readonly RuntimeToolName[];
} = {}): string {
  const selectedToolNames = selectRuntimeToolNames(options.allowedTools);
  const allowedToolList =
    selectedToolNames.length > 0
      ? selectedToolNames.map((toolName) => `"${toolName}"`).join(", ")
      : "(none)";

  return [
    `${ENGINE_CONTRACT_MARKER_PREFIX} gm-read.v1`,
    "Return one GM Read JSON object only.",
    'Allowed path values exactly: "direct", "roll_oracle", "tool_plan", "combat_transition", "clarification", "continue".',
    "GM Read owns scene interpretation and path choice, not backend execution. RP turn job: read playerAction as a live request, identify the next playable beat, and choose the lightest path that makes the scene respond.",
    "One beat anchor: sceneQuestion is the immediate playable pressure for this turn; later tool execution and final narration must stay on it.",
    "runtimeRequirement is the typed runtime obligation for tool_plan. It tells the later tool loop what kind of outcome must be fulfilled; it is not a tool call and contains no payload.",
    'runtimeRequirement kinds: { "kind": "none" }, { "kind": "observation_read", "categories": ["visible_actors"|"visible_objects"|"routes"|"hazards"|"crowd"|"public_records"|"procedure"|"local_status"|"other"] }, { "kind": "dialogue_outcome", "durability": "scene_local"|"durable", "topicKind"?: "social"|"procedure"|"permission"|"proof"|"route"|"safety"|"trade"|"status"|"other" }, { "kind": "world_fact", "durability": "durable", "topicKind"?: same dialogue/world-fact topicKind }, { "kind": "scene_beat", "durability": "scene_local"|"durable" }, { "kind": "state_mutation" }.',
    'Use observation_read for broad observation/status scans. Do not put "observation" or "public_record" in dialogue_outcome/world_fact.topicKind; public records belong in observation_read.categories or record_world_fact.sourceKind/factKind.',
    'For direct, continue, clarification, roll_oracle, and combat_transition, omit runtimeRequirement or set { "kind": "none" }. For every tool_plan, include the narrowest non-none runtimeRequirement.',
    "Use direct for normal conversation, local description, ambient reaction, or a non-mutating NPC response from current visible facts only. Do not use direct, continue, or clarification for future-relevant concrete pressure such as named/role actors who keep acting, props, obligations, routes/doors/stairs, proofs, permits, waivers, authorisations, dispatch rules, permission boundaries, defensive posture, danger changes, or violence aftermath.",
    "Before returning direct, continue, or clarification, scan sceneQuestion, the path field, and narrationGuardrails. If any line would still matter after narration, switch path or remove that pressure. Path choice is the GM's job; Backend validates and may reject illegal no-mutation pressure.",
    "Use tool_plan only when world state must actually change, a fact must matter later, a scene affordance must be established, reusable NPC procedural/logistical information must be recorded, or a support actor/location must exist for the current fiction.",
    "If the player asks a visible authority, guard, clerk, warden, worker, assistant, witness, or service role for proof requirements, permits, permissions, rules, procedure, route status, dispatch rules, what changed, what changed today, which posted item/notice/rule/sign applies to a document or case, or any answer the player can rely on later, choose tool_plan. Do not use direct for reusable procedural answers.",
    "If the player asks whether they may/can send a message, contact a dispatch office, call for permission, keep waiting in place, use a public service, or follow an official communication procedure, choose tool_plan. That is reusable permission/logistical adjudication, even if the player is polite and stationary.",
    "If the player shows, compares, or asks which actual document, proof, permit, seal, credential, ledger, logbook, pass, or manifest satisfies or fails a stated requirement, choose tool_plan. The answer is reusable procedural adjudication, not a direct postcard.",
    "If the player compares, reconciles, audits, summarizes, marks contradictions, or labels uncertainty between prior procedural answers, official claims, warnings, safety rules, route restrictions, inspection results, ledgers, permits, proof requirements, or clerk/worker/authority statements, choose tool_plan. The comparison must be grounded and recorded so future route choices can use it.",
    "If the player asks to decide, choose, or identify the next practical move from accumulated evidence or options, do not choose clarification just to restate durable route/proof/obligation pressure. If evidence is sufficient, choose tool_plan with observation_read or world_fact to ground the available options/likely leads without committing the player's choice; if agency truly requires clarification, ask only a bounded diegetic choice question and keep sceneQuestion/clarificationPrompt free of future-relevant concrete pressure.",
    "Fuzzy bridge policy: bridge understandable low-risk navigation, search, and service-role intent with listed legal candidates; do not clarify solely because wording is not an exact backend string. If candidates are materially similar, choose one; if risk/cost/identity differs, ask a bounded diegetic 2-3 choice question.",
    "A request to follow, take, proceed along, or move via a public/indicated/legal/visible/previously listed route toward a named office, holding point, dispatch point, or safest lawful destination is enough movement intent for tool_plan. Do not choose clarification just because the route or destination is phrased as safest/generic; the tool loop can list, check, move, or record blocked/no-current-route.",
    "Clarification is allowed only for materially different risk/cost, irreversible high-impact action, contradictory intent, mechanically important target identity, or no fair playable bridge. Do not ask exact ID, backend target, route id, or connected-location questions when listed candidates can resolve the turn.",
    "Passive, tourist, waiting, travel, shopping, observation, or elapsed-time actions are not automatically postcards. The world is not waiting for the player; local pressure, visible NPC motives, due work, public services, or scoped pressure may advance.",
    "Before choosing direct for a passive/tourist action, ask whether current visible facts alone complete the beat and leave nothing future-relevant behind. If not, choose tool_plan, roll_oracle, or combat_transition.",
    "For broad observe, inspect, take stock, read-the-room, or status-read actions, answer the requested visible categories as a game state read. Clock advance, sensory color, or repeated tension alone is not a completed status read.",
    "If a broad status-read needs a concrete situational read, visible lead, local record, route/person/object affordance, or quick-action follow-up, choose tool_plan for a lookup-grounded read or minimal state-bearing consequence. observation-only lookup evidence is enough when the answer is an existing visible affordance; use roll_oracle for uncertain visible reaction.",
    "If the player watches, listens, waits, or observes whether crowd pressure, authority procedure, alarms, announcements, queues, vehicles, route status, hazards, or public behavior changes, do not use direct for a future-relevant yes/no answer. Choose tool_plan to ground the observed state/change, or roll_oracle if the visible reaction is uncertain.",
    "Do not smuggle support presence through direct. If the beat needs a vendor, clerk, worker, assistant, porter, witness, messenger, guard, crowd, vehicle, route, door, or temporary support actor that should be addressed, remembered, or reused, choose tool_plan.",
    "When the player names a generic public role such as vendor, clerk, worker, assistant, guard, attendant, witness, local, crowd, low-ranking staff, or nearest, resolve it to a plausible visible actor/current-scene service role if the scene supports one. Public/commercial/institutional scenes should not stall; an ordinary service worker or assistant is usually a plausible support NPC unless the scene is empty, closed, restricted, hostile, or needs a named authority. Use clarification only when the requested role cannot plausibly exist.",
    "A role label like nearest notice-board clerk, dispatch clerk, counter clerk, office assistant, route porter, or public attendant is enough intent for tool_plan when the scene is public/commercial/institutional and the answer concerns postings, procedures, permissions, route status, permits, office status, public service, what changed today, or which posted item applies. Do not choose clarification just because the exact clerk/assistant actor is not already listed; the tool loop can create a bounded temporary responder or record a grounded unavailable/no-current-answer outcome.",
    "Keep passive-pressure modest and world-agnostic: delays, routine NPC movement, overheard signals, witness attention, public obstruction, or local consequences are enough.",
    "Use roll_oracle for uncertain visible reactions or resistance when no new durable fact is needed yet: belief, witness notice, alarm, or visible physical traction.",
    "Player agency is locked: never decide the player's deliberate words, feelings, consent, inventory claims, completed movement, or success in GM Read.",
    "Treat claimed possessions, authority, access, or prior accomplishments as claims until state confirms them. For claimed keys/permits/passes/credentials/authority, do not ask Oracle whether the proof exists, is owned, fits, or works; only judge visible belief, witness reaction, alarm, or physical resistance.",
    "Unlisted claimed objects, doors, offices, routes, rooms, credentials, keys, or locks are not refs. Do not put them in actionInterpretation.targetRefs, rollRequest.targetRef, combat targetRef, focalActorRefs, backgroundActorRefs, or evidenceRefs; omit rollRequest.targetRef unless it is an exact listed candidate.",
    "Do not rescue a false or unconfirmed access claim by inventing an alternate key, lockpick, hidden tool, special technique, credential, or background skill.",
    "NPCs are autonomous actors with motives and limited knowledge. NPC knowledge bounds: use only visible scene facts plus what that NPC could reasonably know; missing knowledge becomes uncertainty, evasion, suspicion, error, or request for proof.",
    "Combat pressure is broader than explicit attack verbs: defensive posture, threat probing, risky environmental moves, violence aftermath, and power-gap questions need a clear pressure path.",
    "Resolve obvious recent-context references such as that connection, the slower route, the deal, that rumor, that claim, or the nearby vendor against RECENT CONVERSATION, MODEL-FACING SCENE VIEW localRecentEvents, listed legalMovement, visible actors, and legal targets.",
    "Use scoped forecast excerpts only as advisory pressure. Translate them into local observable signals when relevant; they do not expand legal refs, script outcomes, or reveal private facts.",
    "Backend authority: backend owns IDs, validation, allowed tools, deterministic math, random rolls, persistence, rollback, and final truth.",
    `Allowed runtime tools for later stages: ${allowedToolList}. Use this list only to judge whether tool_plan is appropriate.`,
    "Do not include concrete tool payloads, plannedTools, plannedActions, state deltas, narrator prose, backend-generated ids, persistence fields, toolName, input, payload, toolInput, actions, or nested runtime tool calls in GM Read output.",
    "Use only refs supplied in CANDIDATE REFS FROM MODEL-FACING VIEW.",
    "Selection caps are hard: focalActorRefs 1-3, backgroundActorRefs 0-4, actionInterpretation.targetRefs 0-4, evidenceRefs 1-8, narrationGuardrails 0-4. Select the most decision-relevant refs; never enumerate every visible actor, event, item, or route.",
    "For broad take-stock/status-read actions, use Player plus the top 1-2 blockers, authorities, or affordances as focalActorRefs. Put less important visible context in situationSummary/rationale without adding refs.",
    "Top-level fields shared by every path: version, situationSummary, sceneQuestion, focalActorRefs, backgroundActorRefs, actionInterpretation, path, rationale, evidenceRefs, narrationGuardrails, optional runtimeRequirement.",
    'actionInterpretation shape: { "intent": string, "method"?: string, "targetRefs": string[] }.',
    "Write compact fields. situationSummary should be 1-2 short sentences; sceneQuestion one direct question; rationale 1-2 sentences; narrationGuardrails 0-4 short bullets. Do not write essays in schema fields.",
    "Hard budgets to aim for: situationSummary under 240 chars, sceneQuestion under 140 chars, each narrationGuardrail under 140 chars. Backend accepts a little extra to avoid losing a valid turn, but concise output is the contract.",
    "Per-path required fields:",
    '- direct: { "path": "direct", "directResolutionNotes": string }.',
    '- continue: { "path": "continue", "continuationGuidance": string }.',
    '- clarification: { "path": "clarification", "clarificationPrompt": string }.',
    '- roll_oracle: { "path": "roll_oracle", "rollRequest": { "actorRef": string, "targetRef"?: string, "question": string, "stakes": string, "evidenceRefs": string[] } }.',
    '- tool_plan: { "path": "tool_plan", "turnIntent": string, "runtimeRequirement": non-none RuntimeRequirement }. No tool inputs here.',
    '- combat_transition: { "path": "combat_transition", "actorRef": string, "targetRef": string, "combatFraming": string, "stakes": string }.',
    "Compact valid examples:",
    '{ "version": "gm-read.v1", "situationSummary": "The player greets a visible clerk.", "sceneQuestion": "How does the clerk answer the greeting?", "focalActorRefs": ["Player", "Cafe Clerk"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "greet the clerk", "targetRefs": ["Cafe Clerk"] }, "path": "direct", "directResolutionNotes": "Answer with one local greeting from current visible facts only.", "rationale": "No reusable fact, route, proof, permission, or later obligation is introduced.", "evidenceRefs": ["Player", "Cafe Clerk"], "narrationGuardrails": ["Keep the answer local and non-durable."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player tries to force the gate under pressure.", "sceneQuestion": "Does the gate challenge become uncertain?", "focalActorRefs": ["Player", "Gate Guard"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "force passage", "targetRefs": ["Gate Guard"] }, "path": "roll_oracle", "rollRequest": { "actorRef": "Player", "targetRef": "Gate Guard", "question": "Does the guard yield?", "stakes": "The player passes or the gate locks down.", "evidenceRefs": ["Player", "Gate Guard"] }, "rationale": "The outcome is uncertain and consequential.", "evidenceRefs": ["Player", "Gate Guard"], "narrationGuardrails": ["Do not decide the outcome before Oracle."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player claims a master key for an unlisted office door.", "sceneQuestion": "How does the visible guard challenge the claim?", "focalActorRefs": ["Player", "Road Warden"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "claim authority and test access", "targetRefs": ["Road Warden"] }, "path": "roll_oracle", "rollRequest": { "actorRef": "Player", "targetRef": "Road Warden", "question": "Does the warden hesitate or call out the bluff?", "stakes": "The public reaction changes pressure, but the unlisted key/office is not confirmed.", "evidenceRefs": ["Player", "Road Warden"] }, "rationale": "Only the visible reaction is uncertain; the claimed proof is unconfirmed.", "evidenceRefs": ["Player", "Road Warden"], "narrationGuardrails": ["Do not put the claimed key in the player hand."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player spends an hour as a tourist while the district is already under pressure.", "sceneQuestion": "What local pressure advances while the player lingers?", "focalActorRefs": ["Player"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "linger and observe", "targetRefs": [] }, "path": "tool_plan", "turnIntent": "Ground a modest local pressure or support presence before narration uses it.", "runtimeRequirement": { "kind": "scene_beat", "durability": "durable" }, "rationale": "Elapsed time plus active pressure should leave a small remembered consequence.", "evidenceRefs": ["Player"], "narrationGuardrails": ["Do not make the player central by default."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player watches whether public pressure changes checkpoint procedure.", "sceneQuestion": "What grounded crowd or authority signal is visible now?", "focalActorRefs": ["Player", "Road Warden"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "watch for crowd pressure, procedure change, or public announcement", "targetRefs": ["Road Warden"] }, "path": "tool_plan", "turnIntent": "Ground the visible unchanged state, change, announcement, or lack of public shift before narration uses it as a playable update.", "runtimeRequirement": { "kind": "observation_read", "categories": ["crowd", "procedure", "local_status"] }, "rationale": "A yes/no change in public procedure is a future-relevant situational read, not ambient direct prose.", "evidenceRefs": ["Player", "Road Warden"], "narrationGuardrails": ["It is valid for nothing to change, but the lack of change must be grounded as the current playable read."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player asks a visible warden what proof is required.", "sceneQuestion": "What procedural requirement does the warden state?", "focalActorRefs": ["Player", "Road Warden"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "ask for proof requirements", "targetRefs": ["Road Warden"] }, "path": "tool_plan", "turnIntent": "Resolve and record the authority response so the requirement can matter on later turns.", "runtimeRequirement": { "kind": "dialogue_outcome", "durability": "durable", "topicKind": "proof" }, "rationale": "Proof requirements, permits, and permission boundaries are reusable procedural information.", "evidenceRefs": ["Player", "Road Warden"], "narrationGuardrails": ["The warden may answer, refuse, or demand another proof, but do not invent player credentials."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player asks if they may contact dispatch while staying put.", "sceneQuestion": "What permission or public communication procedure applies here?", "focalActorRefs": ["Player", "Road Warden"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "ask permission to send a dispatch message while remaining in place", "targetRefs": ["Road Warden"] }, "path": "tool_plan", "turnIntent": "Resolve and record the authority response about dispatch contact and whether staying in place is permitted.", "runtimeRequirement": { "kind": "dialogue_outcome", "durability": "durable", "topicKind": "permission" }, "rationale": "Permission to contact an office or use a public procedure is reusable logistical adjudication.", "evidenceRefs": ["Player", "Road Warden"], "narrationGuardrails": ["The authority may allow, refuse, redirect, or require a specific office; do not complete the message without a tool result."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player shows actual courier documents to a visible warden.", "sceneQuestion": "Which document fails the stated requirement?", "focalActorRefs": ["Player", "Road Warden"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "compare actual documents against a permit requirement", "targetRefs": ["Road Warden"] }, "path": "tool_plan", "turnIntent": "Record the warden adjudicating which actual document fails the requirement so the rejection can matter later.", "runtimeRequirement": { "kind": "dialogue_outcome", "durability": "durable", "topicKind": "proof" }, "rationale": "A document failure is reusable procedural information and should not be only direct prose.", "evidenceRefs": ["Player", "Road Warden"], "narrationGuardrails": ["Do not invent new credentials, substitute documents, or passage."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player compares an engineer warning with a debt clerk claim.", "sceneQuestion": "What grounded contradiction or uncertainty should future route choices remember?", "focalActorRefs": ["Player"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "compare prior procedural warnings and clerk statements", "targetRefs": [] }, "path": "tool_plan", "turnIntent": "Ground and record the comparison or uncertainty between prior official warnings so future route choices can use it.", "runtimeRequirement": { "kind": "world_fact", "durability": "durable", "topicKind": "procedure" }, "rationale": "Reconciling reusable procedural facts is itself future-relevant game state, not a direct aside.", "evidenceRefs": ["Player"], "narrationGuardrails": ["Do not invent a conspiracy; record uncertainty only where the grounded facts conflict."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player asks a public clerk which posted item applies to a sealed message.", "sceneQuestion": "What clerk answer, refusal, redirect, or no-current-answer can be grounded here?", "focalActorRefs": ["Player"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "ask a clerk to identify which posted item applies to the sealed message", "targetRefs": [] }, "path": "tool_plan", "turnIntent": "Resolve a plausible current-scene clerk or record no-current-answer, then record the posted-item/proof answer for future route choices.", "runtimeRequirement": { "kind": "dialogue_outcome", "durability": "durable", "topicKind": "proof" }, "rationale": "Which posted item applies to a carried document is reusable proof/procedure adjudication, not direct prose.", "evidenceRefs": ["Player"], "narrationGuardrails": ["The clerk may answer, refuse, redirect to the registry, or say no posted item applies here."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player follows a public indicated route toward the safest lawful office.", "sceneQuestion": "Which legal movement or blocked-route outcome can be grounded now?", "focalActorRefs": ["Player"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "follow a public indicated route toward the safest named office or holding point", "targetRefs": [] }, "path": "tool_plan", "turnIntent": "Resolve legal route options, move along a confirmed public route, or record a grounded blocked/no-current-route outcome.", "runtimeRequirement": { "kind": "state_mutation" }, "rationale": "Low-risk public navigation should bridge through route tools instead of asking for backend route ids.", "evidenceRefs": ["Player"], "narrationGuardrails": ["Do not complete movement without a valid route or blocked-route tool result."] }',
    "Invalid examples: plannedTools, plannedActions, tool input payloads, hpDelta, stateDelta, inventoryAdd, narrator prose, invented actor refs, private/offscreen refs.",
  ].join("\n");
}

export function buildGmActionChecklistPromptContract(options: {
  allowedTools?: readonly RuntimeToolName[];
} = {}): string {
  const selectedToolNames = selectRuntimeToolNames(options.allowedTools);
  const allowedToolList =
    selectedToolNames.length > 0
      ? selectedToolNames.map((toolName) => `"${toolName}"`).join(", ")
      : "(none)";

  return [
    `${ENGINE_CONTRACT_MARKER_PREFIX} gm-action-checklist.v1`,
    "Return one GM Action Checklist JSON object only.",
    'Allowed turnPath values exactly: "tool_plan", "roll_oracle", or "combat_transition". Do not create a checklist for direct, continue, or clarification turns.',
    "The checklist is an auditable GM consequence plan, not execution and not final narration.",
    "This checklist is not a second GM. It exists only when an orchestrator explicitly asks for a compact consequence plan; normal native tool loops should execute from GM Read without another schema pass.",
    "RP consequence job: include only the backend steps needed to make this playable beat true. Fewer steps are better when the scene needs less.",
    "Keep the same beat anchor from GM Read. turnIntent and expectedVisibleEffect must support that pressure, not introduce a new scene premise.",
    "Do not fill all six steps by default. Each step must have one clear world function and one observable reason it belongs here.",
    "Each runtime_tool step should map to one backend action. Do not combine unrelated changes into one step and do not split one fact into filler steps.",
    "expectedVisibleEffect must be concrete and player-perceivable if the step succeeds; it is not permission to narrate skipped or failed work.",
    "Bridgeable tool_plan policy: use lookup observation tools before state-bearing bridge tools when candidate support is needed, then let backend validation execute only the legal state tool.",
    "Prefer legal low-risk advancement over parser-like questions. For fuzzy route, POI, object, actor, or service-role intent, propose list/find/check lookup steps before move_actor, create_minor_poi, create_scene_extra, start_search, or record_player_intent when needed.",
    "Do not skip or stall merely because the player did not say an exact backend string. Reserve clarification-like deferral for materially different risk/cost, irreversible high-impact actions, contradictory intent, mechanically important target identity, or no fair playable bridge.",
    "Prefer reuse over creation. Create dynamic locations or support NPCs only when the current action needs them to keep the fiction playable.",
    "Player agency remains locked: do not record claimed possessions, access, consent, or completed movement unless the step can be proven by current state or a valid tool result.",
    "Claimed possessions, authority, access, NPC consent, or completed acquisitions are not facts. If state does not confirm them, resolve the beat as a claim, bluff, request, refusal, or failed test.",
    "expectedVisibleEffect and log_event text must not put unconfirmed props into the player's hand. A claimed master key can be challenged by a lock or NPC, but the checklist must not establish that the character physically has a key unless inventory/tool facts confirm it.",
    "Names can be private facts. If a player claim contains a person/faction/place/authority name that is not present in model-facing refs, record only the claim/reaction and prefer neutral phrasing like the named authority from the player's claim; do not turn that name into confirmed identity, consent, location, or authority.",
    "An Oracle hit on a claim is not proof that the claimed item/credential exists. It can support social belief, temporary hesitation, noise/attention, or a visible attempt outcome only.",
    "Do not convert a failed or unconfirmed access claim into success through a newly invented alternate method such as a hidden key, lockpick, seal-breaking tool, credential, or unlisted specialty. Use only explicit player method plus confirmed state.",
    "Checklist caps: steps min 1 max 6; stepId values must be step-1 through step-6 in order; evidenceRefs max 8; targetRefs max 4.",
    'Top-level shape: { "version": "gm-action-checklist.v1", "turnPath": "tool_plan"|"roll_oracle"|"combat_transition", "turnIntent": string, "steps": Step[] }.',
    'Step shape: { "stepId": "step-N", "purpose": string, "evidenceRefs": string[], "dependsOnStepIds": string[], "expectedVisibleEffect": string, "requiredAction": "runtime_tool"|"combat_transition"|"oracle"|"narration_constraint"|"skip", "status": "pending", "candidateRefs": string[], "candidateToolRequest"?: CandidateToolRequest }.',
    'CandidateToolRequest shape: { "toolName": RuntimeToolName, "actorRef"?: string, "targetRefs": string[], "input": object }.',
    `Allowed RuntimeToolName values for candidateToolRequest: ${allowedToolList}.`,
    "candidateToolRequest is an untrusted suggestion for the later backend tool-step validator. Backend may accept, revise, skip, or reject it.",
    "Use candidateToolRequest only when requiredAction is runtime_tool. Omit it for combat_transition, oracle, narration_constraint, and skip.",
    "Dynamic local staging kit: when allowed tools include reveal_location or spawn_npc, you may propose anchored ephemeral sublocations and support NPCs only when current fiction needs a local affordance or scene actor.",
    "Reuse an existing suitable local scene affordance before creating another; do not create a room/NPC just because a tool exists.",
    "Support NPCs are temporary local actors. Use promote_npc only when one becomes future-relevant; otherwise let cleanup retire incidental cast.",
    "temporary props/items are out of scope for dynamic staging in this checklist; do not use spawn_item as a substitute for local scene dressing.",
    "Dependency semantics: steps run sequentially. A step may depend only on earlier stepIds. If a dependency is skipped/failed, dependents are skipped unless a later bounded revision replaces them.",
    "Oracle semantics: requiredAction oracle is allowed only for a new uncertainty not already resolved by the current GM Read/Oracle context. Do not repeat the same uncertainty.",
    "Do not include backend-generated ids, event ids, response ids, action ids, narrator prose, final narration, stateDelta, worldDelta, hpDelta, inventoryAdd, inventoryRemove, plannedTools, plannedActions, toolResultRefs, or payload.",
    "Do not include toolName or input outside candidateToolRequest.",
    "Use only refs supplied in CANDIDATE REFS FROM MODEL-FACING VIEW.",
    "Use scoped forecast excerpts only as advisory pressure; they do not expand legal refs or reveal private facts.",
    "",
    buildRuntimeToolInputContract({ toolNames: selectedToolNames }),
    "",
    "Compact valid example:",
    '{ "version": "gm-action-checklist.v1", "turnPath": "tool_plan", "turnIntent": "Record a durable promise.", "steps": [{ "stepId": "step-1", "purpose": "Record the visible promise because it should matter later.", "evidenceRefs": ["Player", "Road Warden"], "dependsOnStepIds": [], "expectedVisibleEffect": "The warden treats the promise as a real commitment.", "requiredAction": "runtime_tool", "status": "pending", "candidateRefs": ["Player", "Road Warden"], "candidateToolRequest": { "toolName": "log_event", "actorRef": "Player", "targetRefs": [], "input": { "text": "The player promises to return before dusk.", "importance": 6, "participants": ["Player"], "durability": "durable", "futureRelevance": "The promise should shape future NPC trust." } } }] }',
    "Invalid examples: plannedTools, plannedActions, top-level toolName/input, payload, backend IDs, state deltas, hidden/offscreen refs, more than 6 steps, dependencies on later steps.",
  ].join("\n");
}

export function buildHiddenAdjudicationPromptContract(options: {
  allowedTools?: readonly RuntimeToolName[];
} = {}): string {
  const allowedTools = options.allowedTools
    ? options.allowedTools.filter((toolName) => toolName !== "request_contested_outcome")
    : hiddenAdjudicationToolNames;

  return [
    `${ENGINE_CONTRACT_MARKER_PREFIX} hidden-adjudication.v1`,
    "Return one hidden adjudication object only.",
    'Required shape: { "rationale": string, "actions": [{ "toolName": RuntimeToolName, "input": object }] }.',
    "rationale max 280 chars. actions max 8. Use actions [] when no backend action is justified.",
    "Use input as primary. Do not emit payload-only primary output.",
    buildRuntimeToolInputContract({ toolNames: allowedTools }),
    "Hidden adjudication minimal valid output:",
    '{ "rationale": "No backend mutation is justified.", "actions": [] }',
    "Hidden adjudication anti-patterns: missing input, missing actions[].action, unsupported toolName, payload instead of input, invented source truth.",
    "Do not invent source truth, actor intent, targets, lore, quick-action labels, tool actions, or canonical facts.",
  ].join("\n");
}

export function buildWorldBrainPromptContract(): string {
  return [
    `${ENGINE_CONTRACT_MARKER_PREFIX} world-brain.v1`,
    "Return one world-brain scene-direction object only.",
    "Required shape:",
    '{ "situationSummary": string, "sceneQuestion": string, "focalActorNames": string[], "backgroundActorNames": string[], "presenceReasons": [{ "actorName": string, "reason": string, "perceivable": boolean }], "causalBeats": [{ "summary": string, "perceivable": boolean }], "narrationGuardrails": string[] }',
    "Caps: situationSummary max 240 chars; sceneQuestion max 140 chars; actor names max 80 chars.",
    "Caps: focalActorNames min 1 max 3; backgroundActorNames max 4; presenceReasons max 6; causalBeats max 6; narrationGuardrails max 4.",
    "Caps: presenceReasons[].reason max 180 chars; causalBeats[].summary max 180 chars; narrationGuardrails[] max 140 chars.",
    "Nullability and empty behavior: no null fields in this object. Use [] when no background actors, presence reasons, causal beats, or guardrails are justified.",
    "Use only allowed actor names supplied below; never add a new named actor from hints.",
    "",
    "Compact valid example:",
    '{ "situationSummary": "The player enters a tense platform standoff.", "sceneQuestion": "Does anyone de-escalate before weapons come out?", "focalActorNames": ["Hero"], "backgroundActorNames": ["Nanami"], "presenceReasons": [{ "actorName": "Hero", "reason": "The player action anchors the local exchange.", "perceivable": true }], "causalBeats": [{ "summary": "Nanami is measuring the player before acting.", "perceivable": true }], "narrationGuardrails": ["Keep hidden observers unnamed."] }',
    "",
    "Minimal valid output:",
    '{ "situationSummary": "The player creates the next local beat.", "sceneQuestion": "Who responds first?", "focalActorNames": ["Hero"], "backgroundActorNames": [], "presenceReasons": [], "causalBeats": [], "narrationGuardrails": [] }',
    "",
    "Invalid examples:",
    '- missing required field: { "sceneQuestion": "Who moves?" }',
    '- overlong rationale or prose outline inside situationSummary instead of a capped summary.',
    '- invented actor: { "focalActorNames": ["Unknown Stranger"] } when that name is not allowed.',
    "",
    "Backend authority:",
    "backend filters player-perceivable facts, caps arrays/strings, validates allowed actors, and may retry/repair exact shape.",
    "Backend must not invent actors, scene facts, oracle meaning, source roles, or canonical truth to make validation pass.",
  ].join("\n");
}

export function buildOraclePromptContract(): string {
  return [
    `${ENGINE_CONTRACT_MARKER_PREFIX} oracle.v1`,
    "Return one Oracle probability object only.",
    'Required shape: { "chance": integer 1-99, "reasoning": string max 500 chars }.',
    "chance must never be 0 or 100. reasoning max 500 chars and must reference supplied tags/context only.",
    "Do not return outcome, roll, state mutation, prose narration, tool calls, or target selection.",
    "Do not use randomness to create or confirm missing inventory, credentials, authority, routes, or world facts.",
    "If an action asks whether a claimed key, permit, pass, credential, authority, or similar proof exists or is owned, treat missing supplied tags/context as lack of proof; evaluate only the visible attempt or social credibility described by the prompt.",
    "",
    "Compact valid example:",
    '{ "chance": 75, "reasoning": "Skilled lockpicks against a rusted lock with dim light as a minor penalty." }',
    "",
    "Minimal valid output:",
    '{ "chance": 50, "reasoning": "Even odds from the supplied tags." }',
    "",
    "Invalid examples:",
    '- chance 0 or 100: { "chance": 100, "reasoning": "Guaranteed." }',
    "- overlong rationale that narrates aftermath, invents new target facts, or exceeds 500 chars.",
    '- invented mechanics: { "chance": 70, "outcome": "strong_hit", "reasoning": "..." }',
    "",
    "Backend authority:",
    "backend owns the d100 roll and outcome tier, clamps as a safety net, logs the bounded ruling, and performs no state mutation here.",
    "Backend must not invent targets, destination, tags, combat facts, or state mutation to make validation pass.",
  ].join("\n");
}

export function buildTargetContextPromptContract(): string {
  return [
    `${ENGINE_CONTRACT_MARKER_PREFIX} target-context.v1`,
    "Return one target classifier object only.",
    'Required shape: { "targetName": string|null, "targetType": "character"|"item"|"location/object"|"faction"|null }.',
    "targetName must be one of the listed candidates or null. targetType must be null when targetName is null.",
    'Allowed targetType values: "character", "item", "location/object", "faction", null.',
    "If no explicit listed target is present, return both fields as null.",
    "",
    "Compact valid example:",
    '{ "targetName": "Moon Key", "targetType": "item" }',
    "",
    "Minimal valid output:",
    '{ "targetName": null, "targetType": null }',
    "",
    "Invalid examples:",
    '- invented target: { "targetName": "mysterious shimmer", "targetType": "character" } when it is not listed.',
    '- enum drift: { "targetName": "Town Square", "targetType": "location" }',
    '- mismatched nullability: { "targetName": null, "targetType": "item" }',
    "",
    "Backend authority:",
    "backend resolves only explicit listed targets, hydrates target tags, builds combat snapshots only for real character records, and falls back honestly when unresolved.",
    "Backend must not invent a missing target, destination, target tags, combat data, or source truth to make validation pass.",
  ].join("\n");
}

export function buildMovementDetectionPromptContract(): string {
  return [
    `${ENGINE_CONTRACT_MARKER_PREFIX} movement-detection.v1`,
    "Return one movement classifier object only.",
    'Required shape: { "isMovement": boolean, "destination": string|null }.',
    "destination must be null when isMovement is false.",
    "destination must be copied from explicit player wording when movement is true; keep it short and do not resolve it to a different location name.",
    "If the action is attack, talk, look around, pick up, search, examine, or otherwise non-travel, return false/null.",
    "",
    "Compact valid example:",
    '{ "isMovement": true, "destination": "the market" }',
    "",
    "Minimal valid output:",
    '{ "isMovement": false, "destination": null }',
    "",
    "Invalid examples:",
    '- invented destination: { "isMovement": true, "destination": "Hidden Shrine" } when the action did not name it.',
    '- missing nullable destination: { "isMovement": false }',
    '- inconsistent nullability: { "isMovement": false, "destination": "Tavern" }',
    "",
    "Backend authority:",
    "backend owns movement execution and destination validation, graph/path checks, no-op current-location handling, and non-connected pass-through behavior.",
    "Backend must not invent movement intent or destination, travel path, target tags, or state mutation to make validation pass.",
  ].join("\n");
}

export function buildNpcOffscreenPromptContract(): string {
  return [
    `${ENGINE_CONTRACT_MARKER_PREFIX} npc-offscreen.v1`,
    "Return one offscreen NPC update batch object only.",
    "Required shape:",
    '{ "updates": [{ "npcName": string, "newLocation": string|null, "actionSummary": string, "goalProgress": string|null }] }',
    "npcName must match one listed NPC name exactly.",
    "newLocation max 120 chars and must be one existing or explicitly named candidate location, or null.",
    "actionSummary max 260 chars and must describe one specific offscreen action/consequence from supplied NPC/world data.",
    "goalProgress max 180 chars when the supplied goals changed; use null when no explicit goal progress is justified.",
    "Use null when no location move or goal progress is justified.",
    "updates max equals the number of listed NPCs. Use updates [] if no specific offscreen action is justified.",
    "",
    "Compact valid example:",
    '{ "updates": [{ "npcName": "Lord Blackwood", "newLocation": "Council Hall", "actionSummary": "Pressed two wavering councilors for a private pledge.", "goalProgress": "Secured leverage over the succession vote." }] }',
    "",
    "Minimal valid output:",
    '{ "updates": [] }',
    "",
    "Invalid examples:",
    '- unknown NPC name: { "updates": [{ "npcName": "Unknown Stranger", "newLocation": null, "actionSummary": "Spied from the rafters.", "goalProgress": null }] }',
    '- vague maintained their position: { "updates": [{ "npcName": "Lord Blackwood", "newLocation": null, "actionSummary": "Maintained their position and continued goals.", "goalProgress": null }] }',
    '- invented relationship fact: { "updates": [{ "npcName": "Lord Blackwood", "newLocation": null, "actionSummary": "Reconciled with a daughter never listed below.", "goalProgress": "Restored family trust." }] }',
    "",
    "Backend authority:",
    "backend may reject invalid updates or omit unknown NPC updates, resolve locations by campaign rows, cap strings, persist validated summaries/goals, and skip non-resolvable moves.",
    "Backend must not invent summaries, locations, goals, relationship facts, source roles, or canonical truth to make validation pass.",
  ].join("\n");
}

export function buildContextCompressionPromptContract(): string {
  return [
    `${ENGINE_CONTRACT_MARKER_PREFIX} context-compression.v1`,
    "Return one context-compression selection object only.",
    'Required shape: { "importantIndices": number[] }.',
    "importantIndices are 0-based indices from the numbered messages supplied below.",
    "max 12 selections. Prefer fewer indices when only routine messages are present.",
    "select only indices from the numbered messages supplied below; never select an index not shown.",
    "Do not summarize, rewrite, merge, or invent memory/lore content. Return indices only.",
    "Use [] when no middle message is important enough to preserve.",
    "",
    "Compact valid example:",
    '{ "importantIndices": [0, 3] }',
    "",
    "Minimal valid output:",
    '{ "importantIndices": [] }',
    "",
    "Invalid examples:",
    '- fabricated index: { "importantIndices": [999] } when index 999 was not shown.',
    '- summary string instead of indices: { "importantIndices": "the dragon fight was important" }',
    '- invented lore: { "importantIndices": [2], "summary": "The hidden king revealed himself." }',
    "",
    "Backend authority:",
    "backend consumes only selected existing indices, filters out-of-range values, keeps first/recent messages by deterministic budget rules, and inserts omission markers.",
    "Backend must not accept fabricated memory, lore, indices, summaries, or canonical truth to make compression success.",
  ].join("\n");
}
