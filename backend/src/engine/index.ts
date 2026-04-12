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
  processTurn,
  processOpeningScene,
  detectMovement,
  sanitizeNarrative,
} from "./turn-processor.js";

export type {
  HiddenTurnSummary,
  OpeningSceneOptions,
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

export { createStorytellerTools } from "./tool-schemas.js";

export { executeToolCall } from "./tool-executor.js";

export type { ToolResult } from "./tool-executor.js";

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
