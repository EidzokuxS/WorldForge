export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  isBuiltin?: boolean;
}

export interface RoleConfig {
  providerId: string;
  model?: string;
  temperature: number;
  maxTokens: number;
}

export interface FallbackConfig {
  providerId: string;
  model: string;
  timeoutMs: number;
  retryCount: number;
}

export interface ImageConfig {
  providerId: string;
  model: string;
  stylePrompt: string;
  enabled: boolean;
}

export type SearchProvider = "brave" | "duckduckgo" | "zai";

export interface ResearchConfig {
  enabled: boolean;
  maxSearchSteps: number;
  searchProvider: SearchProvider;
  /** Brave Search API key — required when searchProvider is "brave" */
  braveApiKey?: string;
  /** Z.AI API key — required when searchProvider is "zai" */
  zaiApiKey?: string;
}

export type PremiseDivergenceMode = "canonical" | "coexisting" | "diverged";

export type PremiseDivergenceProtagonistKind = "canonical" | "custom";

export type PremiseDivergenceInterpretation =
  | "canonical"
  | "replacement"
  | "coexisting"
  | "outsider"
  | "unknown";

export interface PremiseDivergenceProtagonistRole {
  kind: PremiseDivergenceProtagonistKind;
  interpretation: PremiseDivergenceInterpretation;
  canonicalCharacterName?: string | null;
  roleSummary: string;
}

/**
 * Structured interpretation of how a user's premise diverges from known canon.
 * Kept beside IpResearchContext so canonical research data stays immutable.
 */
export interface PremiseDivergence {
  mode: PremiseDivergenceMode;
  protagonistRole: PremiseDivergenceProtagonistRole;
  preservedCanonFacts: string[];
  changedCanonFacts: string[];
  currentStateDirectives: string[];
  ambiguityNotes: string[];
}

export interface Settings {
  providers: Provider[];
  judge: RoleConfig;
  storyteller: RoleConfig;
  generator: RoleConfig;
  embedder: RoleConfig;
  fallback: FallbackConfig;
  images: ImageConfig;
  research: ResearchConfig;
}

/** Cached IP research context — persisted in campaign config.json */
export interface IpResearchContext {
  /** Canonical franchise name, e.g. "Warhammer 40,000" */
  franchise: string;
  /** Key lore facts: geography, races, factions, powers, characters, history, creatures */
  keyFacts: string[];
  /** Tonal / atmosphere notes for prompting */
  tonalNotes: string[];
  /** Canonical entity names extracted by LLM during research compilation.
   *  Locations, factions, characters — exact names from the source material. */
  canonicalNames?: {
    locations?: string[];
    factions?: string[];
    characters?: string[];
  };
  /** Legacy Phase 24 override cache. Kept for backward compatibility only. */
  /** Canonical characters intentionally replaced or excluded by the premise. */
  excludedCharacters?: string[];
  /** Whether context came from live web search or LLM internal knowledge */
  source: "mcp" | "llm";
}

/**
 * Reusable processed worldbook metadata exposed to selection flows.
 * The backing record stays outside campaigns; campaigns only store a snapshot.
 */
export interface WorldbookLibraryItemSummary {
  id: string;
  displayName: string;
  normalizedSourceHash: string;
  entryCount: number;
  createdAt: number;
  updatedAt: number;
}

/** Snapshot of the reusable worldbook sources selected for a campaign. */
export interface CampaignWorldbookSelection extends WorldbookLibraryItemSummary {}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface WorldSeeds {
  geography?: string;
  politicalStructure?: string;
  centralConflict?: string;
  culturalFlavor?: string[];
  environment?: string;
  wildcard?: string;
}

export type SeedCategory = keyof WorldSeeds;

export interface CampaignMeta {
  id: string;
  name: string;
  premise: string;
  createdAt: number;
  updatedAt: number;
  seeds?: WorldSeeds;
  generationComplete?: boolean;
}

export interface PlayerCharacter {
  name: string;
  race: string;
  gender: string;
  age: string;
  appearance: string;
  tags: string[];
  hp: number;
  equippedItems: string[];
  locationName: string;
}

export type CharacterImportMode = "native" | "outsider";
