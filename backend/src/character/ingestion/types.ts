import type {
  CharacterDraft,
  CharacterCanonicalStatus,
  IpResearchContext,
  PremiseDivergence,
  CharacterImportMode,
  Settings,
} from "@worldforge/shared";
import type { ResolvedRole } from "../../ai/resolve-role-model.js";

export type IngestionRole = "player" | "key";

export type V2CardPayload = {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  tags: string[];
  mesExample: string;
  importMode: CharacterImportMode;
};

export type IngestionInput =
  | {
      mode: "parse";
      campaignId: string;
      role: IngestionRole;
      freeText: string;
      overrideText?: string;
      locationNames?: string[];
      factionNames?: string[];
    }
  | {
      mode: "generate";
      campaignId: string;
      role: IngestionRole;
      overrideText?: string;
      locationNames?: string[];
      factionNames?: string[];
    }
  | {
      mode: "research";
      campaignId: string;
      role: IngestionRole;
      archetype: string;
      overrideText?: string;
      locationNames?: string[];
      factionNames?: string[];
    }
  | {
      mode: "import";
      campaignId: string;
      role: IngestionRole;
      v2Card: V2CardPayload;
      overrideText?: string;
      locationNames?: string[];
      factionNames?: string[];
    };

export type IngestionSources = {
  mode: IngestionInput["mode"];
  role: IngestionRole;
  freeText: string | null;
  archetype: string | null;
  card: V2CardPayload | null;
  overrideText: string | null;
  displayName: string | null;
};

export type IngestionClassification = {
  canonicalStatus: CharacterCanonicalStatus;
  franchise: string | null;
  ipContext: IpResearchContext | null;
  premiseDivergence: PremiseDivergence | null;
};

export type IngestionContext = {
  gen: ResolvedRole;
  campaign: {
    premise: string;
    ipContext: IpResearchContext | null;
    premiseDivergence: PremiseDivergence | null;
  };
  settings: Settings;
  locationNames: string[];
  factionNames: string[];
};

export type IngestionStage =
  | "extract"
  | "classify"
  | "research"
  | "synthesize"
  | "power_assess"
  | "backfill";

export type { CharacterDraft };
