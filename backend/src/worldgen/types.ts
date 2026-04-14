import type {
  CharacterDraft,
  IpResearchContext,
  PremiseDivergence,
  ResearchConfig,
} from "@worldforge/shared";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { WorldSeeds } from "./seed-roller.js";
import type { WorldgenResearchFrame } from "./research-frame.js";

export interface GenerateScaffoldRequest {
  campaignId: string;
  name: string;
  premise: string;
  seeds?: Partial<WorldSeeds>;
  role: ResolvedRole;
  /** Pre-cached IP research context from suggest-seeds phase. Loaded from config.json. */
  ipContext?: IpResearchContext | null;
  /** Structured divergence interpretation cached beside ipContext. */
  premiseDivergence?: PremiseDivergence | null;
  /** Persisted worldgen research frame used to steer task-specific follow-up research. */
  researchFrame?: WorldgenResearchFrame | null;
  /** Research config for sufficiency checks — provider + API keys. */
  research?: ResearchConfig;
  /** Optional Judge role for inter-stage validation. If not provided, validation is skipped. */
  judgeRole?: ResolvedRole;
}

export interface GenerationProgress {
  step: number;
  totalSteps: number;
  label: string;
  /** Current entity index within stage (0-based) */
  subStep?: number;
  /** Total entities in stage */
  subTotal?: number;
  /** Entity name or validation round label */
  subLabel?: string;
}

export interface ScaffoldLocation {
  name: string;
  description: string;
  tags: string[];
  isStarting: boolean;
  connectedTo: string[];
}

export interface ScaffoldFaction {
  name: string;
  tags: string[];
  goals: string[];
  assets: string[];
  territoryNames: string[];
}

export interface ScaffoldNpcGoals {
  shortTerm: string[];
  longTerm: string[];
}

export interface ScaffoldNpc {
  name: string;
  persona: string;
  tags: string[];
  goals: ScaffoldNpcGoals;
  draft?: CharacterDraft;
  locationName: string;
  factionName: string | null;
  /** NPC importance tier. "key" = canonical/plot-relevant, "supporting" = original/background.
   *  Optional until plan 24-03 rewrites the NPC generation step to always populate it. */
  tier?: "key" | "supporting";
}

export const LORE_CATEGORIES = [
  "location", "npc", "faction", "ability", "rule", "concept", "item", "event",
] as const;

export type LoreCategory = (typeof LORE_CATEGORIES)[number];

export interface ExtractedLoreCard {
  term: string;
  definition: string;
  category: LoreCategory;
}

export interface WorldScaffold {
  refinedPremise: string;
  locations: ScaffoldLocation[];
  factions: ScaffoldFaction[];
  npcs: ScaffoldNpc[];
  loreCards: ExtractedLoreCard[];
}
