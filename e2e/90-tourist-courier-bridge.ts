import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { executeBridgeCandidateTool } from "../backend/src/engine/bridge-candidate-tools.js";
import {
  buildStartSearchResult,
  prepareCreateMinorPoiInput,
  prepareMoveActorInput,
} from "../backend/src/engine/bridge-state-tools.js";
import { classifyClarificationReview } from "../backend/src/engine/clarification-reviewer.js";
import type { GmRead } from "../backend/src/engine/gm-turn-read.js";
import {
  buildNarratorPacket,
  type CanonicalTurnPacket,
} from "../backend/src/engine/narrator-packet.js";
import {
  buildPlayerFacingPacketFromNarratorPacket,
  formatPlayerFacingPacketForPrompt,
} from "../backend/src/engine/player-facing-packet.js";
import type { SceneFrame } from "../backend/src/engine/scene-frame.js";
import { createPlayerTurnToolExecutionContext } from "../backend/src/engine/tool-execution-context.js";
import { runtimeToolInputSchemas } from "../backend/src/engine/tool-schemas.js";

type Mode = "dry-run" | "live";

interface ToolStep {
  order: number;
  toolName: string;
  phase: "gm-read" | "lookup" | "state" | "narrator";
  success: boolean;
  mutation: "none" | "validated";
  observationOnly: boolean;
  evidenceRefs: string[];
  summary: string;
}

interface SupportedNarrationAudit {
  finalAssistantText: string;
  mentioned: string[];
  unsupported: string[];
  packetSourceRefs: Array<{ id: string; kind: string }>;
  visibleEffectSummaries: string[];
  hiddenLeakTermsFound: string[];
  passed: boolean;
}

const exactInput = "иду дальше по логичному маршруту и ищу чайную лавку";
const outputDir = join("output", "phase-90");
const playerId = "11111111-1111-4111-8111-111111111111";
const clerkId = "22222222-2222-4222-8222-222222222222";
const hiddenActorId = "33333333-3333-4333-8333-333333333333";
const hiddenLeakTerms = [
  "Hidden Tea Broker",
  "Hidden Tea Vault",
  "private vault",
  "private vault tea room",
];

const parserClarificationPatterns = [
  /which\s+(?:connected\s+)?location/i,
  /exact\s+(?:route|location|target|id)/i,
  /backend\s+(?:route|target|ref|id)/i,
  /какая\s+локаци[яю]/iu,
  /какой\s+точн(?:ый|ого)?\s+маршрут/iu,
  /connected\s+location/iu,
];

function modeFromArgs(): Mode {
  const args = new Set(process.argv.slice(2));
  if (args.has("--live")) return "live";
  return "dry-run";
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function fail(message: string): never {
  throw new Error(message);
}

function parserClarificationPattern(text: string): string | null {
  const match = parserClarificationPatterns.find((pattern) => pattern.test(text));
  return match?.source ?? null;
}

function assertNoParserClarification(text: string, label: string): void {
  const pattern = parserClarificationPattern(text);
  if (pattern) {
    fail(`${label} contains exact-ID clarification pattern: ${pattern}`);
  }
}

function sanitizeResult(value: unknown): unknown {
  const text = JSON.stringify(value);
  for (const term of hiddenLeakTerms) {
    if (text.includes(term)) {
      fail(`Unsanitized hidden term reached artifact payload: ${term}`);
    }
  }
  return value;
}

function createFrame(): SceneFrame {
  return {
    campaignId: "campaign-90-04-dry-run",
    tick: 90,
    playerActorId: playerId,
    currentLocationId: "loc-canal-market",
    currentSceneScopeId: "scene-courier-counter",
    currentLocationName: "Canal Market",
    currentSceneScopeName: "Courier Counter",
    playerAction: exactInput,
    roster: {
      active: [
        {
          id: playerId,
          actorId: playerId,
          type: "player",
          label: "Tourist Courier",
          locationId: "loc-canal-market",
          sceneScopeId: "scene-courier-counter",
          awareness: "clear",
        },
        {
          id: clerkId,
          actorId: clerkId,
          type: "npc",
          label: "Courier Clerk",
          locationId: "loc-canal-market",
          sceneScopeId: "scene-courier-counter",
          awareness: "clear",
          tags: ["courier", "route", "service"],
        },
      ],
      support: [
        {
          id: hiddenActorId,
          actorId: hiddenActorId,
          type: "npc",
          label: "Hidden Tea Broker",
          locationId: "loc-private-vault",
          sceneScopeId: "loc-private-vault",
          awareness: "none",
          tags: ["private", "hidden"],
        },
      ],
      background: [],
    },
    perception: {
      playerAwarenessHints: ["A public sign points toward the market tea row."],
      actorAwareness: {},
      forbiddenActorLabels: ["Hidden Tea Broker"],
    },
    recentEvents: [
      {
        id: "event-public-tea-route",
        tick: 89,
        summary: "A courier clerk mentioned that tea vendors usually stand along Tea Row.",
        source: "location_recent_event",
        actorIds: [clerkId],
        perceivableByPlayer: true,
      },
      {
        id: "event-hidden-private",
        tick: 89,
        summary: "Hidden Tea Broker reserved the private vault route.",
        source: "location_recent_event",
        actorIds: [hiddenActorId],
        perceivableByPlayer: false,
      },
    ],
    targetCandidates: [
      {
        id: "actor:courier-clerk",
        actorId: clerkId,
        type: "actor",
        label: "Courier Clerk",
        awareness: "clear",
        tags: ["courier", "route", "service"],
      },
      {
        id: "item:market-route-sign",
        itemId: "item-market-route-sign",
        type: "item",
        label: "Market Route Sign",
        locationId: "loc-canal-market",
        tags: ["route", "public", "market"],
      },
    ],
    movementCandidates: [
      {
        id: "route-market-tea-row",
        locationId: "loc-tea-row",
        label: "Tea Row",
        connected: true,
        travelCost: 1,
        path: ["Canal Market", "Tea Row"],
      },
    ],
    deferredHooks: [],
    allowedTools: [
      "list_navigation_options",
      "find_location_candidates",
      "find_poi_candidates",
      "inspect_known_fact",
      "check_route",
      "move_actor",
      "create_minor_poi",
      "start_search",
      "record_player_intent",
    ],
    oracle: null,
  };
}

const initialClarification: Extract<GmRead, { path: "clarification" }> = {
  version: "gm-read.v1",
  situationSummary: "The tourist courier wants to continue and find tea.",
  sceneQuestion: "Which backend route should be used?",
  focalActorRefs: ["Tourist Courier"],
  backgroundActorRefs: [],
  actionInterpretation: {
    intent: "follow a logical route and look for a tea stall",
    targetRefs: [],
  },
  path: "clarification",
  clarificationPrompt: "Which connected location should I use for that route?",
  rationale: "The player did not provide an exact route id.",
  evidenceRefs: ["Tourist Courier"],
  narrationGuardrails: ["Do not narrate movement or a tea stall before tool results."],
};

const repairedToolPlan: GmRead = {
  version: "gm-read.v1",
  situationSummary: "The tourist courier wants to continue and find tea.",
  sceneQuestion: "How can bridge tools ground the market route and tea search?",
  focalActorRefs: ["Tourist Courier"],
  backgroundActorRefs: [],
  actionInterpretation: {
    intent: "follow the public market route and look for tea",
    targetRefs: ["Tea Row", "knowledge:public-tea-route"],
  },
  path: "tool_plan",
  turnIntent:
    "Use route and POI lookups, visible known facts, route check, move_actor, create_minor_poi, and start_search before narration.",
  rationale: "The intent is understandable, local, low-risk, and supported by public candidates.",
  evidenceRefs: ["Tourist Courier", "Tea Row", "knowledge:public-tea-route"],
  narrationGuardrails: [
    "Narrate movement, tea stall, route, or search only from successful tool results or visible public facts.",
  ],
};

function createContext(frame: SceneFrame) {
  const context = createPlayerTurnToolExecutionContext(frame);
  context.authority = {
    baseWorldVersion: 90,
    sourceEntity: { type: "player", id: playerId },
    elapsedWorldTimeMinutes: 1,
  };
  context.bridgeLookup?.playerKnownFacts.push({
    id: "knowledge:public-tea-route",
    summary: "reported: Tea Row is a public market route with ordinary tea service.",
    visibilityRoute: "player_known",
    confidence: 0.8,
    sourceRefs: ["event-public-tea-route", "item-market-route-sign"],
  });
  return context;
}

function createCanonicalTurnPacket(): CanonicalTurnPacket {
  return {
    campaignId: "campaign-90-04-dry-run",
    tick: 91,
    playerAction: exactInput,
    oracleOutcome: null,
    narratorFacts: {
      anchorEventId: "event-player-action",
      eventIds: ["event-player-action"],
      responseIds: [],
      actionIds: ["action-move", "action-poi", "action-search", "action-hidden"],
      toolResultRefs: [
        { actionId: "action-move", toolName: "move_actor" },
        { actionId: "action-poi", toolName: "create_minor_poi" },
        { actionId: "action-search", toolName: "start_search" },
        { actionId: "action-hidden", toolName: "create_minor_poi" },
      ],
    },
    anchorEvent: {
      id: "event-player-action",
      actorId: playerId,
      kind: "player_action",
      summary: "Tourist Courier asks to follow the logical route and look for a tea stall.",
      perceivableByPlayer: true,
    },
    events: [],
    responses: [],
    effects: [
      {
        id: "effect-hidden-denied",
        actionId: "action-hidden",
        actorId: playerId,
        toolName: "create_minor_poi",
        summary: "Hidden Tea Broker opens a private vault tea room.",
        perceivableByPlayer: true,
        toolResult: {
          success: false,
          error: "unsupported_action_claim",
          result: { denied: true },
        },
      },
    ],
    actionResults: [
      {
        order: 1,
        actionId: "action-move",
        actionRef: "move_actor",
        actorId: playerId,
        toolName: "move_actor",
        input: {
          actorRef: "Tourist Courier",
          destinationRef: "Tea Row",
        },
        args: {},
        result: {
          success: true,
          result: {
            actorRef: "Tourist Courier",
            locationName: "Tea Row",
            routeEvidenceRefs: ["route-market-tea-row"],
          },
        },
      },
      {
        order: 2,
        actionId: "action-poi",
        actionRef: "create_minor_poi",
        actorId: playerId,
        toolName: "create_minor_poi",
        input: {
          areaRef: "current_location",
          poiType: "tea_stall",
          name: "Lantern Tea Stall",
        },
        args: {},
        result: {
          success: true,
          result: {
            name: "Lantern Tea Stall",
            connectedTo: "Canal Market",
            poiType: "tea_stall",
          },
        },
      },
      {
        order: 3,
        actionId: "action-search",
        actionRef: "start_search",
        actorId: playerId,
        toolName: "start_search",
        input: {
          actorRef: "Tourist Courier",
          query: "чайная лавка",
        },
        args: {},
        result: {
          success: true,
          result: {
            actorRef: "Tourist Courier",
            query: "чайная лавка",
            found: false,
            discoveryCreated: false,
            targetTruth: "unconfirmed",
          },
        },
      },
      {
        order: 4,
        actionId: "action-hidden",
        actionRef: "create_minor_poi",
        actorId: playerId,
        toolName: "create_minor_poi",
        input: { name: "Hidden Tea Vault" },
        args: {},
        result: {
          success: false,
          error: "unsupported_action_claim",
          result: { denied: true },
        },
      },
    ],
    guardrails: [
      "Only mention movement, tea stall, route, or search from successful tool results.",
    ],
    controlReturnReason: "Return control after grounded route and tea search setup.",
  };
}

function runDryRun() {
  const frame = createFrame();
  const context = createContext(frame);
  const review = classifyClarificationReview({
    playerAction: exactInput,
    frame,
    gmRead: initialClarification,
  });
  if (!review.repaired) {
    fail(`Expected parser-like GM Read to be repairable; got ${review.reason}`);
  }
  assertNoParserClarification(JSON.stringify(repairedToolPlan), "repaired GM Read");

  const ledger: ToolStep[] = [];
  const addStep = (
    toolName: string,
    phase: ToolStep["phase"],
    success: boolean,
    mutation: ToolStep["mutation"],
    observationOnly: boolean,
    evidenceRefs: string[],
    summary: string,
  ) => {
    ledger.push({
      order: ledger.length + 1,
      toolName,
      phase,
      success,
      mutation,
      observationOnly,
      evidenceRefs,
      summary,
    });
  };

  addStep("gm-read-reviewer", "gm-read", true, "none", true, ["route-market-tea-row"], "Parser-like clarification repaired before visible output.");

  const navigation = executeBridgeCandidateTool("list_navigation_options", { maxResults: 4 }, context);
  addStep("list_navigation_options", "lookup", navigation.success, "none", true, ["route-market-tea-row"], "Visible route options include Tea Row.");

  const location = executeBridgeCandidateTool(
    "find_location_candidates",
    { query: "logical route Tea Row", tags: ["route"], maxResults: 4 },
    context,
  );
  addStep("find_location_candidates", "lookup", location.success, "none", true, ["route-market-tea-row"], "Route lookup resolves Tea Row.");

  const visibleFact = executeBridgeCandidateTool(
    "inspect_known_fact",
    { query: "public tea service", maxResults: 2 },
    context,
  );
  addStep("inspect_known_fact", "lookup", visibleFact.success, "none", true, ["knowledge:public-tea-route"], "Visible/player-known public tea fact found.");

  const hiddenProbe = executeBridgeCandidateTool(
    "inspect_known_fact",
    { query: "vault broker", maxResults: 2 },
    context,
  );
  if (hiddenProbe.success) {
    fail("Hidden/private fact probe unexpectedly returned visible fact.");
  }
  addStep("inspect_known_fact", "lookup", false, "none", true, [], "Private hidden-fact probe denied without mutation or leaked terms.");

  const poi = executeBridgeCandidateTool(
    "find_poi_candidates",
    { query: "чайная лавка", includePotential: true, maxResults: 3 },
    context,
  );
  addStep("find_poi_candidates", "lookup", poi.success, "none", true, ["potential:loc-canal-market"], "POI lookup allows constrained potential tea stall support.");

  const route = executeBridgeCandidateTool(
    "check_route",
    { actorRef: "Tourist Courier", destinationRef: "Tea Row", mode: "walk" },
    context,
  );
  addStep("check_route", "lookup", route.success, "none", true, ["route-market-tea-row"], "Route check accepts Tea Row.");

  const move = prepareMoveActorInput({
    actorRef: "Tourist Courier",
    destinationRef: "Tea Row",
    routeId: "route-market-tea-row",
    evidenceRefs: ["route-market-tea-row"],
    intentSummary: exactInput,
  }, context);
  if (!move.ok) fail(`move_actor validation failed: ${move.issue.message}`);
  addStep("move_actor", "state", true, "validated", false, ["route-market-tea-row"], "Movement validated through legal route evidence.");

  const minorPoi = prepareCreateMinorPoiInput({
    areaRef: "current_location",
    poiType: "tea_stall",
    name: "Lantern Tea Stall",
    visibility: "public",
    persistence: "scene_local",
    reason: "The public market route supports an ordinary tea stall.",
  }, context);
  if (!minorPoi.ok) fail(`create_minor_poi validation failed: ${minorPoi.issue.message}`);
  addStep("create_minor_poi", "state", true, "validated", false, ["knowledge:public-tea-route"], "Constrained public tea stall validation accepted.");

  const searchInput = runtimeToolInputSchemas.start_search.parse({
    actorRef: "Tourist Courier",
    query: "чайная лавка",
    scope: "current_location",
    method: "browse",
    intentSummary: exactInput,
  });
  const search = buildStartSearchResult(searchInput, context);
  if (!search.ok) fail(`start_search validation failed: ${search.issue.message}`);
  addStep("start_search", "state", true, "validated", false, ["action-poi"], "Search intent recorded without discovery truth.");

  const canonicalTurnPacket = createCanonicalTurnPacket();
  const narratorPacket = buildNarratorPacket({
    frame,
    canonicalTurnPacket,
    forbiddenPrivateTerms: ["Hidden Tea Vault", "private vault tea room"],
  });
  const playerPacket = buildPlayerFacingPacketFromNarratorPacket(narratorPacket);
  const formattedPacket = formatPlayerFacingPacketForPrompt(playerPacket);
  const finalAssistantText =
    "You follow Tea Row from Canal Market. Lantern Tea Stall becomes reachable from the public route, and the search for the tea stall is started without confirming a discovery yet.";
  assertNoParserClarification(finalAssistantText, "final assistant text");
  assertNoParserClarification(formattedPacket, "player-facing packet");

  const audit = auditNarration({
    finalAssistantText,
    packetSourceRefs: playerPacket.sourceRefs,
    visibleEffectSummaries: playerPacket.perceivableEffects.map((effect) => effect.summary),
    successfulTools: ledger.filter((step) => step.success).map((step) => step.toolName),
  });
  if (!audit.passed) {
    fail(`Unsupported narration claims: ${audit.unsupported.join(", ")}`);
  }

  const routeArtifact = sanitizeResult({
    phase: 90,
    plan: "90-04",
    mode: "dry-run",
    exactInput,
    gmRead: {
      initialPath: initialClarification.path,
      initialParserLikePattern: parserClarificationPattern(initialClarification.clarificationPrompt),
      reviewerRepaired: review.repaired,
      reviewerReason: review.reason,
      visiblePath: repairedToolPlan.path,
    },
    route: {
      from: "Canal Market",
      to: "Tea Row",
      routeId: "route-market-tea-row",
      moveActorValidated: true,
    },
    poi: {
      mode: "create_minor_poi",
      poiType: "tea_stall",
      name: "Lantern Tea Stall",
      visiblePublicFactRef: "knowledge:public-tea-route",
    },
    result: "passed",
  });

  const ledgerArtifact = sanitizeResult({
    phase: 90,
    plan: "90-04",
    mode: "dry-run",
    exactInput,
    steps: ledger,
    requiredSequencePresent: [
      "list_navigation_options",
      "find_location_candidates",
      "inspect_known_fact",
      "find_poi_candidates",
      "check_route",
      "move_actor",
      "create_minor_poi",
      "start_search",
    ].every((toolName) => ledger.some((step) => step.toolName === toolName && step.success)),
  });

  const auditArtifact = sanitizeResult({
    phase: 90,
    plan: "90-04",
    mode: "dry-run",
    exactInput,
    ...audit,
    packetAudit: playerPacket.audit,
    contextBudgetTrace: playerPacket.contextBudgetTrace,
  });

  return {
    routeArtifact,
    ledgerArtifact,
    auditArtifact,
    reviewMarkdown: [
      "# No Parser Clarification Review",
      "",
      `- Exact input: \`${exactInput}\``,
      `- Initial GM Read path: \`${initialClarification.path}\``,
      `- Initial parser-like pattern: \`${parserClarificationPattern(initialClarification.clarificationPrompt) ?? "none"}\``,
      `- Reviewer result: \`${review.reason}\``,
      `- Visible GM Read path: \`${repairedToolPlan.path}\``,
      "- Player-visible exact-ID clarification: `none`",
      "- Hidden/private fact probe: `denied, no mutation, no hidden terms in artifacts`",
      "- Narration audit: `passed`",
      "",
      "The dry-run fixture intentionally starts from a parser-like GM Read clarification and requires the reviewer repair to a non-clarification tool plan before any visible output.",
      "",
    ].join("\n"),
  };
}

function auditNarration(input: {
  finalAssistantText: string;
  packetSourceRefs: Array<{ id: string; kind: string }>;
  visibleEffectSummaries: string[];
  successfulTools: string[];
}): SupportedNarrationAudit {
  const text = input.finalAssistantText;
  const successfulTools = new Set(input.successfulTools);
  const visibleFacts = input.visibleEffectSummaries.join("\n");
  const claims = [
    {
      name: "movement",
      mentioned: /follow|move|ид[уеё]т|движ|Tea Row/i.test(text),
      supported: successfulTools.has("move_actor") && /moves to Tea Row/i.test(visibleFacts),
    },
    {
      name: "tea stall",
      mentioned: /tea stall|чай/i.test(text),
      supported: successfulTools.has("create_minor_poi") && /Tea Stall becomes reachable/i.test(visibleFacts),
    },
    {
      name: "route",
      mentioned: /route|маршрут|Tea Row/i.test(text),
      supported: successfulTools.has("check_route") && successfulTools.has("move_actor"),
    },
    {
      name: "search",
      mentioned: /search|ищу|поиск/i.test(text),
      supported: successfulTools.has("start_search") && /starts searching/i.test(visibleFacts),
    },
    {
      name: "extra",
      mentioned: /extra|witness|courier clerk appears/i.test(text),
      supported: successfulTools.has("create_scene_extra"),
    },
  ];
  const mentioned = claims.filter((claim) => claim.mentioned).map((claim) => claim.name);
  const unsupported = claims
    .filter((claim) => claim.mentioned && !claim.supported)
    .map((claim) => claim.name);
  const hiddenLeakTermsFound = hiddenLeakTerms.filter((term) =>
    text.includes(term) || visibleFacts.includes(term),
  );
  return {
    finalAssistantText: text,
    mentioned,
    unsupported,
    packetSourceRefs: input.packetSourceRefs,
    visibleEffectSummaries: input.visibleEffectSummaries,
    hiddenLeakTermsFound,
    passed: unsupported.length === 0 && hiddenLeakTermsFound.length === 0,
  };
}

async function runLiveMode(): Promise<never> {
  if (process.env.WORLDFORGE_LIVE_PHASE90 !== "1") {
    fail("Live mode requires WORLDFORGE_LIVE_PHASE90=1. Dry-run is the default.");
  }
  fail("Live Phase 90 route mutation is intentionally not run by default; use dry-run for required acceptance proof.");
}

async function main(): Promise<void> {
  const mode = modeFromArgs();
  mkdirSync(outputDir, { recursive: true });
  if (mode === "live") {
    await runLiveMode();
  }

  const result = runDryRun();
  writeJson(join(outputDir, "tourist-courier-route.json"), result.routeArtifact);
  writeJson(join(outputDir, "tool-step-ledger.json"), result.ledgerArtifact);
  writeJson(join(outputDir, "narrator-packet-audit.json"), result.auditArtifact);
  writeFileSync(join(outputDir, "no-parser-clarification-review.md"), result.reviewMarkdown, "utf-8");
  console.log(JSON.stringify({
    status: "passed",
    mode,
    outputDir,
    artifacts: [
      join(outputDir, "tourist-courier-route.json"),
      join(outputDir, "tool-step-ledger.json"),
      join(outputDir, "narrator-packet-audit.json"),
      join(outputDir, "no-parser-clarification-review.md"),
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
