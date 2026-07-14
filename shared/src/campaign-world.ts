import type { CampaignWorldDna } from "./types.js";

export type CampaignWorldStatus =
  | "unbuilt"
  | "building"
  | "review"
  | "accepted"
  | "failed";

export type WorldActorKind = "person";
export type WorldActorController = "human" | "agent";
export type GeneratedWorldActorRole = "key" | "support" | "background";
export type WorldActorRole = GeneratedWorldActorRole | "player";
export type ActorPlacementKind = "present" | "home";
export type ActorGoalHorizon = "immediate" | "ongoing";
export type GoalPriority = 1 | 2 | 3 | 4 | 5;
export type RelationIntensity = 1 | 2 | 3 | 4 | 5;
export type PressureUrgency = 1 | 2 | 3 | 4 | 5;
export type RouteCost = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type ActorRelationType =
  | "alliance"
  | "rivalry"
  | "authority"
  | "dependency"
  | "kinship"
  | "association"
  | "hostility";

export interface CampaignWorldSourceReference {
  id: string;
  label: string;
  sourceType: string;
}

export interface CampaignWorldSource {
  campaignId: string;
  premise: string;
  dna: CampaignWorldDna | null;
  researchSummary: string | null;
  sourceReferences: CampaignWorldSourceReference[];
  sourceDigest: string;
}

export interface CampaignWorldLocation {
  id: string;
  name: string;
  description: string;
  kind: "macro" | "persistent_sublocation";
  parentLocationId: string | null;
  tags: string[];
  isStarting: boolean;
}

export interface CampaignWorldRoute {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  travelCost: RouteCost;
}

export interface WorldActor {
  id: string;
  kind: WorldActorKind;
  controller: WorldActorController;
  role: WorldActorRole;
  name: string;
  summary: string;
  traits: string[];
  tags: string[];
}

export interface GeneratedWorldActor extends WorldActor {
  controller: "agent";
  role: GeneratedWorldActorRole;
}

export interface ActorGoal {
  id: string;
  actorId: string;
  objective: string;
  motivation: string;
  horizon: ActorGoalHorizon;
  priority: GoalPriority;
  status: "active";
}

export interface ActorRelation {
  id: string;
  sourceActorId: string;
  targetActorId: string;
  relationType: ActorRelationType;
  summary: string;
  intensity: RelationIntensity;
}

export interface ActorPlacement {
  id: string;
  actorId: string;
  locationId: string;
  placementKind: ActorPlacementKind;
}

export interface WorldPressure {
  id: string;
  name: string;
  description: string;
  trajectory: string;
  urgency: PressureUrgency;
  actorIds: string[];
  locationIds: string[];
}

export interface CampaignWorld {
  campaignId: string;
  status: "review" | "accepted";
  version: number;
  contentHash: string;
  sourceDigest: string;
  worldSummary: string;
  locations: CampaignWorldLocation[];
  routes: CampaignWorldRoute[];
  actors: GeneratedWorldActor[];
  goals: ActorGoal[];
  relations: ActorRelation[];
  placements: ActorPlacement[];
  pressures: WorldPressure[];
  builtAt: number;
  acceptedAt: number | null;
}

export type CampaignWorldBuildStage =
  | "world_frame"
  | "world_cast"
  | "world_connections"
  | "validation"
  | "persistence";

export interface CampaignWorldBuild {
  buildId: string;
  status: "running" | "completed" | "failed";
  stage: CampaignWorldBuildStage;
  lastEventSequence: number;
  sourceDigest: string;
  errorCode: string | null;
}

export type CampaignWorldBuildEvent =
  | {
      sequence: number;
      buildId: string;
      type: "build_started";
      createdAt: number;
    }
  | {
      sequence: number;
      buildId: string;
      type: "stage_started" | "stage_completed";
      stage: CampaignWorldBuildStage;
      createdAt: number;
    }
  | {
      sequence: number;
      buildId: string;
      type: "build_completed";
      worldVersion: number;
      contentHash: string;
      createdAt: number;
    }
  | {
      sequence: number;
      buildId: string;
      type: "build_failed";
      errorCode: string;
      message: string;
      createdAt: number;
    };

export interface CampaignWorldReview extends CampaignWorld {
  source: Pick<
    CampaignWorldSource,
    "premise" | "dna" | "researchSummary" | "sourceReferences"
  >;
}

export type CampaignWorldState =
  | { status: "unbuilt"; source: CampaignWorldSource }
  | {
      status: "building" | "failed";
      source: CampaignWorldSource;
      build: CampaignWorldBuild;
    }
  | { status: "review" | "accepted"; world: CampaignWorldReview };

export interface CampaignWorldAcceptanceReceipt {
  campaignId: string;
  worldVersion: number;
  contentHash: string;
  acceptedAt: number;
}
