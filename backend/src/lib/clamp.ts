import { MODEL_OUTPUT_TOKEN_MINIMUM } from "@worldforge/shared";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampTokens(maxTokens: number): number {
  return Math.max(MODEL_OUTPUT_TOKEN_MINIMUM, Math.round(maxTokens));
}
