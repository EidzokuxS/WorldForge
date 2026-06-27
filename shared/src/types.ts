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

export interface UiConfig {
  showRawReasoning: boolean;
}

/**
 * Phase 58 — observability role keys. Used to toggle logging per LLM role.
 * Note: `tool` and `prompt` are runtime-only pseudo-roles used inside logger-setup;
 * the user-facing Settings surface is limited to real LLM-consuming roles.
 */
export type ObservabilityRoleKey =
  | "judge"
  | "storyteller"
  | "oracle"
  | "npcAgent"
  | "reflection"
  | "embedder";

export interface ObservabilityRoleToggles {
  judge: boolean;
  storyteller: boolean;
  oracle: boolean;
  npcAgent: boolean;
  reflection: boolean;
  embedder: boolean;
}

export interface ObservabilityConfig {
  enabled: boolean;
  dumpFullPrompts: boolean;
  roles: ObservabilityRoleToggles;
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
  images: ImageConfig;
  research: ResearchConfig;
  ui: UiConfig;
  observability: ObservabilityConfig;
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
  /** Per-source grouping with priority labels for multi-worldbook composition.
   *  When present, prompt rendering uses grouped format instead of flat keyFacts. */
  sourceGroups?: Array<{
    sourceName: string;
    priority: "primary" | "supplementary";
    keyFacts: string[];
    canonicalNames?: {
      locations?: string[];
      factions?: string[];
      characters?: string[];
    };
  }>;
}

export type WorldgenResearchUse = string;

export type WorldgenSourceRole =
  | "world_basis"
  | "mechanics_overlay"
  | "tone_overlay"
  | "reference_only"
  | "ambiguous";

export interface WorldgenResearchSourceUsageRule {
  sourceLabel: string;
  role: WorldgenSourceRole;
  useFor: WorldgenResearchUse[];
  avoidFor: WorldgenResearchUse[];
  rationale: string;
}

export interface WorldgenResearchSearchJob {
  id: string;
  sourceLabel: string;
  query: string;
  purpose: string;
  useFor: WorldgenResearchUse[];
}

export interface WorldgenResearchSearchResult {
  jobId: string;
  title: string;
  description: string;
  url: string;
}

export interface WorldgenResearchCitation {
  jobId?: string;
  url?: string;
  note: string;
}

export interface WorldgenResearchArtifactV2 {
  version: 2;
  rawPremise: string;
  rawKnownIP?: string | null;
  researchBrief: {
    interpretationSummary: string;
    ambiguityNotes: string[];
    sourceUsageRules: WorldgenResearchSourceUsageRule[];
    searchJobs: WorldgenResearchSearchJob[];
  };
  searchResults: WorldgenResearchSearchResult[];
  generatedContext: {
    keyFacts: string[];
    tonalNotes: string[];
    citations?: WorldgenResearchCitation[];
    canonicalNames?: {
      locations?: string[];
      factions?: string[];
      characters?: string[];
    };
  };
  provenance: {
    createdAt: string;
    model?: string;
    searchProvider?: string;
  };
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

export interface ChatMessageResumeNarrationMetadata {
  sagaId: string;
  narratorAttemptId: string;
}

export type ChatMessagePresentationAuthority =
  | "settled_packet_presentation"
  | "visible_prose_non_authority";

export interface ChatMessagePresentationMetadata {
  authority: ChatMessagePresentationAuthority;
  source:
    | "settled_turn_packet"
    | "opening_scene"
    | "legacy_final_narration"
    | "deterministic_noop";
  sagaId?: string;
  narratorAttemptId?: string;
}

export interface ChatMessageMetadata {
  resumeNarration?: ChatMessageResumeNarrationMetadata;
  presentation?: ChatMessagePresentationMetadata;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  metadata?: ChatMessageMetadata;
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

export type CampaignKernelPhase =
  | "draft"
  | "world_ready"
  | "cast_ready"
  | "setup_ready"
  | "active";

export interface CampaignWorldDna {
  geography: string;
  politicalStructure: string;
  centralConflict: string;
  culturalFlavor: string;
  environment: string;
  wildcard: string;
}

export type CampaignWorldNodeType =
  | "Location"
  | "SceneLocation"
  | "Character"
  | "PowerNode"
  | "Pressure"
  | "Secret"
  | "Item"
  | "Hook";

export interface CampaignWorldNode {
  id: string;
  type: CampaignWorldNodeType;
  name: string;
  data: Record<string, unknown>;
}

export type CampaignWorldEdgeType =
  | "located_at"
  | "route_to"
  | "knows"
  | "fears"
  | "owes"
  | "protects"
  | "controls"
  | "wants_from"
  | "hides"
  | "involved_in"
  | "threatens"
  | "trusts";

export interface CampaignWorldEdge {
  id: string;
  fromId: string;
  toId: string;
  type: CampaignWorldEdgeType;
  data: Record<string, unknown>;
}

export interface CampaignWorldGraph {
  nodes: CampaignWorldNode[];
  edges: CampaignWorldEdge[];
}

export type CampaignCastSource =
  | "player_created"
  | "player_imported"
  | "npc_imported"
  | "npc_generated";

export type CampaignCastRole =
  | "player"
  | "companion"
  | "major_npc"
  | "minor_npc"
  | "rival"
  | "enemy"
  | "romance"
  | "background";

export type CampaignCastImportance = "primary" | "major" | "minor" | "background";

export interface CampaignCastPlacement {
  locationId: string | null;
  sceneLocationId: string | null;
  notes: string[];
}

export interface CampaignCastMember {
  id: string;
  source: CampaignCastSource;
  characterDraft: CharacterDraft;
  campaignRole: CampaignCastRole;
  placement: CampaignCastPlacement;
  importance: CampaignCastImportance;
}

export interface CampaignCastRegistry {
  playerCharacter: CampaignCastMember | null;
  importedCast: CampaignCastMember[];
  generatedCast: CampaignCastMember[];
}

export interface CampaignStartingSetup {
  mode: "gm_invented" | "user_guided";
  anchorSceneId: string;
  playerCharacterId: string;
  presentCastIds: string[];
  nearbyCastIds: string[];
  activePressureIds: string[];
  visibleHooks: string[];
  hiddenTruthIds: string[];
  openingSituation: string;
  openingQuestion: string;
}

export interface CampaignChatTurn {
  role: ChatRole;
  content: string;
  createdAt: number;
}

export interface CampaignChatSession {
  turns: CampaignChatTurn[];
  pendingSoftStateHints: CampaignSoftStateHint[];
}

export interface CampaignRuntimeState {
  currentSceneId: string | null;
}

export interface CampaignOpeningResult {
  text: string;
  suggestedActions: string[];
}

export type CampaignSoftStateHintType =
  | "inspect_scene"
  | "address_cast"
  | "route_intent"
  | "freeform_action";

export interface CampaignSoftStateHint {
  type: CampaignSoftStateHintType;
  targetId?: string;
  summary: string;
}

export interface CampaignGmResponse {
  text: string;
  suggestedActions: string[];
  softStateHints: CampaignSoftStateHint[];
}

export interface CampaignDebugSceneSummary {
  id: string;
  name: string;
  description: string;
}

export interface CampaignDebugCastSummary {
  id: string;
  name: string;
  source: CampaignCastSource;
  campaignRole: CampaignCastRole;
  isPlayer: boolean;
}

export interface CampaignDebugRouteSummary {
  edgeId: string;
  toSceneId: string;
  name: string;
}

export interface CampaignDebugTurnSummary {
  index: number;
  role: ChatRole;
  contentPreview: string;
  createdAt: number;
}

export interface CampaignDebugSnapshot {
  campaignId: string;
  phase: CampaignKernelPhase;
  turnIndex: number;
  counts: {
    nodes: number;
    edges: number;
    castMembers: number;
    turns: number;
    pendingSoftStateHints: number;
  };
  currentScene: CampaignDebugSceneSummary | null;
  presentCast: CampaignDebugCastSummary[];
  routes: CampaignDebugRouteSummary[];
  pendingSoftStateHints: CampaignSoftStateHint[];
  recentTurns: CampaignDebugTurnSummary[];
}

export type CampaignStateWriterChangeType =
  | "MoveCharacter"
  | "RevealSecret"
  | "ChangeRelationship"
  | "AdvancePressure"
  | "AddItem"
  | "RemoveItem"
  | "CreateHook"
  | "ResolveHook";

export type CampaignStateWriterChangeStatus = "applied" | "rejected";

export interface CampaignStateWriterChange {
  type: CampaignStateWriterChangeType;
  status: CampaignStateWriterChangeStatus;
  actorId?: string;
  fromSceneId?: string;
  toSceneId?: string;
  reason: string;
}

export interface CampaignStateWriterResult {
  changes: CampaignStateWriterChange[];
  appliedCount: number;
  rejectedCount: number;
}

export interface CampaignKernel {
  campaignId: string;
  phase: CampaignKernelPhase;
  premise: string;
  worldDna: CampaignWorldDna | null;
  worldGraph: CampaignWorldGraph;
  castRegistry: CampaignCastRegistry;
  startingSetup: CampaignStartingSetup | null;
  chatSession: CampaignChatSession;
  runtimeState: CampaignRuntimeState;
  turnIndex: number;
}

export function createDraftCampaignKernel(
  campaign: Pick<CampaignMeta, "id" | "premise">,
): CampaignKernel {
  return {
    campaignId: campaign.id,
    phase: "draft",
    premise: campaign.premise,
    worldDna: null,
    worldGraph: {
      nodes: [],
      edges: [],
    },
    castRegistry: {
      playerCharacter: null,
      importedCast: [],
      generatedCast: [],
    },
    startingSetup: null,
    chatSession: {
      turns: [],
      pendingSoftStateHints: [],
    },
    runtimeState: {
      currentSceneId: null,
    },
    turnIndex: 0,
  };
}

export const LOCATION_KINDS = [
  "macro",
  "persistent_sublocation",
  "ephemeral_scene",
] as const;

export type LocationKind = (typeof LOCATION_KINDS)[number];

export const LOCATION_PERSISTENCE_MODES = [
  "persistent",
  "ephemeral",
] as const;

export type LocationPersistence = (typeof LOCATION_PERSISTENCE_MODES)[number];

export interface LocationConnectedPathSummary {
  edgeId: string;
  toLocationId: string;
  travelCost: number;
  discovered: boolean;
}

export interface LocationRecentHappeningSummary {
  id: string;
  locationId: string;
  sourceLocationId: string | null;
  anchorLocationId: string | null;
  eventType: string;
  summary: string;
  tick: number;
  importance: number;
  archivedAtTick: number | null;
  createdAt: number;
}

export interface LocationGraphNodeSummary {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  kind: LocationKind;
  parentLocationId: string | null;
  anchorLocationId: string | null;
  persistence: LocationPersistence;
  expiresAtTick: number | null;
  archivedAtTick: number | null;
  tags: string[];
  isStarting: boolean;
  connectedPaths: LocationConnectedPathSummary[];
  recentHappenings: LocationRecentHappeningSummary[];
  /** Legacy compatibility projection while Phase 43 migrates readers off raw adjacency. */
  connectedToLocationIds?: string[];
}

export const CHARACTER_WEALTH_TIERS = [
  "Destitute",
  "Poor",
  "Comfortable",
  "Wealthy",
  "Obscenely Rich",
] as const;

export const CHARACTER_SKILL_TIERS = ["Novice", "Skilled", "Master"] as const;

export type CharacterRole = "player" | "npc";

export type CharacterTier = "temporary" | "supporting" | "persistent" | "key";

export type CharacterCanonicalStatus =
  | "original"
  | "imported"
  | "known_ip_canonical"
  | "known_ip_diverged";

export type CharacterSourceKind =
  | "player-input"
  | "generator"
  | "archetype"
  | "import"
  | "worldgen"
  | "runtime"
  | "migration";

export type CharacterWealthTier = (typeof CHARACTER_WEALTH_TIERS)[number];

export type CharacterSkillTier = (typeof CHARACTER_SKILL_TIERS)[number];

/**
 * D-07/D-08: stable facts define what remains true about the character even
 * when live campaign dynamics shift.
 */
export interface CharacterIdentityBaseFacts {
  biography: string;
  socialRole: string[];
  hardConstraints: string[];
}

/**
 * D-07/D-08: the behavioral core captures durable motives and pressure logic,
 * not short-lived scene state.
 */
export interface CharacterIdentityBehavioralCore {
  motives?: string[];
  pressureResponses?: string[];
  taboos?: string[];
  attachments: string[];
  selfImage: string;
}

/**
 * D-07/D-08: live dynamics track what this campaign run has changed without
 * overwriting the deeper identity baseline.
 */
export interface CharacterIdentityLiveDynamics {
  attachments: string[];
  activeGoals: string[];
  beliefDrift: string[];
  currentStrains: string[];
  earnedChanges: string[];
}

export interface CharacterPersonality {
  summary: string;
  voice: string;
  decisionStyle: string;
  worldview: string;
  internalContradictions: string[];
  personalMythology: string;
  sampleLines: string[];
}

export type CharacterIdentitySourceKind = "canon" | "card" | "research" | "runtime";

export interface CharacterIdentitySourceCitation {
  kind: CharacterIdentitySourceKind;
  label: string;
  excerpt: string;
}


export interface CharacterIdentityDraft {
  role: CharacterRole;
  tier: CharacterTier;
  displayName: string;
  canonicalStatus: CharacterCanonicalStatus;
  baseFacts?: CharacterIdentityBaseFacts;
  behavioralCore?: CharacterIdentityBehavioralCore;
  liveDynamics?: CharacterIdentityLiveDynamics;
  personality?: CharacterPersonality;
}

export interface CharacterIdentity extends CharacterIdentityDraft {
  id: string;
  campaignId: string;
}

export interface CharacterProfile {
  species: string;
  gender: string;
  ageText: string;
  appearance: string;
  backgroundSummary: string;
  personaSummary: string;
}

export interface CharacterRelationshipRef {
  entityId: string | null;
  entityName: string;
  type: string;
  reason: string;
}

export interface CharacterSocialContext {
  factionId: string | null;
  factionName: string | null;
  homeLocationId: string | null;
  homeLocationName: string | null;
  currentLocationId: string | null;
  currentLocationName: string | null;
  relationshipRefs: CharacterRelationshipRef[];
  socialStatus: string[];
  originMode: CharacterImportMode | "resident" | "unknown" | null;
}

export interface CharacterMotivations {
  shortTermGoals: string[];
  longTermGoals: string[];
  beliefs: string[];
  drives: string[];
  frictions: string[];
}

export interface CharacterSkill {
  name: string;
  tier: CharacterSkillTier | null;
}

export interface CharacterCapabilities {
  traits?: string[];
  skills: CharacterSkill[];
  flaws?: string[];
  specialties: string[];
  wealthTier: CharacterWealthTier | null;
}

export interface CharacterState {
  hp: number;
  conditions: string[];
  statusFlags: string[];
  activityState: string;
}

export interface CharacterLoadout {
  inventorySeed: string[];
  equippedItemRefs: string[];
  currencyNotes: string;
  signatureItems: string[];
}

export interface CharacterStartConditions {
  startLocationId?: string | null;
  arrivalMode?: string | null;
  immediateSituation?: string | null;
  entryPressure?: string[];
  companions?: string[];
  startingVisibility?: string | null;
  resolvedNarrative?: string | null;
  sourcePrompt?: string | null;
}

export interface ResolvedStartConditions {
  locationId: string;
  locationName: string;
  startConditions: CharacterStartConditions;
  /** Legacy alias kept during the Phase 30 migration. */
  narrative: string | null;
}

export interface CharacterProvenance {
  sourceKind: CharacterSourceKind;
  importMode: CharacterImportMode | null;
  templateId: string | null;
  archetypePrompt: string | null;
  worldgenOrigin: string | null;
  legacyTags?: string[];
}

export interface CharacterDraft {
  identity: CharacterIdentityDraft;
  profile: CharacterProfile;
  socialContext: CharacterSocialContext;
  motivations: CharacterMotivations;
  capabilities: CharacterCapabilities;
  state: CharacterState;
  loadout: CharacterLoadout;
  startConditions: CharacterStartConditions;
  provenance: CharacterProvenance;
  powerStats?: PowerStats;
}

export interface CharacterRecord {
  identity: CharacterIdentity;
  profile: CharacterProfile;
  socialContext: CharacterSocialContext;
  motivations: CharacterMotivations;
  capabilities: CharacterCapabilities;
  state: CharacterState;
  loadout: CharacterLoadout;
  startConditions: CharacterStartConditions;
  provenance: CharacterProvenance;
  powerStats?: PowerStats;
}

export interface CharacterDraftPatch {
  identity?: Partial<
    Omit<CharacterIdentityDraft, "baseFacts" | "behavioralCore" | "liveDynamics" | "personality">
  > & {
    baseFacts?: Partial<CharacterIdentityBaseFacts>;
    behavioralCore?: Partial<CharacterIdentityBehavioralCore>;
    liveDynamics?: Partial<CharacterIdentityLiveDynamics>;
    personality?: Partial<CharacterPersonality>;
  };
  profile?: Partial<CharacterProfile>;
  socialContext?: Partial<CharacterSocialContext>;
  motivations?: Partial<CharacterMotivations>;
  capabilities?: Partial<CharacterCapabilities>;
  state?: Partial<CharacterState>;
  loadout?: Partial<CharacterLoadout>;
  startConditions?: Partial<CharacterStartConditions>;
  provenance?: Partial<
    Pick<CharacterProvenance, "templateId" | "archetypePrompt" | "worldgenOrigin">
  >;
  powerStats?: Partial<PowerStats>;
}

export type PersonaTemplateRoleScope = "player" | "npc" | "any";

export interface PersonaTemplateSummary {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  roleScope: PersonaTemplateRoleScope;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PersonaTemplate extends PersonaTemplateSummary {
  patch: CharacterDraftPatch;
}

export type CanonicalLoadoutSlot = "equipped" | "pack" | "signature";

export interface CanonicalLoadoutItemSpec {
  name: string;
  slot: CanonicalLoadoutSlot;
  tags: string[];
  quantity: number;
  reason: string;
}

export interface CanonicalLoadoutPreview {
  loadout: CharacterLoadout;
  items: CanonicalLoadoutItemSpec[];
  audit: string[];
  warnings: string[];
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

// --- VS Battles Power Scaling (Phase 57) ---

export const AP_DURABILITY_TIERS = [
  "Human", "Street", "Wall", "Building", "City Block", "Town",
  "City", "Mountain", "Island", "Country", "Continental",
  "Moon", "Planet", "Star", "Solar System", "Galaxy",
  "Universal", "Multiversal+",
] as const;
export type ApDurabilityTier = (typeof AP_DURABILITY_TIERS)[number];

export const SPEED_TIERS = [
  "Human", "Superhuman", "Subsonic", "Supersonic", "Hypersonic",
  "Massively Hypersonic", "Sub-Relativistic", "Relativistic",
  "FTL", "MFTL", "Infinite",
] as const;
export type SpeedTier = (typeof SPEED_TIERS)[number];

export const INTELLIGENCE_TIERS = [
  "Average", "Above Average", "Gifted", "Genius",
  "Extraordinary Genius", "Supergenius",
] as const;
export type IntelligenceTier = (typeof INTELLIGENCE_TIERS)[number];

export interface TierRank<T extends string = string> {
  tier: T;
  rank: number; // 1-10 within tier
}

export interface HaxAbility {
  name: string;
  type: string; // e.g. "Spatial Manipulation"
  bypassTier: ApDurabilityTier | null; // what durability this ignores
  limitations: string[];
}

export interface CharacterVulnerability {
  description: string;
  severity: "minor" | "major" | "critical";
}

export interface PowerStats {
  attackPotency: TierRank<ApDurabilityTier>;
  speed: TierRank<SpeedTier>;
  durability: TierRank<ApDurabilityTier>;
  intelligence: TierRank<IntelligenceTier>;
  hax: HaxAbility[];
  vulnerabilities: CharacterVulnerability[];
}
