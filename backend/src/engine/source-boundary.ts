import type { RuntimeToolName } from "./tool-schemas.js";

const CLAIM_ECHO_PATTERN =
  /\b(?:claim(?:ed|s|ing)?|alleg(?:e|ed|es|ing)|bluff(?:ed|s|ing)?|unconfirmed|without proof|no proof|invok(?:e|ed|es|ing)|nam(?:e|ed|es|ing)|cit(?:e|ed|es|ing)|report(?:ed|s|ing)?|say|says|said|told|ask(?:ed|s|ing)?|question(?:ed|s|ing)?|repeat(?:ed|s|ing)?|quot(?:e|ed|es|ing))\b/i;

const PLAYER_CLAIM_ECHO_TOOLS = new Set<RuntimeToolName>([
  "log_event",
  "set_relationship",
]);

export interface SourceBoundaryTermInput {
  source: string;
  text: string;
  playerSourced: boolean;
  playerAction: string;
  normalizedTerm: string;
  toolName?: RuntimeToolName | null;
}

function containsNormalizedTerm(text: string, normalizedTerm: string): boolean {
  return text.toLowerCase().includes(normalizedTerm);
}

function isPlayerClaimEcho(input: SourceBoundaryTermInput): boolean {
  if (!input.toolName || !PLAYER_CLAIM_ECHO_TOOLS.has(input.toolName)) {
    return false;
  }
  if (!input.source.startsWith("perceivable_effect:")) {
    return false;
  }
  if (!containsNormalizedTerm(input.playerAction, input.normalizedTerm)) {
    return false;
  }
  return CLAIM_ECHO_PATTERN.test(input.text);
}

export function sourceBoundaryTermIsLeak(input: SourceBoundaryTermInput): boolean {
  if (!input.normalizedTerm || !containsNormalizedTerm(input.text, input.normalizedTerm)) {
    return false;
  }
  if (input.playerSourced && containsNormalizedTerm(input.playerAction, input.normalizedTerm)) {
    return false;
  }
  return !isPlayerClaimEcho(input);
}
