export {
  estimateTokens,
  allocateBudgets,
  truncateToFit,
  DEFAULT_BUDGETS,
} from "./token-budget.js";

export type { PromptSection } from "./token-budget.js";

export { assemblePrompt, assembleFinalNarrationPrompt } from "./prompt-assembler.js";

export type {
  AssembledPrompt,
  AssembleOptions,
  FinalNarrationPrompt,
} from "./prompt-assembler.js";

export {
  callOracle,
  rollD100,
  resolveOutcome,
  oracleOutputSchema,
} from "./oracle.js";

export type {
  OracleResult,
  OraclePayload,
  OutcomeTier,
} from "./oracle.js";

export {
  NarrationRepairExhaustedError,
  processTurn,
  processOpeningScene,
  resumePendingTurnNarration,
  detectMovement,
  sanitizeNarrative,
} from "./turn-processor.js";

export type {
  HiddenTurnSummary,
  OpeningSceneOptions,
  ResumePendingNarrationOptions,
  TurnEvent,
  TurnOptions,
  TurnSummary,
} from "./turn-processor.js";

export {
  assembleAuthoritativeScene,
  collapseRepeatedNarrationBlocks,
} from "./scene-assembly.js";

export type {
  AssembleSceneOptions,
  AuthoritativeOpeningState,
  AuthoritativeSceneContext,
  SceneAssembly,
  SceneEffect,
} from "./scene-assembly.js";

export {
  resolveScenePresence,
  resolveStoredSceneScopeId,
} from "./scene-presence.js";

export type {
  AwarenessBand,
  KnowledgeBasis,
  PresenceActorInput,
  PresenceSnapshot,
  PriorKnowledgeInput,
  ResolveScenePresenceOptions,
} from "./scene-presence.js";

export { createStorytellerTools } from "./tool-schemas.js";

export { executeToolCall } from "./tool-executor.js";

export type { ToolResult } from "./tool-result.js";

export {
  commitAuthorityTrace,
  ensureWorldClock,
  invalidateAuthorityAfterRestore,
  queueSimulationJob,
  readWorldClock,
  recordSimulationProposal,
  upsertActorProcessState,
  validateBaseWorldVersion,
} from "./living-world-authority.js";

export type {
  AuthoritySourceEntity,
  WorldClockState,
} from "./living-world-authority.js";

export {
  buildActorFrame,
  buildCommandNodeFrame,
  validateActorDecisionCitations,
  assertActorDecisionCitations,
} from "./actor-frame.js";

export type {
  ActorFactSourceRoute,
  ActorFrame,
  ActorFrameFact,
  CommandNodeFrame,
} from "./actor-frame.js";

export {
  actorDecisionPacketSchema,
  assertActorDecisionPacket,
  parseActorDecisionPacket,
  validateActorDecisionPacket,
} from "./actor-decision-packet.js";

export type {
  ActorDecisionPacket,
  ActorDecisionToolRequest,
  ActorDecisionPlanUpdate,
  ActorDecisionTrigger,
} from "./actor-decision-packet.js";

export {
  ACTOR_TURN_LEGAL_TOOLS,
  executeActorDecisionPacket,
  runRequiredActorDecisionPass,
} from "./actor-tools.js";

export type {
  ExecuteActorDecisionPacketResult,
  RunRequiredActorDecisionPassResult,
} from "./actor-tools.js";

export {
  buildPlayerFacingPacketFromNarratorPacket,
  assertPlayerFacingPacketPromptSafe,
  formatPlayerFacingPacketForPrompt,
} from "./player-facing-packet.js";

export type {
  PlayerFacingPacket,
  PlayerFacingPacketAudit,
  PlayerFacingPacketSourceRef,
} from "./player-facing-packet.js";

export {
  buildContextBudgetTrace,
  ContextBudgetViolationError,
} from "./context-budget-trace.js";

export type {
  ContextBudgetTrace,
  ContextBudgetViolation,
} from "./context-budget-trace.js";

export {
  createTurnLatencyTrace,
  recordParallelGroup,
  recordSerializedLlmGroup,
  recordTurnLatencyStage,
  finalizeTurnLatencyTrace,
} from "./turn-latency-trace.js";

export type {
  TurnLatencyTrace,
  TurnLatencyDiagnostic,
  TurnLatencyTraceStage,
  TurnLatencyCriticality,
  TurnLatencyRequiredStage,
} from "./turn-latency-trace.js";

export {
  formatParallelismWriteScopeAudit,
  planParallelSimulationGroups,
  runParallelSimulationJobs,
} from "./parallel-simulation-runner.js";

export type {
  ParallelSimulationJob,
  ParallelSimulationJobResult,
  ParallelSimulationRunResult,
} from "./parallel-simulation-runner.js";

export {
  createSimulationProposal,
  commitSimulationProposal,
  parseSimulationProposalPayload,
} from "./simulation-proposal.js";

export type {
  CommitSimulationProposalResult,
  CreatedSimulationProposal,
  SimulationProposalPayload,
  SimulationProposalWriteScope,
} from "./simulation-proposal.js";

export {
  PENDING_NARRATION_STATUSES,
  TURN_SAGA_STATUSES,
  PendingNarrationError,
  TurnSagaNotFoundError,
  TurnSagaTransitionError,
  assertNoPendingNarrationBeforeNewTurn,
  createTurnSaga,
  findPendingNarrationSaga,
  getSettledTurnPacket,
  getTurnSaga,
  findLatestSuccessfulNarratorAttempt,
  heartbeatTurnSagaWorker,
  markTurnSagaFailedStateCorruption,
  markTurnSagaFinalized,
  markTurnSagaFinalizedIfNeeded,
  mergeTurnSagaProvenance,
  persistOracleDecision,
  persistSettledTurnPacket,
  recordNarratorAttempt,
  transitionTurnSagaStatus,
  updateTurnSagaStatus,
} from "./turn-saga.js";

export type {
  CreateTurnSagaInput,
  GetSettledTurnPacketInput,
  GetTurnSagaInput,
  HeartbeatTurnSagaWorkerInput,
  MarkTurnSagaFailedStateCorruptionInput,
  MarkTurnSagaFinalizedInput,
  MergeTurnSagaProvenanceInput,
  NarratorAttemptRecord,
  NarratorAttemptStatus,
  OracleDecisionRecord,
  PersistOracleDecisionInput,
  PersistSettledTurnPacketInput,
  RecordNarratorAttemptInput,
  SettledTurnPacketRecord,
  TransitionTurnSagaStatusInput,
  TurnSagaRecord,
  TurnSagaStatus,
} from "./turn-saga.js";

export {
  buildDoneBoundaryData,
  queuePostTurnSimulationProposals,
  POST_TURN_SIMULATION_INTERVAL,
} from "./simulation-queue.js";

export type {
  PostTurnSimulationQueueInput,
  PostTurnSimulationQueueResult,
} from "./simulation-queue.js";

export {
  backfillKeyActorProcessesForCampaign,
  createInitialKeyActorProcessState,
  listDueKeyActorProcessActorIds,
  listKeyActorProcessActorIdsInScope,
  listKeyActorProcessesByActorIds,
  listKeyActorProcessesForCampaign,
  normalizeKeyActorProcessState,
  promotePersistentNpcToActorProcess,
  updateActorProcessAfterDecision,
} from "./key-actor-process.js";

export type {
  ActorProcessRoute,
  ActorProcessStatus,
  ActorProcessUpdateResult,
  BackfillKeyActorProcessesResult,
  KeyActorInboxItem,
  KeyActorInterrupt,
  KeyActorPlanStep,
  KeyActorPlanSurfacePolicy,
  KeyActorProcess,
  KeyActorProcessActor,
  KeyActorProcessState,
  KeyActorSurfaceVisibility,
} from "./key-actor-process.js";

export {
  scheduleKeyActorProcessesForTurn,
  classifyActorProcess,
} from "./actor-scheduler.js";

export type {
  ActorScheduleDecision,
  ScheduleKeyActorProcessesInput,
  ScheduleKeyActorProcessesResult,
} from "./actor-scheduler.js";

export {
  resolveActorExposureCatchup,
} from "./actor-exposure-catchup.js";

export type {
  DeferredActorExposureWork,
  ResolveActorExposureCatchupInput,
  ResolveActorExposureCatchupResult,
} from "./actor-exposure-catchup.js";

export {
  scheduleFactionCommandNodes,
} from "./faction-command-scheduler.js";

export type {
  FactionCommandDecisionCandidate,
  FactionCommandResourceSummary,
  FactionCommandRetryOperation,
  ScheduleFactionCommandNodesInput,
  ScheduleFactionCommandNodesResult,
} from "./faction-command-scheduler.js";

export {
  runCommandNodeDecisionPass,
} from "./command-node-agent.js";

export type {
  CommandNodeDecision,
  CommandNodeDecisionResult,
  DecideCommandNode,
  DecideCommandNodeInput,
  RunCommandNodeDecisionPassInput,
  RunCommandNodeDecisionPassResult,
} from "./command-node-agent.js";

export {
  actorWakeSignalToWakeSignal,
  consumeActorWakeSignals,
  enqueueActorWakeSignal,
  expireActorWakeSignals,
  listCriticalActorWakeCandidates,
  listPendingWakeSignalsForActors,
} from "./actor-wake-signals.js";

export type {
  ActorWakeSignalActorType,
  ActorWakeSignalRecord,
  ActorWakeSignalStatus,
  EnqueueActorWakeSignalInput,
} from "./actor-wake-signals.js";

export {
  collectWakeSignals,
  isActorInPlayerScene,
} from "./wake-signals.js";

export type {
  WakeSignal,
  WakeSignalInput,
  WakeSignalType,
} from "./wake-signals.js";

export {
  normalizeWriteScope,
  reserveActorWriteScopes,
  writeScopesConflict,
} from "./simulation-write-scope.js";

export type {
  ActorWriteScopeJob,
  ActorWriteScopeReservation,
  SimulationActorWriteScope,
} from "./simulation-write-scope.js";

export { captureSnapshot, restoreSnapshot } from "./state-snapshot.js";

export type { TurnSnapshot } from "./state-snapshot.js";

export { tickNpcAgent, tickPresentNpcs } from "./npc-agent.js";

export type { NpcTickResult } from "./npc-agent.js";

export { createNpcAgentTools } from "./npc-tools.js";

export { simulateOffscreenNpcs } from "./npc-offscreen.js";

export type { AppliedOffscreenUpdate } from "./npc-offscreen.js";

export { runReflection, checkAndTriggerReflections, REFLECTION_THRESHOLD } from "./reflection-agent.js";

export type { ReflectionResult } from "./reflection-agent.js";

export { createReflectionTools } from "./reflection-tools.js";

export { accumulateReflectionBudget } from "./reflection-budget.js";

export { tickFactions } from "./world-engine.js";

export type { FactionTickResult } from "./world-engine.js";

export { createFactionTools } from "./faction-tools.js";
