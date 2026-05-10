import {
  PHASE94_ROUTE_IDS,
  type Phase94HardInvariantId,
  type Phase94RouteId,
} from "../../backend/src/engine/phase-94-trace-assertions.js";
import {
  PHASE94_REQUIRED_ARTIFACTS,
  assertPhase94ManifestValid,
  type Phase94ArtifactRequirement,
  type Phase94ManifestArtifact,
  type Phase94RouteManifestEntry,
} from "./artifact-schema.js";

const BASELINE_BY_ROUTE: Record<Phase94RouteId, string> = {
  "tourist-courier": "lacquer-signal",
  "jjk-chakra-coin": "urban-occult-crossover",
  "false-claim": "lacquer-signal",
  "proposal-backlog-world-time": "lacquer-signal",
  "key-npc-faction-discovery": "lacquer-signal",
  "combat-power": "urban-occult-crossover",
  "hidden-truth-privacy": "lacquer-signal",
  "narrator-repair-prose": "urban-occult-crossover",
};

const HARD_INVARIANTS_BY_ROUTE: Record<Phase94RouteId, Phase94HardInvariantId[]> = {
  "tourist-courier": [
    "terminal-artifact-coverage",
    "surface-pressure-provenance",
    "long-turn-no-shortcuts",
    "world-version-integrity",
  ],
  "jjk-chakra-coin": [
    "oracle-decision-persistence",
    "narrator-repair-no-turn-rollback",
    "combat-power-consequence",
    "long-turn-no-shortcuts",
  ],
  "false-claim": [
    "false-claim-truth-boundary",
    "surface-pressure-provenance",
    "hidden-truth-privacy",
  ],
  "proposal-backlog-world-time": [
    "proposal-truth-boundary",
    "living-world-terminal-state",
    "world-version-integrity",
  ],
  "key-npc-faction-discovery": [
    "living-world-terminal-state",
    "surface-pressure-provenance",
    "hidden-truth-privacy",
  ],
  "combat-power": [
    "combat-power-consequence",
    "oracle-decision-persistence",
    "rollback-limit",
  ],
  "hidden-truth-privacy": [
    "hidden-truth-privacy",
    "proposal-truth-boundary",
    "terminal-artifact-coverage",
  ],
  "narrator-repair-prose": [
    "narrator-repair-no-turn-rollback",
    "long-turn-no-shortcuts",
    "terminal-artifact-coverage",
  ],
};

const ACTIONS_BY_ROUTE: Record<Phase94RouteId, string[]> = {
  "tourist-courier": [
    "I stop walking, keep both hands visible, and ask the Lead Warden what proof will satisfy the credential demand so I can continue legally to the Night Courier Depot.",
    "I slowly offer the sealed lacquer message and courier route logbook for inspection, asking whether that clears the public route to the Night Courier Depot.",
    "If the wardens clear me, I proceed along the named public route; otherwise I wait in place and ask for a formal written citation.",
  ],
  "jjk-chakra-coin": [
    "I try to bleed a weak thread of chakra through the coin without drawing attention.",
    "If the attempt goes badly, I back off and watch what residue or witnesses remain.",
  ],
  "false-claim": [
    "I claim I have a special permit to enter the restricted archive.",
    "When challenged, I bluff with confidence but do not provide real proof.",
  ],
  "proposal-backlog-world-time": [
    "I wait through the quiet afternoon and watch what changes around the district.",
    "I travel back toward the market after several hours and look for new consequences.",
  ],
  "key-npc-faction-discovery": [
    "I ask around for rumors about what the signal wardens did while I was away.",
    "I inspect the public notice board for traces of faction movement.",
  ],
  "combat-power": [
    "I probe the hostile figure's guard without fully committing to a lethal strike.",
    "If they press, I take a defensive posture and test whether escape is possible.",
  ],
  "hidden-truth-privacy": [
    "I study the stranger's public behavior without naming what I suspect.",
    "I ask a safe indirect question that should reveal only what I can legitimately learn.",
  ],
  "narrator-repair-prose": [
    "I make a cautious move that could tempt the narrator to overstate future danger.",
    "I continue only after the scene gives a grounded, settled next beat.",
  ],
};

const TITLE_BY_ROUTE: Record<Phase94RouteId, string> = {
  "tourist-courier": "Tourist courier fuzzy navigation",
  "jjk-chakra-coin": "JJK chakra coin uncertain Oracle action",
  "false-claim": "Unsupported authority false claim",
  "proposal-backlog-world-time": "Proposal backlog and world-time advancement",
  "key-npc-faction-discovery": "Key NPC and faction discoverable consequence",
  "combat-power": "Combat and power-scale consequence",
  "hidden-truth-privacy": "Hidden-truth privacy boundary",
  "narrator-repair-prose": "Narrator repair and prose review separation",
};

function requiredArtifactsFor(routeId: Phase94RouteId): Phase94ArtifactRequirement[] {
  return PHASE94_REQUIRED_ARTIFACTS.map((kind) => ({
    kind,
    path: `${routeId}/${kind}`,
  }));
}

function routeEntry(routeId: Phase94RouteId): Phase94RouteManifestEntry {
  return {
    id: routeId,
    title: TITLE_BY_ROUTE[routeId],
    family: routeId,
    baselinePoolId: BASELINE_BY_ROUTE[routeId],
    readOnly: false,
    actionScript: ACTIONS_BY_ROUTE[routeId],
    hardInvariantIds: HARD_INVARIANTS_BY_ROUTE[routeId],
    traceAssertionIds: [
      "raw-sse-terminal-event",
      "world-version-monotonic",
      "route-artifact-closeout",
      `${routeId}:living-world-signal`,
    ],
    requiredArtifacts: requiredArtifactsFor(routeId),
    requiredScreenshots: ["route-start", "representative-turn", "final-state"],
    softReviewRubricIds: [
      "playable-scene",
      "gm-fuzzy-intent",
      "living-world-feel",
      "prose-grounding",
    ],
  };
}

export function getPhase94Routes(routeIds: readonly string[] = PHASE94_ROUTE_IDS): Phase94RouteManifestEntry[] {
  const requested = new Set(routeIds);
  return PHASE94_ROUTE_IDS.filter((routeId) => requested.has(routeId)).map(routeEntry);
}

export function buildPhase94Manifest(input: {
  runId: string;
  profile: string;
  turnsPerRoute: number;
  routes?: readonly Phase94RouteManifestEntry[];
  requireAllRoutes?: boolean;
}): Phase94ManifestArtifact {
  const routes = input.routes ?? getPhase94Routes();
  assertPhase94ManifestValid(routes, { requireAllRoutes: input.requireAllRoutes ?? true });
  return {
    phase: 94,
    runId: input.runId,
    profile: input.profile,
    turnsPerRoute: input.turnsPerRoute,
    routes,
  };
}
