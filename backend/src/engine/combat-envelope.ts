import type {
  CharacterVulnerability,
  PowerStats,
} from "@worldforge/shared";
import {
  AP_DURABILITY_TIERS,
  INTELLIGENCE_TIERS,
  SPEED_TIERS,
  canHaxBypass,
  formatTierRank,
  tierDistance,
} from "@worldforge/shared";

export type CombatMatchup =
  | "dominant"
  | "advantaged"
  | "contested"
  | "disadvantaged"
  | "outmatched";

export interface CombatantCombatSnapshot {
  label: string;
  powerStats?: PowerStats | null;
}

export interface CombatEnvelope {
  matchup: CombatMatchup;
  durabilityTierGap: number;
  durabilityStepGap: number;
  speedTierGap: number;
  speedStepGap: number;
  intelligenceTierGap: number | null;
  intelligenceStepGap: number | null;
  actorBypassesTarget: boolean;
  targetBypassesActor: boolean;
  actorBypassSources: string[];
  targetBypassSources: string[];
  relevantVulnerabilities: CharacterVulnerability[];
  summaryLines: string[];
}

export interface NarrativeOutcomeBounds {
  ceilings: string[];
  floors: string[];
  prohibitions: string[];
  summary: string;
}

export type CombatPosture =
  | "aggress"
  | "press"
  | "trade"
  | "probe"
  | "withdraw"
  | "disengage";

export interface NpcCombatPosture {
  posture: CombatPosture;
  vsLabel: string;
  matchup: CombatMatchup;
  canWin: boolean;
  mustAvoid: string[];
  exposedTargetVulnerabilities: string[];
  guidanceLines: string[];
}

export interface BuildCombatEnvelopeOptions {
  actor: CombatantCombatSnapshot | null | undefined;
  target: CombatantCombatSnapshot | null | undefined;
  hostileAction: boolean;
  actionText?: string;
}

export interface DeriveCombatPostureOptions {
  vsLabel: string;
}

type OutcomeTierLike = "strong_hit" | "weak_hit" | "miss" | (string & {});

const HOSTILE_ACTION_PATTERNS: readonly RegExp[] = [
  /\battack(?:ing)?\b/i,
  /\bstrike\b/i,
  /\bstab(?:bing)?\b/i,
  /\bslash(?:ing)?\b/i,
  /\bshoot(?:ing)?\b/i,
  /\bblast\b/i,
  /\bsmash\b/i,
  /\bpunch\b/i,
  /\bkick\b/i,
  /\bhit\b/i,
  /\bburn\b/i,
  /\belectrocut(?:e|ing)\b/i,
  /\bcrush\b/i,
  /\bmaim\b/i,
  /\bkill\b/i,
  /\bassassinat(?:e|ion)\b/i,
  /\bchoke\b/i,
  /\bmaul\b/i,
  /\bclaw\b/i,
  /\bbite\b/i,
  /\bfight\b/i,
];

const COMBAT_PRESSURE_PATTERNS: readonly RegExp[] = [
  /\bdefensive\s+(?:posture|stance|guard)\b/i,
  /\braise\s+(?:my\s+)?guard\b/i,
  /\bkeep\s+(?:my\s+)?guard\s+up\b/i,
  /\bbrace\s+(?:myself|for)\b/i,
  /\b(?:test|probe|measure|read)\s+(?:the\s+)?(?:gap|distance|opening|threat|opponent|enemy)\b/i,
  /\bpower\s+(?:gap|difference|level|scaling)\b/i,
  /\bhow\s+(?:strong|fast|dangerous|outmatched)\b/i,
  /\bafter\s+(?:the\s+)?(?:violence|fight|attack|hit|strike|wound|bloodshed)\b/i,
  /\bwhat\s+changed\s+because\s+of\s+(?:the\s+)?(?:violence|fight|attack|wound|bloodshed)\b/i,
  /\b(?:cover|shield|duck|dodge|evade|parry|block)\b/i,
  /\b(?:risky|dangerous|reckless)\s+(?:move|approach|maneuver|angle)\b/i,
];

const TOKEN_STOP_WORDS = new Set([
  "with",
  "into",
  "from",
  "that",
  "this",
  "their",
  "there",
  "against",
  "while",
  "have",
  "your",
  "them",
  "using",
  "through",
  "would",
  "could",
  "should",
  "about",
]);

const MAX_BOUNDS_LINES = 3;
const MAX_POSTURE_GUIDANCE_LINES = 3;
const MAX_POSTURE_AVOID_LINES = 3;
const MAX_POSTURE_VULNERABILITIES = 2;
const MAX_FACT_CHARS = 140;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clampFact(value: string, maxChars = MAX_FACT_CHARS): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxChars - 3).trimEnd()}...`;
}

function capFacts(values: Array<string | null | undefined>, limit: number): string[] {
  return dedupeStrings(
    values
      .filter((value): value is string => Boolean(value && value.trim()))
      .map((value) => clampFact(value)),
  ).slice(0, limit);
}

function collectExposedVulnerabilityFacts(
  envelope: CombatEnvelope,
  limit = MAX_POSTURE_VULNERABILITIES,
): string[] {
  return capFacts(
    envelope.relevantVulnerabilities.map((vulnerability) => vulnerability.description),
    limit,
  );
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function tokenizeTexts(texts: Array<string | null | undefined>): string[] {
  return dedupeStrings(
    texts
      .flatMap((text) => normalizeText(text ?? "").split(/\s+/))
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
      .filter((token) => !TOKEN_STOP_WORDS.has(token)),
  );
}

function classifyMatchup(input: {
  durabilityTierGap: number;
  speedTierGap: number;
  intelligenceTierGap: number | null;
  actorBypassesTarget: boolean;
  targetBypassesActor: boolean;
}): CombatMatchup {
  const {
    durabilityTierGap,
    speedTierGap,
    intelligenceTierGap,
    actorBypassesTarget,
    targetBypassesActor,
  } = input;

  const offenseDenied = !actorBypassesTarget && durabilityTierGap >= 2;
  const offenseStrained = !actorBypassesTarget && durabilityTierGap === 1;
  const offenseFavored = actorBypassesTarget || durabilityTierGap <= -1;
  const speedFavored = speedTierGap >= 1;
  const speedDenied = speedTierGap <= -1;
  const intelligenceFavored = (intelligenceTierGap ?? 0) >= 1;
  const intelligenceDenied = (intelligenceTierGap ?? 0) <= -1;

  if (
    offenseDenied
    && (speedDenied || targetBypassesActor || intelligenceDenied)
  ) {
    return "outmatched";
  }

  if (offenseDenied || (offenseStrained && speedDenied)) {
    return "disadvantaged";
  }

  if (
    offenseFavored
    && speedFavored
    && !targetBypassesActor
    && (actorBypassesTarget || durabilityTierGap <= -2)
  ) {
    return "dominant";
  }

  if (
    offenseFavored
    || (speedFavored && !targetBypassesActor)
    || intelligenceFavored
  ) {
    return "advantaged";
  }

  if (speedDenied || intelligenceDenied || targetBypassesActor) {
    return "disadvantaged";
  }

  return "contested";
}

function collectRelevantVulnerabilities(
  powerStats: PowerStats,
  actionText: string | undefined,
): CharacterVulnerability[] {
  const cueTokens = new Set(
    tokenizeTexts([
      actionText,
      ...powerStats.hax.flatMap((hax) => [hax.name, hax.type]),
    ]),
  );

  if (cueTokens.size === 0) {
    return [];
  }

  return powerStats.vulnerabilities.filter((vulnerability) => {
    const vulnerabilityTokens = tokenizeTexts([vulnerability.description]);
    return vulnerabilityTokens.some((token) => cueTokens.has(token));
  });
}

function buildDurabilityLine(input: {
  actorLabel: string;
  targetLabel: string;
  actorPower: PowerStats;
  targetPower: PowerStats;
  durabilityTierGap: number;
  actorBypassesTarget: boolean;
  actorBypassSources: string[];
}): string {
  const {
    actorLabel,
    targetLabel,
    actorPower,
    targetPower,
    durabilityTierGap,
    actorBypassesTarget,
    actorBypassSources,
  } = input;

  if (actorBypassesTarget) {
    return `${actorLabel} can bypass ${targetLabel}'s durability via ${actorBypassSources.join(", ")}.`;
  }

  if (durabilityTierGap >= 2) {
    return `${targetLabel}'s durability (${formatTierRank(targetPower.durability)}) is ${durabilityTierGap} tiers above ${actorLabel}'s attack (${formatTierRank(actorPower.attackPotency)}).`;
  }

  if (durabilityTierGap === 1) {
    return `${targetLabel}'s durability (${formatTierRank(targetPower.durability)}) slightly exceeds ${actorLabel}'s attack (${formatTierRank(actorPower.attackPotency)}).`;
  }

  if (durabilityTierGap <= -1) {
    return `${actorLabel}'s attack (${formatTierRank(actorPower.attackPotency)}) overmatches ${targetLabel}'s durability (${formatTierRank(targetPower.durability)}) by ${Math.abs(durabilityTierGap)} tier${Math.abs(durabilityTierGap) === 1 ? "" : "s"}.`;
  }

  return `${actorLabel}'s attack (${formatTierRank(actorPower.attackPotency)}) and ${targetLabel}'s durability (${formatTierRank(targetPower.durability)}) are in the same tier band.`;
}

function buildSpeedLine(input: {
  actorLabel: string;
  targetLabel: string;
  actorPower: PowerStats;
  targetPower: PowerStats;
  speedTierGap: number;
}): string {
  const { actorLabel, targetLabel, actorPower, targetPower, speedTierGap } = input;

  if (speedTierGap >= 1) {
    return `${actorLabel} is faster (${formatTierRank(actorPower.speed)} vs ${formatTierRank(targetPower.speed)}).`;
  }
  if (speedTierGap <= -1) {
    return `${targetLabel} is faster (${formatTierRank(targetPower.speed)} vs ${formatTierRank(actorPower.speed)}).`;
  }
  return `${actorLabel} and ${targetLabel} are in the same speed band (${formatTierRank(actorPower.speed)} vs ${formatTierRank(targetPower.speed)}).`;
}

function buildIntelligenceLine(input: {
  actorLabel: string;
  targetLabel: string;
  actorPower: PowerStats;
  targetPower: PowerStats;
  intelligenceTierGap: number | null;
}): string | null {
  const {
    actorLabel,
    targetLabel,
    actorPower,
    targetPower,
    intelligenceTierGap,
  } = input;

  if (intelligenceTierGap == null || intelligenceTierGap === 0) {
    return null;
  }

  if (intelligenceTierGap >= 1) {
    return `${actorLabel} has the tactical intelligence edge (${formatTierRank(actorPower.intelligence)} vs ${formatTierRank(targetPower.intelligence)}).`;
  }

  return `${targetLabel} has the tactical intelligence edge (${formatTierRank(targetPower.intelligence)} vs ${formatTierRank(actorPower.intelligence)}).`;
}

export function isHostileCombatAction(input: {
  actionText?: string | null;
  intent?: string | null;
  method?: string | null;
}): boolean {
  // Forbidden for player-turn pre-GM orchestration. This regex helper is only
  // for NPC/internal paths or explicitly GM-selected combat helper flows.
  const combined = [input.actionText, input.intent, input.method]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ");

  if (!combined.trim()) {
    return false;
  }

  return HOSTILE_ACTION_PATTERNS.some((pattern) => pattern.test(combined));
}

export function isCombatPressureAction(input: {
  actionText?: string | null;
  intent?: string | null;
  method?: string | null;
}): boolean {
  const combined = [input.actionText, input.intent, input.method]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ");

  if (!combined.trim()) {
    return false;
  }

  return (
    isHostileCombatAction(input)
    || COMBAT_PRESSURE_PATTERNS.some((pattern) => pattern.test(combined))
  );
}

function buildStrongHitBounds(envelope: CombatEnvelope): NarrativeOutcomeBounds {
  const actorHasAngle =
    envelope.actorBypassesTarget || envelope.relevantVulnerabilities.length > 0;
  const vulnerabilityFact =
    envelope.relevantVulnerabilities.length > 0
      ? "A listed target vulnerability can anchor the concrete payoff."
      : null;

  switch (envelope.matchup) {
    case "dominant":
      return {
        ceilings: capFacts(
          [
            "The beat can read as decisive control, real bodily damage, or hard mission loss.",
            actorHasAngle
              ? "A live angle can collapse a defense layer outright."
              : "A clean initiative break is in-bounds.",
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The target loses ground, guard, or a concrete asset.",
            "The actor's superiority is visible on the page.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "A sudden reversal into target dominance is outside this envelope.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: dominant strong hit lands as visible superiority with decisive local control.",
      };
    case "advantaged":
      return {
        ceilings: capFacts(
          [
            "The beat can seize initiative, wound, or force retreat.",
            vulnerabilityFact ?? "The target can be pushed off-plan in a concrete way.",
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The target pays a positional, tactical, or bodily cost.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            actorHasAngle ? null : "An effortless one-beat finish is outside this envelope.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: advantaged strong hit clearly tilts the scene without demanding instant finality.",
      };
    case "contested":
      return {
        ceilings: capFacts(
          [
            "The beat can win a short exchange, mark the body, or expose a weakness.",
            vulnerabilityFact,
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "A real cost lands on the target.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "An effortless rout or total shutout is outside this envelope.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: contested strong hit wins a meaningful beat, not the whole fight at once.",
      };
    case "disadvantaged":
      return {
        ceilings: capFacts(
          [
            actorHasAngle
              ? "The beat can cash an angle into disruption, escape space, or weakness exposure."
              : "The beat can buy space, disrupt tempo, or create a narrow reset.",
            vulnerabilityFact,
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The action changes the position in a tangible way.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "Direct bodily domination is outside this envelope.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: disadvantaged strong hit converts angle into local gain, not clean overpowering.",
      };
    case "outmatched":
      return {
        ceilings: capFacts(
          [
            actorHasAngle
              ? "The beat can realize an angle into escape, seal setup, or exposed weakness."
              : "The beat can only open a slim survival window or brief disruption.",
            vulnerabilityFact,
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The action still matters in immediate scene terms.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "A clean frontal overpowering of the stronger side is outside this envelope.",
            "A final defeat read is outside this envelope.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: outmatched strong hit cashes a narrow angle into survival-grade momentum, not domination.",
      };
  }
}

function buildWeakHitBounds(envelope: CombatEnvelope): NarrativeOutcomeBounds {
  const vulnerabilityFact =
    envelope.relevantVulnerabilities.length > 0
      ? "A listed target vulnerability can shape the complication path."
      : null;

  switch (envelope.matchup) {
    case "dominant":
      return {
        ceilings: capFacts(
          [
            "The beat can force reposition, partial damage, or a broken formation.",
            vulnerabilityFact,
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The target yields the beat even if the scene stays unstable.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "Immediate final resolution is outside this beat.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: dominant weak hit still controls the exchange, but the scene does not close cleanly.",
      };
    case "advantaged":
      return {
        ceilings: capFacts(
          [
            "The beat can impose pressure, partial injury, or a concrete opening.",
            vulnerabilityFact,
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "A visible gain lands before the complication bites back.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "A fully settled finish is outside this beat.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: advantaged weak hit earns real momentum while leaving the scene unstable.",
      };
    case "contested":
      return {
        ceilings: capFacts(
          [
            "The beat can win a glancing exchange, force movement, or expose a weakness.",
            vulnerabilityFact,
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The actor ends the moment slightly ahead.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "A decisive rout is outside this beat.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: contested weak hit takes a small edge and pays for it immediately.",
      };
    case "disadvantaged":
      return {
        ceilings: capFacts(
          [
            "The beat can create breathing room, a setup seed, or a visible weakness tag.",
            vulnerabilityFact,
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The actor stays relevant on better terms for a moment.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "Direct overpowering is outside this beat.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: disadvantaged weak hit buys momentary leverage, not raw control.",
      };
    case "outmatched":
      return {
        ceilings: capFacts(
          [
            "The beat can win breathing room, setup time, or a narrow escape lane.",
            vulnerabilityFact,
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The actor avoids immediate collapse for a moment.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "A bodily takedown read is outside this beat.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: outmatched weak hit survives the moment without flipping the matchup truth.",
      };
  }
}

function buildMissBounds(envelope: CombatEnvelope): NarrativeOutcomeBounds {
  switch (envelope.matchup) {
    case "dominant":
      return {
        ceilings: capFacts(
          [
            "The miss can concede tempo, collateral, or a narrow opening.",
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The stronger side still reads as the heavier force in the scene.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "This miss does not prove the weaker side now owns the fight.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: dominant miss drops the beat, not the larger matchup truth.",
      };
    case "advantaged":
      return {
        ceilings: capFacts(
          [
            "The miss can hand over initiative, position, or a tactical scare.",
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The actor loses the beat, not the whole logic of the matchup.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "An instant reversal into helplessness is outside this envelope.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: advantaged miss stings, but it should not erase the actor's edge outright.",
      };
    case "contested":
      return {
        ceilings: capFacts(
          [
            "The miss can hand the other side initiative or force immediate risk.",
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "Parity remains the truthful read after the miss lands.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "A one-beat absolute swing is outside this envelope.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: contested miss gives away the moment, not the entire conflict.",
      };
    case "disadvantaged":
      return {
        ceilings: capFacts(
          [
            "The miss can cost position, time, or force retreat under pressure.",
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The target's edge becomes visible and pressing.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "An unearned hidden upside is outside this envelope.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: disadvantaged miss exposes the actor to pressure and makes the gap felt.",
      };
    case "outmatched":
      return {
        ceilings: capFacts(
          [
            "The miss can trigger severe punishment, hard separation, or crisis management.",
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The weaker side is now surviving, not dictating pace.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "A clean reversal into actor control is outside this envelope.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: outmatched miss turns the scene toward survival pressure, not hidden advantage.",
      };
  }
}

export function buildNarrativeOutcomeBounds(
  envelope: CombatEnvelope,
  outcome: OutcomeTierLike,
): NarrativeOutcomeBounds {
  switch (outcome) {
    case "strong_hit":
      return buildStrongHitBounds(envelope);
    case "weak_hit":
      return buildWeakHitBounds(envelope);
    case "miss":
      return buildMissBounds(envelope);
    default:
      return {
        ceilings: capFacts(
          [
            "The beat can move the scene locally without resolving the whole conflict.",
          ],
          MAX_BOUNDS_LINES,
        ),
        floors: capFacts(
          [
            "The current matchup truth should remain legible on the page.",
          ],
          MAX_BOUNDS_LINES,
        ),
        prohibitions: capFacts(
          [
            "An unexplained total reversal is outside this envelope.",
          ],
          MAX_BOUNDS_LINES,
        ),
        summary:
          "Truthful read: unknown outcome falls back to localized consequences that preserve matchup clarity.",
      };
  }
}

export function formatNarrativeOutcomeBoundsBlock(
  bounds: NarrativeOutcomeBounds,
): string {
  return [
    "[OUTCOME BOUNDS]",
    `Summary: ${bounds.summary}`,
    ...bounds.ceilings.map((line) => `Ceiling: ${line}`),
    ...bounds.floors.map((line) => `Floor: ${line}`),
    ...bounds.prohibitions.map((line) => `Constraint: ${line}`),
  ].join("\n");
}

export function deriveCombatPosture(
  envelope: CombatEnvelope,
  options: DeriveCombatPostureOptions,
): NpcCombatPosture {
  const actorHasAngle =
    envelope.actorBypassesTarget || envelope.relevantVulnerabilities.length > 0;
  const canWin =
    actorHasAngle
    || envelope.matchup === "dominant"
    || envelope.matchup === "advantaged"
    || envelope.matchup === "contested";

  let posture: CombatPosture;
  switch (envelope.matchup) {
    case "dominant":
      posture = envelope.targetBypassesActor ? "press" : "aggress";
      break;
    case "advantaged":
      posture = envelope.targetBypassesActor ? "trade" : "press";
      break;
    case "contested":
      posture = envelope.actorBypassesTarget || envelope.targetBypassesActor ? "trade" : "probe";
      break;
    case "disadvantaged":
      posture = actorHasAngle ? "probe" : "withdraw";
      break;
    case "outmatched":
      posture = actorHasAngle ? "withdraw" : "disengage";
      break;
  }

  const mustAvoid = capFacts(
    [
      !envelope.actorBypassesTarget && envelope.durabilityTierGap >= 2
        ? "A frontal force race is losing business here."
        : null,
      envelope.targetBypassesActor
        ? "A stationary exchange leaves the actor open to target hax."
        : null,
      envelope.speedTierGap <= -1
        ? "Slow open-range setup gives the faster side first say."
        : null,
    ],
    MAX_POSTURE_AVOID_LINES,
  );

  const exposedTargetVulnerabilities = collectExposedVulnerabilityFacts(
    envelope,
    MAX_POSTURE_VULNERABILITIES,
  );
  const vulnerabilityFact =
    exposedTargetVulnerabilities.length > 0
      ? "A listed target vulnerability is live in this scene."
      : null;

  const guidanceLines = (() => {
    switch (posture) {
      case "aggress":
        return capFacts(
          [
            "Immediate initiative is the truthful read.",
            "The target can be forced onto the back foot.",
            vulnerabilityFact,
          ],
          MAX_POSTURE_GUIDANCE_LINES,
        );
      case "press":
        return capFacts(
          [
            "Sustained pressure favors the actor.",
            "Concrete initiative is available before the target resets.",
            vulnerabilityFact,
          ],
          MAX_POSTURE_GUIDANCE_LINES,
        );
      case "trade":
        return capFacts(
          [
            "A committed exchange can pay off, but the return hit is real.",
            "Winning the beat matters more than winning clean.",
            vulnerabilityFact,
          ],
          MAX_POSTURE_GUIDANCE_LINES,
        );
      case "probe":
        return capFacts(
          [
            "Small tests and angle-finding fit this matchup.",
            "Information and weakness exposure matter more than raw damage.",
            vulnerabilityFact,
          ],
          MAX_POSTURE_GUIDANCE_LINES,
        );
      case "withdraw":
        return capFacts(
          [
            "Space and setup matter more than collision.",
            "The actor stays live by preserving angle and tempo.",
            vulnerabilityFact,
          ],
          MAX_POSTURE_GUIDANCE_LINES,
        );
      case "disengage":
        return capFacts(
          [
            "Survival and reset outrank direct collision.",
            "The actor is not the truthful owner of a straight exchange.",
            vulnerabilityFact,
          ],
          MAX_POSTURE_GUIDANCE_LINES,
        );
    }
  })();

  return {
    posture,
    vsLabel: options.vsLabel,
    matchup: envelope.matchup,
    canWin,
    mustAvoid,
    exposedTargetVulnerabilities,
    guidanceLines,
  };
}

export function buildCombatEnvelope(
  options: BuildCombatEnvelopeOptions,
): CombatEnvelope | null {
  if (!options.hostileAction) {
    return null;
  }

  const actorPower = options.actor?.powerStats ?? null;
  const targetPower = options.target?.powerStats ?? null;
  if (!actorPower || !targetPower) {
    return null;
  }

  const actorLabel = options.actor?.label?.trim() || "Actor";
  const targetLabel = options.target?.label?.trim() || "Target";

  const durabilityGap = tierDistance(
    AP_DURABILITY_TIERS,
    targetPower.durability,
    actorPower.attackPotency,
  );
  const speedGap = tierDistance(
    SPEED_TIERS,
    actorPower.speed,
    targetPower.speed,
  );
  const intelligenceGap = tierDistance(
    INTELLIGENCE_TIERS,
    actorPower.intelligence,
    targetPower.intelligence,
  );

  const actorBypassSources = actorPower.hax
    .filter((hax) => canHaxBypass(hax, targetPower.durability))
    .map((hax) => hax.name);
  const targetBypassSources = targetPower.hax
    .filter((hax) => canHaxBypass(hax, actorPower.durability))
    .map((hax) => hax.name);

  const actorBypassesTarget = actorBypassSources.length > 0;
  const targetBypassesActor = targetBypassSources.length > 0;
  const relevantVulnerabilities = collectRelevantVulnerabilities(
    targetPower,
    options.actionText,
  );

  const matchup = classifyMatchup({
    durabilityTierGap: durabilityGap.tiers,
    speedTierGap: speedGap.tiers,
    intelligenceTierGap: intelligenceGap.tiers,
    actorBypassesTarget,
    targetBypassesActor,
  });

  const summaryLines = [
    `Matchup: ${matchup}.`,
    buildDurabilityLine({
      actorLabel,
      targetLabel,
      actorPower,
      targetPower,
      durabilityTierGap: durabilityGap.tiers,
      actorBypassesTarget,
      actorBypassSources,
    }),
    buildSpeedLine({
      actorLabel,
      targetLabel,
      actorPower,
      targetPower,
      speedTierGap: speedGap.tiers,
    }),
    ...(targetBypassesActor
      ? [`${targetLabel} can bypass ${actorLabel}'s durability via ${targetBypassSources.join(", ")}.`]
      : []),
    ...(
      buildIntelligenceLine({
        actorLabel,
        targetLabel,
        actorPower,
        targetPower,
        intelligenceTierGap: intelligenceGap.tiers,
      })
        ? [
            buildIntelligenceLine({
              actorLabel,
              targetLabel,
              actorPower,
              targetPower,
              intelligenceTierGap: intelligenceGap.tiers,
            })!,
          ]
        : []
    ),
    ...(relevantVulnerabilities.length > 0
      ? [
          `Relevant target vulnerabilities: ${relevantVulnerabilities
            .map((vulnerability) => `${vulnerability.description} (${vulnerability.severity})`)
            .join("; ")}.`,
        ]
      : []),
  ];

  return {
    matchup,
    durabilityTierGap: durabilityGap.tiers,
    durabilityStepGap: durabilityGap.total,
    speedTierGap: speedGap.tiers,
    speedStepGap: speedGap.total,
    intelligenceTierGap: intelligenceGap.tiers,
    intelligenceStepGap: intelligenceGap.total,
    actorBypassesTarget,
    targetBypassesActor,
    actorBypassSources,
    targetBypassSources,
    relevantVulnerabilities,
    summaryLines,
  };
}
