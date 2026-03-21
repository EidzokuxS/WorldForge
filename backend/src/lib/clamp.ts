export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampTokens(maxTokens: number): number {
  return clamp(Math.round(maxTokens), 1, 32000);
}
