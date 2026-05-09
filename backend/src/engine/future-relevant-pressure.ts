const FUTURE_RELEVANT_CONCRETE_PRESSURE_PATTERNS: RegExp[] = [
  /\braised voices?\b/i,
  /\binspection dispute\b/i,
  /\b(canvas-apron|gondolier|dockworker|clipboard|sealed envelope)\b/i,
  /\b(waxed cloth|barge manifests?|manifest unsigned|crate count|dockmark)\b/i,
  /\b(obligation|test)\b/i,
  /\b(recessed|maintenance-like|narrow stair|iron-banded door|route guidance)\b/i,
  /\b(defensive posture|threat assessment|provocation target|risky move target)\b/i,
  /\b(violence happened|after violence|aftermath|more dangerous|dangerous since)\b/i,
];

export function hasFutureRelevantConcretePressure(text: string): boolean {
  const trimmed = text.trim();
  return Boolean(trimmed)
    && FUTURE_RELEVANT_CONCRETE_PRESSURE_PATTERNS.some((pattern) => pattern.test(trimmed));
}
