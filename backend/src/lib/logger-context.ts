import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Phase 58 — observability context for a single turn execution.
 *
 * `role` is a runtime pseudo-tag that narrows which LLM call is producing
 * the record. `tool` and `prompt` are internal runtime-only values used by
 * the logger infrastructure itself; they are NOT part of the user-facing
 * Settings.observability.roles surface.
 */
export type TurnRole =
  | "judge"
  | "storyteller"
  | "oracle"
  | "npcAgent"
  | "reflection"
  | "embedder"
  | "tool"
  | "prompt";

export interface TurnContext {
  turnId: string;
  campaignId: string;
  tick: number;
  role?: TurnRole;
}

const storage = new AsyncLocalStorage<TurnContext>();

export function runWithTurnContext<T>(
  context: TurnContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

export function getTurnContext(): TurnContext | undefined {
  return storage.getStore();
}

/**
 * Nest a role within the current turn context. If no turn context is active,
 * returns the callback result with no context override (role is recorded via
 * pino mixin only when turn context exists — standalone log calls outside a
 * turn run simply carry no role tag).
 */
export function withRole<T>(role: TurnRole, fn: () => T): T {
  const current = storage.getStore();
  if (!current) {
    return fn();
  }
  return storage.run({ ...current, role }, fn);
}
