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

export type SearchProvider = "duckduckgo" | "zai";

export interface ResearchConfig {
  enabled: boolean;
  maxSearchSteps: number;
  searchProvider: SearchProvider;
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
