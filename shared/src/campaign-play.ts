import type {
  WorldActorController,
  WorldActorKind,
  WorldActorRole,
} from "./campaign-world.js";

export const CAMPAIGN_PLAY_LIMITS = {
  id: 128,
  handle: 128,
  idempotencyKey: 128,
  name: 120,
  label: 240,
  shortText: 500,
  text: 1_200,
  playerInput: 2_000,
  narrationBeat: 1_200,
  narrationText: 6_000,
  narrationBeats: 6,
  cardBytes: 262_144,
  characterList: 20,
  researchSources: 12,
  targets: 4,
  citedFacts: 12,
  scopes: 16,
  commandsPerBatch: 16,
  eventsPerReceipt: 8,
  exposuresPerEvent: 4,
  affectedRefs: 16,
  preconditionsPerPlan: 8,
  planSteps: 8,
  availableIntents: 27,
  suggestedActions: 4,
  effects: 6,
  visibleActors: 8,
  visibleRoutes: 8,
  visiblePressures: 4,
  visiblePossessions: 32,
  visibleObligations: 32,
  possessionQuantity: 1_000_000,
  openingLocations: 12,
  openingDetails: 8,
  newObservations: 8,
  continuityEntries: 12,
  journalPage: 50,
  publicPacketBytes: 49_152,
  publicStateBytes: 65_536,
  elapsedMinutes: 10_080,
  worldTimeMinutes: 2_147_483_647,
  pressureProgress: 100,
  pressureAdvance: 25,
  agencyDebt: 100,
  actorOpportunitiesPerTurn: 3,
} as const;

export const CAMPAIGN_PLAY_DEFAULT_WAIT_MINUTES = 10;

export const CAMPAIGN_PLAY_SETUP_PHASE_VALUES = [
  "character_required",
  "opening_required",
  "ready",
] as const;

export const CAMPAIGN_PLAY_PHASE_VALUES = [
  ...CAMPAIGN_PLAY_SETUP_PHASE_VALUES,
  "opening_active",
  "turn_active",
  "narration_pending",
] as const;

export const CAMPAIGN_TURN_KIND_VALUES = ["opening", "player_action"] as const;

export const WORLD_INTENT_KIND_VALUES = [
  "observe",
  "move",
  "contact",
  "wait",
  "attempt",
] as const;

export const CAMPAIGN_PLAY_INTENT_SOURCE_VALUES = [
  "freeform",
  "suggested",
] as const;

export const CAMPAIGN_PLAY_ROUTE_STATE_VALUES = [
  "open",
  "restricted",
  "blocked",
] as const;

export const CAMPAIGN_PLAY_EFFECT_KIND_VALUES = [
  "fade",
  "flash",
  "shake",
  "danger",
  "pause",
] as const;

export const CAMPAIGN_PLAY_CONSEQUENCE_CUE_VALUES = [
  "your_action",
  "direct_perception",
  "visible_aftermath",
  "route_change",
  "witness_report",
] as const;

export const CAMPAIGN_PLAY_VISIBLE_TARGET_KIND_VALUES = [
  "actor",
  "location",
  "route",
  "pressure",
  "possession",
  "obligation",
] as const;

export const CAMPAIGN_PLAY_PUBLIC_PROGRESS_VALUES = [
  "interpreting",
  "settling",
  "world_acting",
  "revealing",
  "narrating",
] as const;

export const CAMPAIGN_PLAY_PUBLIC_TURN_STATUS_VALUES = [
  "processing",
  "interrupted",
  "completed",
  "failed",
] as const;

export const CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES = [
  "campaign_not_found",
  "world_not_accepted",
  "world_not_playable",
  "character_required",
  "character_already_exists",
  "opening_required",
  "opening_already_completed",
  "invalid_character",
  "invalid_starting_conditions",
  "invalid_intent",
  "invalid_choice",
  "invalid_event_cursor",
  "idempotency_conflict",
  "stale_world_version",
  "stale_runtime_revision",
  "turn_in_progress",
  "turn_not_found",
  "turn_not_resumable",
  "turn_interrupted",
  "turn_failed",
  "service_unavailable",
] as const;

export const CAMPAIGN_PLAY_SSE_EVENT_TYPE_VALUES = [
  "turn.accepted",
  "turn.progressed",
  "turn.interrupted",
  "turn.completed",
  "turn.failed",
] as const;

export const CAMPAIGN_PLAY_CHARACTER_SOURCE_VALUES = [
  "created",
  "generated",
  "character_card",
  "research",
] as const;

export type CampaignPlaySetupPhase =
  (typeof CAMPAIGN_PLAY_SETUP_PHASE_VALUES)[number];
export type CampaignPlayPhase = (typeof CAMPAIGN_PLAY_PHASE_VALUES)[number];
export type CampaignTurnKind = (typeof CAMPAIGN_TURN_KIND_VALUES)[number];
export type WorldIntentKind = (typeof WORLD_INTENT_KIND_VALUES)[number];
export type CampaignPlayIntentSource =
  (typeof CAMPAIGN_PLAY_INTENT_SOURCE_VALUES)[number];
export type CampaignPlayRouteState =
  (typeof CAMPAIGN_PLAY_ROUTE_STATE_VALUES)[number];
export type CampaignPlayEffectKind =
  (typeof CAMPAIGN_PLAY_EFFECT_KIND_VALUES)[number];
export type CampaignPlayConsequenceCue =
  (typeof CAMPAIGN_PLAY_CONSEQUENCE_CUE_VALUES)[number];
export type CampaignPlayVisibleTargetKind =
  (typeof CAMPAIGN_PLAY_VISIBLE_TARGET_KIND_VALUES)[number];
export type CampaignPlayPublicProgress =
  (typeof CAMPAIGN_PLAY_PUBLIC_PROGRESS_VALUES)[number];
export type CampaignPlayPublicTurnStatus =
  (typeof CAMPAIGN_PLAY_PUBLIC_TURN_STATUS_VALUES)[number];
export type CampaignPlayPublicErrorCode =
  (typeof CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES)[number];
export type CampaignPlaySseEventType =
  (typeof CAMPAIGN_PLAY_SSE_EVENT_TYPE_VALUES)[number];
export type CampaignPlayCharacterSource =
  (typeof CAMPAIGN_PLAY_CHARACTER_SOURCE_VALUES)[number];
export type CampaignPlayActorKind = WorldActorKind;
export type CampaignPlayActorController = WorldActorController;
export type CampaignPlayActorRole = WorldActorRole;

export interface CampaignPlayPublicVersions {
  acceptedWorldVersion: number;
  worldVersion: number;
  runtimeRevision: number;
}

export interface CampaignPlayVisibleTarget {
  handle: string;
  kind: CampaignPlayVisibleTargetKind;
}

export interface PlayerIntent {
  originalText: string;
  source: CampaignPlayIntentSource;
  choiceHandle: string | null;
  kind: WorldIntentKind;
  targets: CampaignPlayVisibleTarget[];
  method: string | null;
  stakes: string | null;
}

export interface CampaignPlayVisibleLocation {
  handle: string;
  name: string;
  description: string;
}

export interface CampaignPlayVisibleActor {
  handle: string;
  name: string;
  monogram: string;
  descriptor: string;
  accent: string;
}

export interface CampaignPlayVisibleRoute {
  handle: string;
  destinationHandle: string;
  destinationName: string;
  state: CampaignPlayRouteState;
  travelTimeLabel: string;
}

export interface CampaignPlayVisiblePressure {
  handle: string;
  label: string;
  summary: string;
}

export interface CampaignPlayVisiblePossession {
  handle: string;
  name: string;
  quantity: number;
}

export interface CampaignPlayVisibleObligation {
  handle: string;
  creditorHandle: string;
  creditorName: string;
  unitKey: "copper";
  outstandingAmount: number;
}

export interface CampaignPlayConsequence {
  observationHandle: string;
  performingActorHandle: string | null;
  performingActorName: string | null;
  whatChanged: string;
  whereOrRoute: string;
  worldTimeLabel: string;
  causalCue: CampaignPlayConsequenceCue;
}

export interface CampaignPlayJournalEntry {
  observationHandle: string;
  title: string;
  text: string;
  whereOrRoute: string | null;
  worldTimeLabel: string;
  consequence: CampaignPlayConsequence | null;
}

export interface CampaignPlayAvailableIntent {
  handle: string;
  label: string;
  kind: WorldIntentKind;
  targets: CampaignPlayVisibleTarget[];
}

export interface CampaignPlayOpeningContext {
  role: string;
  arrivalMode: string;
  immediateSituation: string;
}

export interface CampaignPlayActionContext {
  submittedText: string;
  intentKind: WorldIntentKind;
  disposition:
    | "deterministic"
    | "uncertain"
    | "impossible"
    | "clarification_required";
  result:
    | "no_effect"
    | "setback"
    | "limited"
    | "success"
    | "strong_success";
  clarificationQuestion: string | null;
}

export interface CampaignPlayNarratorPacket extends CampaignPlayPublicVersions {
  campaignId: string;
  turnId: string;
  turnKind: CampaignTurnKind;
  openingContext: CampaignPlayOpeningContext | null;
  actionContext: CampaignPlayActionContext | null;
  sourceMoment: string | null;
  currentLocation: CampaignPlayVisibleLocation;
  visibleActors: CampaignPlayVisibleActor[];
  visibleRoutes: CampaignPlayVisibleRoute[];
  visiblePressures: CampaignPlayVisiblePressure[];
  possessions: CampaignPlayVisiblePossession[];
  obligations: CampaignPlayVisibleObligation[];
  newObservations: CampaignPlayJournalEntry[];
  consequences: CampaignPlayConsequence[];
  continuity: CampaignPlayJournalEntry[];
  elapsedMinutes: number;
  availableIntents: CampaignPlayAvailableIntent[];
}

export interface CampaignPlayNarrationBeat {
  beatId: string;
  text: string;
}

export interface CampaignPlaySuggestedAction {
  choiceHandle: string;
  label: string;
}

export interface CampaignPlayStageEffect {
  kind: CampaignPlayEffectKind;
  beatId: string | null;
}

export interface CampaignPlayNarration {
  narrationId: string;
  turnId: string;
  beats: CampaignPlayNarrationBeat[];
  displayText: string;
  suggestedActions: CampaignPlaySuggestedAction[];
  effects: CampaignPlayStageEffect[];
  createdAt: number;
}

export interface CampaignPlayPublicCharacter {
  name: string;
  monogram: string;
  descriptor: string;
  accent: string;
}

export interface CampaignPlayOpeningDetailOption {
  handle: string;
  label: string;
}

export interface CampaignPlayOpeningLocationOption {
  locationHandle: string;
  name: string;
  description: string;
  roles: CampaignPlayOpeningDetailOption[];
  arrivalModes: CampaignPlayOpeningDetailOption[];
  immediateSituations: CampaignPlayOpeningDetailOption[];
}

export interface CampaignPlayPublicTurn {
  turnId: string;
  turnKind: CampaignTurnKind;
  status: CampaignPlayPublicTurnStatus;
  progress: CampaignPlayPublicProgress | null;
  lastEventSequence: number;
  retryEligible: boolean;
  submittedAt: number;
  completedAt: number | null;
}

export interface CampaignPlayState extends CampaignPlayPublicVersions {
  campaignId: string;
  phase: CampaignPlayPhase;
  character: CampaignPlayPublicCharacter | null;
  openingOptions: CampaignPlayOpeningLocationOption[];
  currentLocation: CampaignPlayVisibleLocation | null;
  visibleActors: CampaignPlayVisibleActor[];
  visibleRoutes: CampaignPlayVisibleRoute[];
  visiblePressures: CampaignPlayVisiblePressure[];
  possessions: CampaignPlayVisiblePossession[];
  obligations: CampaignPlayVisibleObligation[];
  narration: CampaignPlayNarration | null;
  consequences: CampaignPlayConsequence[];
  activeTurn: CampaignPlayPublicTurn | null;
  journalCursor: number;
  projectionHash: string;
}

export interface CampaignPlayJournalPage extends CampaignPlayPublicVersions {
  campaignId: string;
  entries: CampaignPlayJournalEntry[];
  nextCursor: number | null;
}

export interface CampaignPlayVersionExpectation {
  expectedWorldVersion: number;
  expectedRuntimeRevision: number;
}

export type CampaignPlayTurnAdmissionRequest =
  | CampaignPlayVersionExpectation & {
      source: "freeform";
      idempotencyKey: string;
      text: string;
    }
  | CampaignPlayVersionExpectation & {
      source: "suggested";
      idempotencyKey: string;
      choiceHandle: string;
    };

export type CampaignPlayStartingConditions =
  | { mode: "delegate" }
  | {
      mode: "chosen";
      locationHandle: string;
      roleHandle: string;
      arrivalModeHandle: string;
      immediateSituationHandle: string;
    };

export interface CampaignPlayOpeningAdmissionRequest
  extends CampaignPlayVersionExpectation {
  idempotencyKey: string;
  startingConditions: CampaignPlayStartingConditions;
}

export interface CampaignPlayResumeTurnRequest
  extends CampaignPlayVersionExpectation {
}

export interface CampaignPlayTurnAdmissionResponse {
  turnId: string;
  sequence: number;
}

export type CampaignPlayTurnPublicResult =
  | { status: "processing" }
  | {
      status: "interrupted";
      errorCode: CampaignPlayPublicErrorCode;
    }
  | {
      status: "completed";
      narration: CampaignPlayNarration;
      consequences: CampaignPlayConsequence[];
      journalCursor: number;
    }
  | {
      status: "failed";
      errorCode: CampaignPlayPublicErrorCode;
    };

export interface CampaignPlayTurnReadResponse extends CampaignPlayPublicVersions {
  campaignId: string;
  turn: CampaignPlayPublicTurn;
  result: CampaignPlayTurnPublicResult;
}

export interface CampaignPlayJournalRequest {
  cursor: number;
  limit: number;
}

export interface CampaignPlayCharacterPersonality {
  summary: string;
  voice: string;
  decisionStyle: string;
  worldview: string;
  contradictions: string[];
  mythology: string;
  sampleLines: string[];
}

export interface CampaignPlayCharacterSkill {
  name: string;
  tier: "Novice" | "Skilled" | "Master" | null;
}

export interface CampaignPlayCharacterDraft {
  name: string;
  summary: string;
  species: string;
  gender: string;
  ageText: string;
  appearance: string;
  biography: string;
  personality: CampaignPlayCharacterPersonality;
  motives: string[];
  beliefs: string[];
  drives: string[];
  traits: string[];
  skills: CampaignPlayCharacterSkill[];
  flaws: string[];
  specialties: string[];
  inventory: string[];
  signatureItems: string[];
  source: {
    kind: CampaignPlayCharacterSource;
    importMode: "native" | "outsider" | null;
    label: string;
  };
}

export interface CampaignPlayCharacterResearchSource {
  label: string;
  excerpt: string;
}

export interface CampaignPlayCharacterResearch {
  summary: string;
  sources: CampaignPlayCharacterResearchSource[];
}

export interface CampaignPlayParsePlayerCardRequest {
  cardJson: string;
  importMode: "native" | "outsider";
}

export interface CampaignPlayGeneratePlayerDraftRequest {
  prompt: string;
  research: CampaignPlayCharacterResearch | null;
}

export interface CampaignPlayResearchPlayerRequest {
  query: string;
}

export interface CampaignPlayCharacterDraftResponse {
  draft: CampaignPlayCharacterDraft;
}

export interface CampaignPlayCharacterResearchResponse {
  research: CampaignPlayCharacterResearch;
}

export interface CampaignPlayPutPlayerRequest
  extends CampaignPlayVersionExpectation {
  acceptedWorldVersion: number;
  source: CampaignPlayCharacterSource;
  character: CampaignPlayCharacterDraft;
}

export interface CampaignPlayPutPlayerResponse extends CampaignPlayPublicVersions {
  actorHandle: string;
}

export interface CampaignPlayErrorResponse {
  code: CampaignPlayPublicErrorCode;
  status: 404 | 409 | 422 | 503;
  campaignPhase: CampaignPlayPhase | null;
  acceptedWorldVersion: number | null;
  expectedWorldVersion: number | null;
  currentWorldVersion: number | null;
  expectedRuntimeRevision: number | null;
  currentRuntimeRevision: number | null;
  turnId: string | null;
  retryEligible: boolean;
  unmetRequirements: string[];
}

interface CampaignPlaySseEventBase extends CampaignPlayPublicVersions {
  sequence: number;
  turnId: string;
  createdAt: number;
}

export type CampaignPlaySseEvent =
  | CampaignPlaySseEventBase & {
      type: "turn.accepted";
      status: "processing";
    }
  | CampaignPlaySseEventBase & {
      type: "turn.progressed";
      progress: CampaignPlayPublicProgress;
    }
  | CampaignPlaySseEventBase & {
      type: "turn.interrupted";
      retryEligible: true;
    }
  | CampaignPlaySseEventBase & {
      type: "turn.completed";
      retryEligible: false;
    }
  | CampaignPlaySseEventBase & {
      type: "turn.failed";
      retryEligible: false;
      errorCode: CampaignPlayPublicErrorCode;
    };
