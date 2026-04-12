import type {
  CharacterGroundingProfile,
  CharacterIdentitySourceCitation,
  CharacterRecord,
  IpResearchContext,
} from "@worldforge/shared";
import { eq } from "drizzle-orm";
import { readCampaignConfig } from "../campaign/index.js";
import { getDb } from "../db/index.js";
import { npcs, players } from "../db/schema.js";

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
  grounding?: CharacterGroundingProfile;
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
      return buildPowerProfileResult(request, characterEntries, ipContext);
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
    : `No stored world canon fact matched "${request.subject}" closely enough. The lookup remains bounded to the campaign's saved research and should be treated as uncertain.`;

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
    ? `Stored event clarification for ${request.subject}:${questionSuffix ? `${questionSuffix}` : ""} ${matches
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
      : ["Event clarification fell back to the saved campaign canon cache and found no direct match."],
    sceneImpact: LOOKUP_SCENE_IMPACT,
  };
}

function buildCharacterFactResult(
  request: GroundedLookupRequest,
  characterEntries: CharacterLookupEntry[],
  ipContext: IpResearchContext | null,
): GroundedLookupResult {
  const character = findCharacterEntry(characterEntries, request.subject);
  if (!character?.grounding) {
    return {
      lookupKind: request.lookupKind,
      subject: request.subject,
      answer: `No durable grounded character profile for "${request.subject}" is stored in this campaign yet.`,
      citations: findIpFacts(ipContext, request.subject),
      uncertaintyNotes: [
        "Character lookup is bounded to stored grounding and saved world canon; no fresh live search was performed.",
      ],
      sceneImpact: LOOKUP_SCENE_IMPACT,
    };
  }

  const grounding = character.grounding;
  const answerParts = [
    grounding.summary,
    grounding.facts[0],
    grounding.signatureMoves.length > 0
      ? `Signature moves: ${grounding.signatureMoves.slice(0, 2).join(", ")}.`
      : "",
  ].filter(Boolean);

  return {
    lookupKind: request.lookupKind,
    subject: request.subject,
    answer: answerParts.join(" "),
    citations: grounding.sources,
    uncertaintyNotes: grounding.uncertaintyNotes,
    sceneImpact: LOOKUP_SCENE_IMPACT,
  };
}

function buildPowerProfileResult(
  request: GroundedLookupRequest,
  characterEntries: CharacterLookupEntry[],
  ipContext: IpResearchContext | null,
): GroundedLookupResult {
  const primary = findCharacterEntry(characterEntries, request.subject);
  const secondary = request.compareAgainst
    ? findCharacterEntry(characterEntries, request.compareAgainst)
    : null;

  const primaryPower = primary?.grounding?.powerProfile;
  const secondaryPower = secondary?.grounding?.powerProfile;

  if (!primaryPower) {
    return {
      lookupKind: request.lookupKind,
      subject: request.subject,
      answer: `No stored grounded power profile for "${request.subject}" is available in this campaign.`,
      citations: [
        ...findIpFacts(ipContext, request.subject),
        ...findIpFacts(ipContext, request.compareAgainst ?? ""),
      ].slice(0, 4),
      uncertaintyNotes: [
        "Power comparison stays bounded to saved grounded profiles; no live ranking inference was performed.",
      ],
      sceneImpact: LOOKUP_SCENE_IMPACT,
    };
  }

  const answer = secondaryPower
    ? [
        `${request.subject}: attack ${primaryPower.attack} speed ${primaryPower.speed} durability ${primaryPower.durability}`,
        `${request.compareAgainst}: attack ${secondaryPower.attack} speed ${secondaryPower.speed} durability ${secondaryPower.durability}`,
        `${request.subject} strengths: ${primaryPower.strengths.slice(0, 2).join(", ") || "none stored"}.`,
        `${request.compareAgainst} strengths: ${secondaryPower.strengths.slice(0, 2).join(", ") || "none stored"}.`,
      ].join(" ")
    : [
        `${request.subject}: attack ${primaryPower.attack} speed ${primaryPower.speed} durability ${primaryPower.durability} range ${primaryPower.range}`,
        primaryPower.strengths.length > 0
          ? `Strengths: ${primaryPower.strengths.slice(0, 3).join(", ")}.`
          : "",
      ].filter(Boolean).join(" ");

  const citations = [
    ...(primary?.grounding?.sources ?? []),
    ...(secondary?.grounding?.sources ?? []),
  ].slice(0, 6);

  return {
    lookupKind: request.lookupKind,
    subject: request.subject,
    answer,
    citations,
    uncertaintyNotes: dedupeStrings([
      ...(primaryPower.uncertaintyNotes ?? []),
      ...(secondaryPower?.uncertaintyNotes ?? []),
    ]),
    sceneImpact: LOOKUP_SCENE_IMPACT,
  };
}

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
    grounding: parseGrounding(row.characterRecord),
  }));
}

function parseGrounding(rawRecord: string | null | undefined): CharacterGroundingProfile | undefined {
  if (!rawRecord) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawRecord) as CharacterRecord;
    return parsed.grounding;
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
  if (!ipContext || !subject.trim()) {
    return [];
  }

  const tokens = tokenize(subject);
  const primaryMatches = ipContext.keyFacts
    .filter((fact) => matchesSubject(fact, tokens))
    .slice(0, 3)
    .map((fact) => ({
      kind: "research" as const,
      label: ipContext.franchise,
      excerpt: fact,
    }));

  if (primaryMatches.length > 0) {
    return primaryMatches;
  }

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
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}
