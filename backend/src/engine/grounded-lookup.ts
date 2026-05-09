/**
 * Grounded lookup dispatcher + VS Battles power comparison utilities.
 *
 * runGroundedLookup: dispatches chat /lookup commands to world facts, character
 * facts, power profiles, or event clarifications using campaign DB + ipContext.
 *
 * lookupCharacterPower / compareCharacterPower: programmatic axis-by-axis
 * power comparison using PowerStats (tier+rank), hax bypass detection.
 */

import type {
  CharacterIdentitySourceCitation,
  CharacterRecord,
  IpResearchContext,
  PowerStats,
  TierRank,
  ApDurabilityTier,
  HaxAbility,
} from "@worldforge/shared";
import {
  AP_DURABILITY_TIERS,
  SPEED_TIERS,
  INTELLIGENCE_TIERS,
  compareTiers,
  canHaxBypass,
  formatTierRank,
} from "@worldforge/shared";
import { eq } from "drizzle-orm";
import { readCampaignConfig } from "../campaign/index.js";
import { getDb } from "../db/index.js";
import { npcs, players } from "../db/schema.js";

// -- Types --------------------------------------------------------------------

export interface PowerLookupResult {
  subject: string;
  answer: string;
  hasData: boolean;
}

export interface PowerComparisonResult {
  subjectA: string;
  subjectB: string;
  answer: string;
  axisResults: AxisComparison[];
  bypasses: string[];
  hasCompleteData: boolean;
}

export interface AxisComparison {
  axis: string;
  result: "A wins" | "B wins" | "tie";
  detail: string;
}

// -- Grounded lookup dispatcher -----------------------------------------------

export type LookupKind =
  | "world_canon_fact"
  | "character_canon_fact"
  | "power_profile"
  | "event_clarification";

export interface GroundedLookupRequest {
  campaignId: string;
  lookupKind: LookupKind;
  subject: string;
  compareAgainst?: string;
  question?: string;
}

export interface GroundedLookupResult {
  lookupKind: LookupKind;
  subject: string;
  answer: string;
  citations: CharacterIdentitySourceCitation[];
  uncertaintyNotes: string[];
  sceneImpact: string;
}

interface CharacterLookupEntry {
  id: string;
  name: string;
  powerStats?: PowerStats;
}

const LOOKUP_SCENE_IMPACT =
  "Lookup only: clarifies the factual baseline without consuming a scene turn.";

export async function runGroundedLookup(
  request: GroundedLookupRequest,
): Promise<GroundedLookupResult> {
  const ipContext = safeReadIpContext(request.campaignId);
  const characterEntries = loadCharacterEntries(request.campaignId);

  switch (request.lookupKind) {
    case "world_canon_fact":
      return buildWorldFactResult(request, ipContext);
    case "event_clarification":
      return buildEventClarificationResult(request, ipContext);
    case "character_canon_fact":
      return buildCharacterFactResult(request, characterEntries, ipContext);
    case "power_profile":
      return buildPowerProfileResult(request, characterEntries);
  }
}

function buildWorldFactResult(
  request: GroundedLookupRequest,
  ipContext: IpResearchContext | null,
): GroundedLookupResult {
  const matches = findIpFacts(ipContext, request.subject);
  const answer = matches.length > 0
    ? `Stored canon grounding for ${request.subject}: ${matches
        .slice(0, 3)
        .map((fact) => fact.excerpt)
        .join(" ")}`
    : `No stored world canon fact matched "${request.subject}" closely enough.`;

  return {
    lookupKind: request.lookupKind,
    subject: request.subject,
    answer,
    citations: matches,
    uncertaintyNotes: matches.length > 0
      ? []
      : ["No saved ipContext fact matched this world-canon request closely."],
    sceneImpact: LOOKUP_SCENE_IMPACT,
  };
}

function buildEventClarificationResult(
  request: GroundedLookupRequest,
  ipContext: IpResearchContext | null,
): GroundedLookupResult {
  const matches = findIpFacts(ipContext, request.subject);
  const questionSuffix = request.question?.trim()
    ? ` ${request.question.trim()}`
    : "";
  const answer = matches.length > 0
    ? `Stored event clarification for ${request.subject}:${questionSuffix} ${matches
        .slice(0, 3)
        .map((fact) => fact.excerpt)
        .join(" ")}`
    : `No saved event clarification for "${request.subject}" was available in the campaign research cache.`;

  return {
    lookupKind: request.lookupKind,
    subject: request.subject,
    answer: answer.trim(),
    citations: matches,
    uncertaintyNotes: matches.length > 0
      ? []
      : ["Event clarification found no direct match in saved campaign canon cache."],
    sceneImpact: LOOKUP_SCENE_IMPACT,
  };
}

function buildCharacterFactResult(
  request: GroundedLookupRequest,
  characterEntries: CharacterLookupEntry[],
  ipContext: IpResearchContext | null,
): GroundedLookupResult {
  const character = findCharacterEntry(characterEntries, request.subject);
  if (!character) {
    return {
      lookupKind: request.lookupKind,
      subject: request.subject,
      answer: `No character named "${request.subject}" found in this campaign.`,
      citations: findIpFacts(ipContext, request.subject),
      uncertaintyNotes: ["Character lookup bounded to stored campaign data."],
      sceneImpact: LOOKUP_SCENE_IMPACT,
    };
  }

  const ipFacts = findIpFacts(ipContext, request.subject);
  const answer = ipFacts.length > 0
    ? `Canon facts for ${request.subject}: ${ipFacts.map((f) => f.excerpt).join(" ")}`
    : `Character "${request.subject}" exists but no stored canon facts available.`;

  return {
    lookupKind: request.lookupKind,
    subject: request.subject,
    answer,
    citations: ipFacts,
    uncertaintyNotes: ipFacts.length > 0 ? [] : ["No canon facts stored for this character."],
    sceneImpact: LOOKUP_SCENE_IMPACT,
  };
}

function buildPowerProfileResult(
  request: GroundedLookupRequest,
  characterEntries: CharacterLookupEntry[],
): GroundedLookupResult {
  const primary = findCharacterEntry(characterEntries, request.subject);
  const secondary = request.compareAgainst
    ? findCharacterEntry(characterEntries, request.compareAgainst)
    : null;

  if (!primary?.powerStats) {
    return {
      lookupKind: request.lookupKind,
      subject: request.subject,
      answer: `No stored power assessment for "${request.subject}" in this campaign.`,
      citations: [],
      uncertaintyNotes: ["Power lookup bounded to stored PowerStats; no live inference performed."],
      sceneImpact: LOOKUP_SCENE_IMPACT,
    };
  }

  if (secondary) {
    const comparison = compareCharacterPower(
      request.subject,
      primary.powerStats,
      request.compareAgainst!,
      secondary.powerStats,
    );
    return {
      lookupKind: request.lookupKind,
      subject: request.subject,
      answer: comparison.answer,
      citations: [],
      uncertaintyNotes: comparison.hasCompleteData
        ? []
        : ["Incomplete power data for comparison."],
      sceneImpact: LOOKUP_SCENE_IMPACT,
    };
  }

  const singleLookup = lookupCharacterPower(request.subject, primary.powerStats);
  return {
    lookupKind: request.lookupKind,
    subject: request.subject,
    answer: singleLookup.answer,
    citations: [],
    uncertaintyNotes: [],
    sceneImpact: LOOKUP_SCENE_IMPACT,
  };
}

// -- DB helpers ---------------------------------------------------------------

function safeReadIpContext(campaignId: string): IpResearchContext | null {
  try {
    return readCampaignConfig(campaignId).ipContext ?? null;
  } catch {
    return null;
  }
}

function loadCharacterEntries(campaignId: string): CharacterLookupEntry[] {
  const db = getDb();

  const playerRows = db
    .select({
      id: players.id,
      name: players.name,
      characterRecord: players.characterRecord,
    })
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .all();

  const npcRows = db
    .select({
      id: npcs.id,
      name: npcs.name,
      characterRecord: npcs.characterRecord,
    })
    .from(npcs)
    .where(eq(npcs.campaignId, campaignId))
    .all();

  return [...playerRows, ...npcRows].map((row) => ({
    id: row.id,
    name: row.name,
    powerStats: parsePowerStats(row.characterRecord),
  }));
}

function parsePowerStats(rawRecord: string | null | undefined): PowerStats | undefined {
  if (!rawRecord) return undefined;
  try {
    const parsed = JSON.parse(rawRecord) as CharacterRecord;
    return parsed.powerStats;
  } catch {
    return undefined;
  }
}

function findCharacterEntry(
  entries: CharacterLookupEntry[],
  subject: string,
): CharacterLookupEntry | undefined {
  const normalizedSubject = normalize(subject);
  return entries.find((entry) => normalize(entry.name) === normalizedSubject)
    ?? entries.find((entry) => normalize(entry.name).includes(normalizedSubject))
    ?? entries.find((entry) => normalizedSubject.includes(normalize(entry.name)));
}

function findIpFacts(
  ipContext: IpResearchContext | null,
  subject: string,
): CharacterIdentitySourceCitation[] {
  if (!ipContext || !subject.trim()) return [];

  const tokens = tokenize(subject);
  const primaryMatches = ipContext.keyFacts
    .filter((fact) => matchesSubject(fact, tokens))
    .slice(0, 3)
    .map((fact) => ({
      kind: "research" as const,
      label: ipContext.franchise,
      excerpt: fact,
    }));

  if (primaryMatches.length > 0) return primaryMatches;

  return (ipContext.sourceGroups ?? [])
    .flatMap((group) =>
      group.keyFacts
        .filter((fact) => matchesSubject(fact, tokens))
        .slice(0, 2)
        .map((fact) => ({
          kind: "research" as const,
          label: group.sourceName,
          excerpt: fact,
        })),
    )
    .slice(0, 3);
}

function matchesSubject(text: string, tokens: string[]): boolean {
  const normalizedText = normalize(text);
  return tokens.every((token) => normalizedText.includes(token));
}

function tokenize(value: string): string[] {
  return dedupeStrings(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped;
}

// -- Single character power lookup --------------------------------------------

/**
 * Format a single character's power stats for display.
 * Returns a structured answer with tier+rank for each axis, hax, and vulnerabilities.
 * If the character has no powerStats, returns a clear absence message.
 */
export function lookupCharacterPower(
  subject: string,
  powerStats: PowerStats | undefined,
): PowerLookupResult {
  if (!powerStats) {
    return {
      subject,
      answer: `No stored power assessment for ${subject}.`,
      hasData: false,
    };
  }

  const axes = [
    `AP=${formatTierRank(powerStats.attackPotency)}`,
    `Speed=${formatTierRank(powerStats.speed)}`,
    `Dur=${formatTierRank(powerStats.durability)}`,
    `Int=${formatTierRank(powerStats.intelligence)}`,
  ].join(", ");

  const parts = [`${subject}: ${axes}`];

  if (powerStats.hax.length > 0) {
    const haxList = powerStats.hax.map((h) => {
      const bypass = h.bypassTier ? `, bypasses ${h.bypassTier}` : "";
      const limits =
        h.limitations.length > 0
          ? `, limits: ${h.limitations.join("; ")}`
          : "";
      return `${h.name} (${h.type}${bypass}${limits})`;
    });
    parts.push(`Hax: ${haxList.join("; ")}`);
  }

  if (powerStats.vulnerabilities.length > 0) {
    const vulnList = powerStats.vulnerabilities.map(
      (v) => `${v.description} (${v.severity})`,
    );
    parts.push(`Vulnerabilities: ${vulnList.join("; ")}`);
  }

  return {
    subject,
    answer: parts.join("\n"),
    hasData: true,
  };
}

// -- Two-character power comparison -------------------------------------------

function compareAxis<T extends string>(
  axisName: string,
  tierList: readonly T[],
  a: TierRank<T>,
  b: TierRank<T>,
  nameA: string,
  nameB: string,
): AxisComparison {
  const cmp = compareTiers(tierList, a, b);
  if (cmp > 0) {
    return {
      axis: axisName,
      result: "A wins",
      detail: `${axisName}: ${nameA} (${formatTierRank(a)}) > ${nameB} (${formatTierRank(b)})`,
    };
  }
  if (cmp < 0) {
    return {
      axis: axisName,
      result: "B wins",
      detail: `${axisName}: ${nameB} (${formatTierRank(b)}) > ${nameA} (${formatTierRank(a)})`,
    };
  }
  return {
    axis: axisName,
    result: "tie",
    detail: `${axisName}: Tied at ${formatTierRank(a)}`,
  };
}

function detectBypasses(
  haxList: HaxAbility[],
  targetDurability: TierRank<ApDurabilityTier>,
  attackerName: string,
  defenderName: string,
): string[] {
  return haxList
    .filter((h) => canHaxBypass(h, targetDurability))
    .map(
      (h) =>
        `${attackerName}'s ${h.name} (${h.type}) bypasses ${defenderName}'s durability (${formatTierRank(targetDurability)})`,
    );
}

/**
 * Compare two characters' power stats axis by axis.
 * Handles missing data gracefully: if either character lacks powerStats,
 * the result states which character has no data.
 */
export function compareCharacterPower(
  nameA: string,
  powerA: PowerStats | undefined,
  nameB: string,
  powerB: PowerStats | undefined,
): PowerComparisonResult {
  // Handle missing data
  if (!powerA && !powerB) {
    return {
      subjectA: nameA,
      subjectB: nameB,
      answer: `No stored power assessment for ${nameA} or ${nameB}.`,
      axisResults: [],
      bypasses: [],
      hasCompleteData: false,
    };
  }

  if (!powerA) {
    const bLookup = lookupCharacterPower(nameB, powerB);
    return {
      subjectA: nameA,
      subjectB: nameB,
      answer: `No stored power assessment for ${nameA}. ${bLookup.answer}`,
      axisResults: [],
      bypasses: [],
      hasCompleteData: false,
    };
  }

  if (!powerB) {
    const aLookup = lookupCharacterPower(nameA, powerA);
    return {
      subjectA: nameA,
      subjectB: nameB,
      answer: `No stored power assessment for ${nameB}. ${aLookup.answer}`,
      axisResults: [],
      bypasses: [],
      hasCompleteData: false,
    };
  }

  // Both have data — compare axis by axis
  const axisResults: AxisComparison[] = [
    compareAxis("AP", AP_DURABILITY_TIERS, powerA.attackPotency, powerB.attackPotency, nameA, nameB),
    compareAxis("Speed", SPEED_TIERS, powerA.speed, powerB.speed, nameA, nameB),
    compareAxis("Durability", AP_DURABILITY_TIERS, powerA.durability, powerB.durability, nameA, nameB),
    compareAxis("Intelligence", INTELLIGENCE_TIERS, powerA.intelligence, powerB.intelligence, nameA, nameB),
  ];

  // Detect hax bypasses in both directions
  const bypasses = [
    ...detectBypasses(powerA.hax, powerB.durability, nameA, nameB),
    ...detectBypasses(powerB.hax, powerA.durability, nameB, nameA),
  ];

  // Build answer
  const lines = axisResults.map((r) => r.detail);
  if (bypasses.length > 0) {
    lines.push(`Hax bypasses: ${bypasses.join("; ")}`);
  }

  // Vulnerability notes
  if (powerA.vulnerabilities.length > 0) {
    lines.push(
      `${nameA} vulnerabilities: ${powerA.vulnerabilities.map((v) => `${v.description} (${v.severity})`).join("; ")}`,
    );
  }
  if (powerB.vulnerabilities.length > 0) {
    lines.push(
      `${nameB} vulnerabilities: ${powerB.vulnerabilities.map((v) => `${v.description} (${v.severity})`).join("; ")}`,
    );
  }

  return {
    subjectA: nameA,
    subjectB: nameB,
    answer: lines.join("\n"),
    axisResults,
    bypasses,
    hasCompleteData: true,
  };
}
