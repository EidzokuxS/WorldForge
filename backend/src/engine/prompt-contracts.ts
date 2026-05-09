import { runtimeToolInputSchemas, type RuntimeToolName } from "./tool-schemas.js";

export const ENGINE_CONTRACT_MARKER_PREFIX = "STRUCTURED_OUTPUT_CONTRACT:";

const runtimeToolNames = Object.keys(runtimeToolInputSchemas) as RuntimeToolName[];
const hiddenAdjudicationToolNames = runtimeToolNames.filter(
  (toolName) => toolName !== "request_contested_outcome",
);

const runtimeToolInputShapes = {
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
    "GM Read owns scene interpretation and path choice, not backend execution.",
    "RP turn job: read playerAction as a live request, identify the next playable beat, and choose the lightest path that makes the scene respond.",
    "One beat anchor: sceneQuestion is the immediate playable pressure for this turn. Later tool execution and final narration should stay on that same pressure, not discover a new plot.",
    "Use direct for normal conversation, local description, ambient reaction, or a non-mutating NPC response that can be answered from current visible facts. Do not force tools when prose can honestly answer.",
    "Do not use direct, continue, or clarification to introduce future-relevant concrete pressure: named/role actors who continue acting, new props, obligations, routes/doors/stairs, defensive posture, danger changes, or aftermath after violence.",
    "Before returning direct, continue, or clarification, scan sceneQuestion, the path-specific field, and every narrationGuardrails item. If any line would still matter after this narration, switch path or remove that pressure.",
    "If a pressure should matter later, choose tool_plan, roll_oracle, or combat_transition. If it is only sensory color, keep it low-stakes, local, and non-durable.",
    "Path choice is the GM's job. Backend validates and may reject illegal no-mutation pressure, but backend must not secretly choose the path for you.",
    "Use tool_plan only when world state must actually change, a fact must matter later, a scene affordance must be established, or a support actor/location must exist for the current fiction.",
    "Passive, tourist, waiting, travel, shopping, observation, or other elapsed-time actions are not automatically postcards. If local pressure, visible NPC motives, due-world work, scoped forecast pressure, or public services/actors can advance during that time, choose the smallest consequential path.",
    "Before choosing direct for a passive/tourist action, ask: can final narration complete the beat using only current visible facts and leave nothing future-relevant behind? If not, choose tool_plan, roll_oracle, or combat_transition.",
    "Do not smuggle support presence through direct. If the beat needs a vendor, clerk, porter, witness, messenger, guard, crowd, vehicle, route, door, or temporary support actor that should be addressed, remembered, or reused, choose tool_plan so later stages can ground it through allowed tools.",
    "Keep passive-pressure modest and world-agnostic: delays, routine NPC movement, overheard signals, witness attention, public obstruction, or local consequences are enough. Do not make the player chosen or central by default.",
    "Use roll_oracle for uncertain visible reactions or resistance when no new durable fact is needed yet. Example: a guard's belief, a witness noticing a lie, alarm rising, or whether a risky visible attempt gets immediate traction.",
    "Player agency is locked: never decide the player's deliberate words, feelings, consent, inventory claims, completed movement, or success in GM Read.",
    "Treat claimed possessions, authority, access, or prior accomplishments as claims until current state or inventory confirms them; path/stakes should test or challenge the claim, not grant it.",
    "For claimed keys, permits, passes, credentials, authority, or similar proof, do not ask Oracle whether the proof exists, is owned, fits, or works. That is a backend state question, not randomness.",
    "If the proof is not listed in legal targets/current state, Oracle may only judge scene uncertainty around the claim: whether NPCs believe it, whether witnesses notice the lie, whether alarm rises, or whether a visible physical attempt without the proof makes progress.",
    "Unlisted claimed objects, doors, offices, routes, rooms, credentials, keys, or locks are not refs. Do not put them in actionInterpretation.targetRefs, rollRequest.targetRef, combat targetRef, focalActorRefs, backgroundActorRefs, or evidenceRefs.",
    "When the claimed target/prop is not listed, use [] for actionInterpretation.targetRefs or target a visible NPC/current scene candidate; omit rollRequest.targetRef unless it is an exact listed candidate.",
    "Do not rescue a false or unconfirmed access claim by inventing an alternate key, lockpick, hidden tool, special technique, credential, or background skill. Oracle success can only resolve the stated method using confirmed state.",
    "NPCs are autonomous actors with motives and limited knowledge. Read their likely reaction from visible records and local pressure, not from a prewritten plot.",
    "NPC knowledge bounds: direct/continue guidance may use only visible scene facts plus what that NPC could reasonably know. If knowledge is missing, play uncertainty, evasion, suspicion, error, or a request for proof.",
    "The world is not waiting for the player. Passive, delaying, probing, or clarification-seeking actions may still let visible pressure and NPC motives advance inside the current scene.",
    "Combat pressure is broader than explicit attack verbs: defensive posture, threat probing, risky environmental moves, violence aftermath, and power-gap questions still need a clear pressure path.",
    "When combat pressure has a clear visible target or threat, adjudicate the next pressure path instead of asking backend-style specificity questions. If it is not actual combat, answer with direct local/social/exploration pressure.",
    "sceneQuestion should name the immediate dramatic/gameplay question for this beat, not restate the schema.",
    "Backend authority: backend owns IDs, validation, allowed tools, deterministic math, random rolls, persistence, rollback, and final truth.",
    `Allowed runtime tools for later stages: ${allowedToolList}. Use this list only to judge whether tool_plan is appropriate.`,
    "Do not include concrete tool payloads, plannedTools, plannedActions, state deltas, narrator prose, backend-generated ids, or persistence fields.",
    "Do not include toolName, input, payload, toolInput, actions, or nested runtime tool calls in GM Read output.",
    "Use only refs supplied in CANDIDATE REFS FROM MODEL-FACING VIEW.",
    'Resolve obvious recent-context references such as "that connection", "the slower route", "the deal", "that rumor", "that claim", or "the nearby vendor" against RECENT CONVERSATION, MODEL-FACING SCENE VIEW localRecentEvents, listed legalMovement, visible actors, and legal targets. Use clarification only when no grounded candidate exists or multiple plausible grounded candidates compete.',
    'When the player names a generic public role such as "vendor", "clerk", "guard", "attendant", "witness", "local", "crowd", or "nearest", resolve it to a plausible visible actor/current-scene service role when the scene clearly supports one. If that role needs to become concrete or future-relevant, choose tool_plan for a support NPC; use clarification only when the requested role cannot plausibly exist in the current scene.',
    "Public/commercial/institutional scenes should not stall just because no named clerk is already in visibleActorRefs. In a market, station, kiosk, school, office, checkpoint, shop, shrine desk, or counter, an ordinary service worker is usually a plausible support NPC. Ground them through tool_plan instead of asking the player to restate the obvious, unless the scene is explicitly empty, closed, restricted, hostile, or the request requires a named authority.",
    "Use scoped forecast excerpts only as advisory pressure. Translate them into local observable signals when relevant; they do not expand legal refs, script outcomes, or reveal private facts.",
    "Top-level fields shared by every path: version, situationSummary, sceneQuestion, focalActorRefs, backgroundActorRefs, actionInterpretation, path, rationale, evidenceRefs, narrationGuardrails.",
    'actionInterpretation shape: { "intent": string, "method"?: string, "targetRefs": string[] }.',
    "Write compact fields. situationSummary should be 1-2 short sentences; sceneQuestion one direct question; rationale 1-2 sentences; narrationGuardrails 0-4 short bullets. Do not write essays in schema fields.",
    "Hard budgets to aim for: situationSummary under 240 chars, sceneQuestion under 140 chars, each narrationGuardrail under 140 chars. Backend accepts a little extra to avoid losing a valid turn, but concise output is the contract.",
    "Per-path required fields:",
    '- direct: { "path": "direct", "directResolutionNotes": string }.',
    '- continue: { "path": "continue", "continuationGuidance": string }.',
    '- clarification: { "path": "clarification", "clarificationPrompt": string }.',
    '- roll_oracle: { "path": "roll_oracle", "rollRequest": { "actorRef": string, "targetRef"?: string, "question": string, "stakes": string, "evidenceRefs": string[] } }.',
    '- tool_plan: { "path": "tool_plan", "turnIntent": string }. No tool inputs here.',
    '- combat_transition: { "path": "combat_transition", "actorRef": string, "targetRef": string, "combatFraming": string, "stakes": string }.',
    "Compact valid examples:",
    '{ "version": "gm-read.v1", "situationSummary": "The player asks a visible warden a direct question.", "sceneQuestion": "What does the warden reveal?", "focalActorRefs": ["Player", "Road Warden"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "ask about the road", "targetRefs": ["Road Warden"] }, "path": "direct", "directResolutionNotes": "Answer from known visible facts without changing state.", "rationale": "No uncertainty or mutation is needed.", "evidenceRefs": ["Player", "Road Warden"], "narrationGuardrails": ["Keep the answer local."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player tries to force the gate under pressure.", "sceneQuestion": "Does the gate challenge become uncertain?", "focalActorRefs": ["Player", "Gate Guard"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "force passage", "targetRefs": ["Gate Guard"] }, "path": "roll_oracle", "rollRequest": { "actorRef": "Player", "targetRef": "Gate Guard", "question": "Does the guard yield?", "stakes": "The player passes or the gate locks down.", "evidenceRefs": ["Player", "Gate Guard"] }, "rationale": "The outcome is uncertain and consequential.", "evidenceRefs": ["Player", "Gate Guard"], "narrationGuardrails": ["Do not decide the outcome before Oracle."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player claims a master key for an unlisted office door.", "sceneQuestion": "How does the visible guard challenge the claim?", "focalActorRefs": ["Player", "Road Warden"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "claim authority and test access", "targetRefs": ["Road Warden"] }, "path": "roll_oracle", "rollRequest": { "actorRef": "Player", "targetRef": "Road Warden", "question": "Does the warden hesitate or call out the bluff?", "stakes": "The public reaction changes pressure, but the unlisted key/office is not confirmed.", "evidenceRefs": ["Player", "Road Warden"] }, "rationale": "Only the visible reaction is uncertain; the claimed proof is unconfirmed.", "evidenceRefs": ["Player", "Road Warden"], "narrationGuardrails": ["Do not put the claimed key in the player hand."] }',
    '{ "version": "gm-read.v1", "situationSummary": "The player spends an hour as a tourist while the district is already under pressure.", "sceneQuestion": "What local pressure advances while the player lingers?", "focalActorRefs": ["Player"], "backgroundActorRefs": [], "actionInterpretation": { "intent": "linger and observe", "targetRefs": [] }, "path": "tool_plan", "turnIntent": "Ground a modest local pressure or support presence before narration uses it.", "rationale": "Elapsed time plus active pressure should leave a small remembered consequence.", "evidenceRefs": ["Player"], "narrationGuardrails": ["Do not make the player central by default."] }',
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
