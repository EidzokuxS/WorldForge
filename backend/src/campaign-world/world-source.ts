import crypto from "node:crypto";
import type {
  CampaignWorldDna,
  CampaignWorldSource,
  CampaignWorldSourceReference,
  CampaignWorldStatus,
  CampaignWorldbookSelection,
  WorldSeeds,
  WorldgenResearchArtifactV2,
} from "@worldforge/shared";
import {
  readCampaignConfigSnapshot,
  saveWorldSeeds,
  type CampaignConfigSnapshot,
} from "../campaign/index.js";
import { withCampaignWorldSourceLock } from "./world-source-lock.js";

const DNA_FIELDS = [
  "geography",
  "politicalStructure",
  "centralConflict",
  "culturalFlavor",
  "environment",
  "wildcard",
] as const;

const CANONICAL_NAME_FIELDS = [
  "locations",
  "factions",
  "characters",
] as const;

interface NormalizedCanonicalNames {
  locations?: string[];
  collectives?: string[];
  characters?: string[];
}

interface NormalizedResearchContext {
  franchise: string;
  keyFacts: string[];
  tonalNotes: string[];
  canonicalNames: NormalizedCanonicalNames | null;
  source: "mcp" | "llm";
  sourceGroups: Array<{
    sourceName: string;
    priority: "primary" | "supplementary";
    keyFacts: string[];
    canonicalNames: NormalizedCanonicalNames | null;
  }>;
}

type CampaignConfig = CampaignConfigSnapshot["config"];

export type CampaignWorldSourceErrorCode =
  | "campaign_source_invalid"
  | "campaign_dna_invalid"
  | "world_build_running"
  | "campaign_world_exists";

export class CampaignWorldSourceError extends Error {
  constructor(
    readonly code: CampaignWorldSourceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignWorldSourceError";
  }
}

export interface CampaignWorldDnaSaveRequest {
  campaignId: string;
  dna: CampaignWorldDna;
  assertWritable: (campaignId: string) => Promise<void> | void;
}

interface CampaignWorldSourceDependencies {
  readConfigSnapshot: (campaignId: string) => CampaignConfigSnapshot;
  saveSeeds: (campaignId: string, seeds: WorldSeeds) => unknown;
}

export interface CampaignWorldSourceService {
  load(campaignId: string): CampaignWorldSource;
  saveDna(request: CampaignWorldDnaSaveRequest): Promise<CampaignWorldSource>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredTrimmedString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      `Campaign source field ${field} must be a non-empty string.`,
    );
  }
  return value.trim();
}

function trimmedStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      `Campaign source field ${field} must be an array.`,
    );
  }
  return value.map((entry, index) =>
    requiredTrimmedString(entry, `${field}[${index}]`),
  );
}

function assertExactDnaFields(value: Record<string, unknown>): void {
  const keys = Object.keys(value);
  if (
    keys.length !== DNA_FIELDS.length ||
    DNA_FIELDS.some((field) => !Object.hasOwn(value, field))
  ) {
    throw new CampaignWorldSourceError(
      "campaign_dna_invalid",
      "Campaign DNA must contain every defined field and no additional fields.",
    );
  }
}

function worldSeedsToDna(value: unknown): CampaignWorldDna | null {
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new CampaignWorldSourceError(
      "campaign_dna_invalid",
      "Stored Campaign DNA must be an object.",
    );
  }

  assertExactDnaFields(value);
  if (!Array.isArray(value.culturalFlavor) || value.culturalFlavor.length === 0) {
    throw new CampaignWorldSourceError(
      "campaign_dna_invalid",
      "Stored cultural flavor must contain at least one entry.",
    );
  }

  const culturalFlavor = value.culturalFlavor.map((entry, index) => {
    return requiredTrimmedString(
      entry,
      `seeds.culturalFlavor[${index}]`,
    );
  });

  return {
    geography: requiredTrimmedString(value.geography, "seeds.geography"),
    politicalStructure: requiredTrimmedString(
      value.politicalStructure,
      "seeds.politicalStructure",
    ),
    centralConflict: requiredTrimmedString(
      value.centralConflict,
      "seeds.centralConflict",
    ),
    culturalFlavor: culturalFlavor.join("\n"),
    environment: requiredTrimmedString(value.environment, "seeds.environment"),
    wildcard: requiredTrimmedString(value.wildcard, "seeds.wildcard"),
  };
}

function normalizedStoredDna(
  rawConfig: Record<string, unknown>,
  config: CampaignConfig,
): CampaignWorldDna | null {
  if (!Object.hasOwn(rawConfig, "seeds")) {
    return null;
  }

  const rawDna = worldSeedsToDna(rawConfig.seeds);
  if (rawDna === null) {
    throw new CampaignWorldSourceError(
      "campaign_dna_invalid",
      "Stored Campaign DNA is missing.",
    );
  }

  const normalizedDna = worldSeedsToDna(config.seeds);
  if (normalizedDna === null) {
    throw new CampaignWorldSourceError(
      "campaign_dna_invalid",
      "Stored Campaign DNA did not pass campaign normalization.",
    );
  }
  return normalizedDna;
}

function dnaToWorldSeeds(value: CampaignWorldDna): WorldSeeds {
  if (!isRecord(value)) {
    throw new CampaignWorldSourceError(
      "campaign_dna_invalid",
      "Campaign DNA must be an object.",
    );
  }
  assertExactDnaFields(value);

  const culturalFlavor = [requiredTrimmedString(
    value.culturalFlavor,
    "dna.culturalFlavor",
  )];

  return {
    geography: requiredTrimmedString(value.geography, "dna.geography"),
    politicalStructure: requiredTrimmedString(
      value.politicalStructure,
      "dna.politicalStructure",
    ),
    centralConflict: requiredTrimmedString(
      value.centralConflict,
      "dna.centralConflict",
    ),
    culturalFlavor,
    environment: requiredTrimmedString(value.environment, "dna.environment"),
    wildcard: requiredTrimmedString(value.wildcard, "dna.wildcard"),
  };
}

function parseWorldbookSelections(value: unknown): CampaignWorldbookSelection[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      "Campaign worldbook selection must be an array.",
    );
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new CampaignWorldSourceError(
        "campaign_source_invalid",
        `Campaign worldbook selection ${index + 1} must be an object.`,
      );
    }
    const entryCount = entry.entryCount;
    const createdAt = entry.createdAt;
    const updatedAt = entry.updatedAt;
    const expectedFields = [
      "id",
      "displayName",
      "normalizedSourceHash",
      "entryCount",
      "createdAt",
      "updatedAt",
    ];
    if (
      Object.keys(entry).length !== expectedFields.length ||
      expectedFields.some((field) => !Object.hasOwn(entry, field)) ||
      typeof entryCount !== "number" ||
      !Number.isInteger(entryCount) ||
      entryCount < 0 ||
      typeof createdAt !== "number" ||
      !Number.isInteger(createdAt) ||
      createdAt < 0 ||
      typeof updatedAt !== "number" ||
      !Number.isInteger(updatedAt) ||
      updatedAt < 0
    ) {
      throw new CampaignWorldSourceError(
        "campaign_source_invalid",
        `Campaign worldbook selection ${index + 1} has invalid numeric metadata.`,
      );
    }
    return {
      id: requiredTrimmedString(entry.id, `worldbookSelection[${index}].id`),
      displayName: requiredTrimmedString(
        entry.displayName,
        `worldbookSelection[${index}].displayName`,
      ),
      normalizedSourceHash: requiredTrimmedString(
        entry.normalizedSourceHash,
        `worldbookSelection[${index}].normalizedSourceHash`,
      ),
      entryCount,
      createdAt,
      updatedAt,
    };
  });
}

function normalizeCanonicalNames(
  value: unknown,
  field: string,
): NormalizedCanonicalNames | null {
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      `Campaign source field ${field} must be an object.`,
    );
  }
  const keys = Object.keys(value);
  if (keys.some((key) => !CANONICAL_NAME_FIELDS.includes(
    key as (typeof CANONICAL_NAME_FIELDS)[number],
  ))) {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      `Campaign source field ${field} contains an unknown canonical name group.`,
    );
  }

  const locations = value.locations === undefined
    ? undefined
    : trimmedStringArray(value.locations, `${field}.locations`);
  const collectives = value.factions === undefined
    ? undefined
    : trimmedStringArray(value.factions, `${field}.collectives`);
  const characters = value.characters === undefined
    ? undefined
    : trimmedStringArray(value.characters, `${field}.characters`);
  const normalized = { locations, collectives, characters };

  return Object.values(normalized).some((entries) => entries !== undefined)
    ? normalized
    : null;
}

function parseResearchContext(value: unknown): NormalizedResearchContext | null {
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      "Campaign research context must be an object.",
    );
  }
  const allowedFields = [
    "franchise",
    "keyFacts",
    "tonalNotes",
    "canonicalNames",
    "excludedCharacters",
    "source",
    "sourceGroups",
  ];
  if (Object.keys(value).some((key) => !allowedFields.includes(key))) {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      "Campaign research context contains an unknown field.",
    );
  }
  if (value.source !== "mcp" && value.source !== "llm") {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      "Campaign research context has an invalid source type.",
    );
  }
  if (value.excludedCharacters !== undefined) {
    trimmedStringArray(value.excludedCharacters, "ipContext.excludedCharacters");
  }
  if (value.sourceGroups !== undefined && !Array.isArray(value.sourceGroups)) {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      "Campaign research source groups must be an array.",
    );
  }

  const sourceGroups = (value.sourceGroups ?? []).map((group, index) => {
    if (!isRecord(group)) {
      throw new CampaignWorldSourceError(
        "campaign_source_invalid",
        `Campaign research source group ${index + 1} must be an object.`,
      );
    }
    const allowedGroupFields = [
      "sourceName",
      "priority",
      "keyFacts",
      "canonicalNames",
    ];
    if (Object.keys(group).some((key) => !allowedGroupFields.includes(key))) {
      throw new CampaignWorldSourceError(
        "campaign_source_invalid",
        `Campaign research source group ${index + 1} contains an unknown field.`,
      );
    }
    let priority: "primary" | "supplementary";
    if (group.priority === "primary") {
      priority = "primary";
    } else if (group.priority === "supplementary") {
      priority = "supplementary";
    } else {
      throw new CampaignWorldSourceError(
        "campaign_source_invalid",
        `Campaign research source group ${index + 1} has an invalid priority.`,
      );
    }
    return {
      sourceName: requiredTrimmedString(
        group.sourceName,
        `ipContext.sourceGroups[${index}].sourceName`,
      ),
      priority,
      keyFacts: trimmedStringArray(
        group.keyFacts,
        `ipContext.sourceGroups[${index}].keyFacts`,
      ),
      canonicalNames: normalizeCanonicalNames(
        group.canonicalNames,
        `ipContext.sourceGroups[${index}].canonicalNames`,
      ),
    };
  });

  return {
    franchise: requiredTrimmedString(value.franchise, "ipContext.franchise"),
    keyFacts: trimmedStringArray(value.keyFacts, "ipContext.keyFacts"),
    tonalNotes: trimmedStringArray(value.tonalNotes, "ipContext.tonalNotes"),
    canonicalNames: normalizeCanonicalNames(
      value.canonicalNames,
      "ipContext.canonicalNames",
    ),
    source: value.source,
    sourceGroups,
  };
}

function researchSummary(
  artifact: WorldgenResearchArtifactV2 | undefined,
  context: NormalizedResearchContext | null,
): string | null {
  if (artifact) {
    return JSON.stringify({
      interpretationSummary: artifact.researchBrief.interpretationSummary,
      ambiguityNotes: artifact.researchBrief.ambiguityNotes,
      sourceUsageRules: artifact.researchBrief.sourceUsageRules,
      keyFacts: artifact.generatedContext.keyFacts,
      tonalNotes: artifact.generatedContext.tonalNotes,
      canonicalNames: normalizeCanonicalNames(
        artifact.generatedContext.canonicalNames,
        "worldgenResearchArtifact.generatedContext.canonicalNames",
      ),
    });
  }
  return context === null ? null : JSON.stringify(context);
}

function sourceReferences(
  config: CampaignConfig,
  rawConfig: Record<string, unknown>,
  worldbooks: CampaignWorldbookSelection[],
  context: NormalizedResearchContext | null,
): CampaignWorldSourceReference[] {
  const references: CampaignWorldSourceReference[] = [];
  const rawHint = rawConfig.worldgenSourceHint;
  if (rawHint !== undefined) {
    references.push({
      id: "known-ip",
      label: requiredTrimmedString(rawHint, "worldgenSourceHint"),
      sourceType: "source_hint",
    });
  }

  for (const worldbook of worldbooks) {
    references.push({
      id: `worldbook:${worldbook.id}@${worldbook.normalizedSourceHash}`,
      label: worldbook.displayName,
      sourceType: "worldbook",
    });
  }

  config.worldgenResearchArtifact?.searchResults.forEach((result, index) => {
    const identity = crypto
      .createHash("sha256")
      .update(JSON.stringify({ jobId: result.jobId, url: result.url }))
      .digest("hex");
    references.push({
      id: `research:${index + 1}@${identity}`,
      label: result.title,
      sourceType: "research_result",
    });
  });

  if (!config.worldgenResearchArtifact && context) {
    const contextSources = context.sourceGroups.length > 0
      ? context.sourceGroups.map((group) => group.sourceName)
      : [context.franchise];
    contextSources.forEach((label, index) => {
      references.push({
        id: `research-context:${index + 1}`,
        label,
        sourceType: "research_context",
      });
    });
  }

  return references.sort((left, right) =>
    `${left.sourceType}\u0000${left.id}\u0000${left.label}`.localeCompare(
      `${right.sourceType}\u0000${right.id}\u0000${right.label}`,
    ),
  );
}

export function calculateCampaignWorldSourceDigest(
  source: Omit<CampaignWorldSource, "campaignId" | "sourceDigest">,
): string {
  return crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

function loadSource(
  campaignId: string,
  dependencies: CampaignWorldSourceDependencies,
): CampaignWorldSource {
  let config: CampaignConfig;
  let rawConfig: Record<string, unknown>;
  try {
    const snapshot = dependencies.readConfigSnapshot(campaignId);
    config = snapshot.config;
    rawConfig = snapshot.raw;
  } catch (error) {
    if (error instanceof CampaignWorldSourceError) {
      throw error;
    }
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      "Campaign source config could not be loaded.",
      { cause: error },
    );
  }

  if (typeof rawConfig.premise !== "string") {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      "Campaign premise must be a string.",
    );
  }

  const premise = rawConfig.premise.trim();
  const dna = normalizedStoredDna(rawConfig, config);
  const worldbooks = parseWorldbookSelections(rawConfig.worldbookSelection);
  const hasResearchArtifact = Object.hasOwn(
    rawConfig,
    "worldgenResearchArtifact",
  );
  if (hasResearchArtifact && config.worldgenResearchArtifact === undefined) {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      "Campaign research artifact did not pass campaign normalization.",
    );
  }
  const hasResearchContext = Object.hasOwn(rawConfig, "ipContext");
  if (hasResearchContext && config.ipContext === undefined) {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      "Campaign research context did not pass campaign normalization.",
    );
  }
  const normalizedResearchContext = hasResearchContext
    ? parseResearchContext(config.ipContext)
    : null;
  const references = sourceReferences(
    config,
    rawConfig,
    worldbooks,
    normalizedResearchContext,
  );
  const normalizedResearchSummary = researchSummary(
    config.worldgenResearchArtifact,
    normalizedResearchContext,
  );

  if (premise.length === 0 && normalizedResearchSummary === null) {
    throw new CampaignWorldSourceError(
      "campaign_source_invalid",
      "Campaign source requires a premise or saved research context.",
    );
  }

  const digestInput = {
    premise,
    dna,
    researchSummary: normalizedResearchSummary,
    sourceReferences: references,
    ...(config.playerIdentity ? { playerIdentity: config.playerIdentity } : {}),
  };

  return {
    campaignId,
    ...digestInput,
    sourceDigest: calculateCampaignWorldSourceDigest(digestInput),
  };
}

export function assertCampaignWorldSourceWritable(
  status: CampaignWorldStatus,
): void {
  if (status === "building") {
    throw new CampaignWorldSourceError(
      "world_build_running",
      "Campaign DNA is locked while the world build is running.",
    );
  }
  if (status === "review" || status === "accepted") {
    throw new CampaignWorldSourceError(
      "campaign_world_exists",
      "Campaign DNA is locked after the world has been built.",
    );
  }
}

export function createCampaignWorldSourceService(
  overrides: Partial<CampaignWorldSourceDependencies> = {},
): CampaignWorldSourceService {
  const dependencies: CampaignWorldSourceDependencies = {
    readConfigSnapshot: readCampaignConfigSnapshot,
    saveSeeds: saveWorldSeeds,
    ...overrides,
  };

  return {
    load: (campaignId) => loadSource(campaignId, dependencies),
    saveDna: (request) =>
      withCampaignWorldSourceLock(request.campaignId, async () => {
        await request.assertWritable(request.campaignId);
        dependencies.saveSeeds(request.campaignId, dnaToWorldSeeds(request.dna));
        return loadSource(request.campaignId, dependencies);
      }),
  };
}

export const campaignWorldSourceService = createCampaignWorldSourceService();
