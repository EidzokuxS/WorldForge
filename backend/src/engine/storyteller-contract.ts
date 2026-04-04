import {
  CANONICAL_LOADOUT_RULE,
  DERIVED_RUNTIME_TAGS_RULE,
  START_CONDITIONS_CONTRACT,
} from "../character/prompt-contract.js";

export const STORYTELLER_WORLD_RULES = [
  "Your output must be narrative prose only.",
  "Do not echo bracketed system sections, metadata, roll numbers, or tool syntax.",
  "Narrate the provided outcome faithfully instead of inventing new mechanics.",
  "Never contradict established scene facts, inventory truth, or the world premise.",
].join(" ");

export const STORYTELLER_CONTEXT_RULES = [
  "Read canonical character records before any shorthand view.",
  "Use canonical character records, current scene facts, and authored world state as the source context for narration.",
  "derived runtime tags are the compatibility shorthand, not the source model.",
  DERIVED_RUNTIME_TAGS_RULE,
  START_CONDITIONS_CONTRACT,
  CANONICAL_LOADOUT_RULE,
].join(" ");

export const STORYTELLER_TOOL_SUPPORT_RULES = [
  "Use tools to keep the backend state authoritative.",
  "Movement to another location requires move_to, with reveal_location first if the place must be established.",
  "If combat or other physical harm changes HP, call set_condition. light hit = -1, solid blow = -1 or -2, devastating attack = -2 or -3.",
  "Healing also uses set_condition with a positive change.",
  "After narration, call offer_quick_actions so the turn ends with actionable follow-ups.",
].join(" ");

interface BuildStorytellerContractOptions {
  includeWorldRules?: boolean;
  includeContextRules?: boolean;
  includeToolSupportRules?: boolean;
}

export function buildStorytellerContract(
  options: BuildStorytellerContractOptions = {},
): string {
  return [
    options.includeWorldRules === false ? null : STORYTELLER_WORLD_RULES,
    options.includeContextRules === false ? null : STORYTELLER_CONTEXT_RULES,
    options.includeToolSupportRules === false ? null : STORYTELLER_TOOL_SUPPORT_RULES,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}
