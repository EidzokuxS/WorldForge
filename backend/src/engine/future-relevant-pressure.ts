const FUTURE_RELEVANT_CONCRETE_PRESSURE_PATTERNS: RegExp[] = [
  /\braised voices?\b/i,
  /\binspection dispute\b/i,
  /\b(canvas-apron|gondolier|dockworker|clipboard|sealed envelope)\b/i,
  /\b(waxed cloth|barge manifests?|manifest unsigned|crate count|dockmark)\b/i,
  /\b(obligation|test)\b/i,
  /\b(recessed|maintenance-like|narrow stair|iron-banded door|route guidance)\b/i,
  /\b(station security|security desk|security office|lost and found|police report|file a report|take a report)\b/i,
  /\b(report (?:it|this|the object|the anomaly)|where (?:to|should) take|who (?:to|should) take)\b/i,
  /\b(proof|credentials?|permits?|waiver|chit|authori[sz]ation|dispatch|seal[- ]?verified|stamped|permission boundary|access condition)\b/i,
  /\b(defensive posture|threat assessment|provocation target|risky move target)\b/i,
  /\b(violence happened|after violence|aftermath|more dangerous|dangerous since)\b/i,
  /\b(public|legal|indicated|visible|previously listed|confirmed)\s+routes?\b/i,
  /\b(named office|holding point|lawful destination|dispatch point)\b/i,
];

export function hasFutureRelevantConcretePressure(text: string): boolean {
  const trimmed = text.trim();
  return Boolean(trimmed)
    && FUTURE_RELEVANT_CONCRETE_PRESSURE_PATTERNS.some((pattern) => pattern.test(trimmed));
}
