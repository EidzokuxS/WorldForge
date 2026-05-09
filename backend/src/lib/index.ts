export { AppError, getErrorStatus, getErrorMessage } from "./errors.js";
export { clamp, clampTokens } from "./clamp.js";
export { createLogger } from "./logger.js";
export { isRecord } from "./type-guards.js";
export { toTitleCase, cleanTag } from "./string-utils.js";
export { withSearchMcp } from "./mcp-client.js";

// Phase 58 — observability additions (context, serializers, snapshot accessor).
// NOTE: runtime configurators and test-only helpers are deliberately NOT
// re-exported here. See logger-setup.ts and logger-test-utils.ts for the
// direct-import entry points used by the settings manager and test files.
export {
  runWithTurnContext,
  getTurnContext,
  withRole,
} from "./logger-context.js";
export type { TurnContext, TurnRole } from "./logger-context.js";
export { serializePayload, truncatedReference } from "./logger-serializers.js";
export { shouldLogRole, getObservabilityConfigSnapshot } from "./logger-setup.js";
