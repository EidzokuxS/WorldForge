import {
  CANONICAL_LOADOUT_RULE,
  DERIVED_RUNTIME_TAGS_RULE,
  START_CONDITIONS_CONTRACT,
} from "../character/prompt-contract.js";
import {
  buildStorytellerBaselinePreset,
  buildStorytellerGlmOverlay,
  type StorytellerSceneMode,
} from "./storyteller-presets.js";

export const STORYTELLER_WORLD_RULES = [
  "Your output must be narrative prose only.",
  "Do not echo bracketed system sections, metadata, roll numbers, or tool syntax.",
  "Narrate the provided outcome faithfully instead of inventing new mechanics.",
  "Produce exactly one continuous narration pass for the turn. Do not restart the scene or restate the same beat in alternate wording.",
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

export const HIDDEN_TOOL_DRIVING_RULES = [
  "This is the hidden tool-driving pass.",
  "Resolve actions, tool calls, and authoritative state changes before any visible narration exists.",
  "Do not optimize away causal detail for speed. Hidden resolution is quality-first.",
  "Visible narration is generated later from scene effects and player-perceivable settled state.",
].join(" ");

export const FINAL_VISIBLE_NARRATION_RULES = [
  "This is the final visible narration pass.",
  "Write one final narration from settled opening state, current scene facts, and player-perceivable scene effects.",
  "Do not invent new material events, tool calls, or off-screen knowledge that is not already present in the assembled scene effects.",
  "Treat scene effects and opening state as authoritative bounded inputs for the final narration.",
].join(" ");

export type StorytellerPass = "hidden-tool-driving" | "final-visible";

interface BuildStorytellerContractOptions {
  pass?: StorytellerPass;
  includeWorldRules?: boolean;
  includeContextRules?: boolean;
  includeToolSupportRules?: boolean;
  includeGlmOverlay?: boolean;
  sceneMode?: StorytellerSceneMode;
}

export function buildStorytellerContract(
  options: BuildStorytellerContractOptions = {},
): string {
  const pass = options.pass ?? "hidden-tool-driving";
  const passSpecificRules =
    pass === "final-visible"
      ? FINAL_VISIBLE_NARRATION_RULES
      : HIDDEN_TOOL_DRIVING_RULES;
  const presetSource = buildStorytellerBaselinePreset({
    pass,
    sceneMode: options.sceneMode,
  });
  const presetOverlay = options.includeGlmOverlay
    ? buildStorytellerGlmOverlay({
      pass,
      sceneMode: options.sceneMode,
    })
    : null;

  return [
    passSpecificRules,
    presetSource,
    options.includeGlmOverlay ? presetOverlay : null,
    options.includeWorldRules === false ? null : STORYTELLER_WORLD_RULES,
    options.includeContextRules === false ? null : STORYTELLER_CONTEXT_RULES,
    options.includeToolSupportRules === false
      ? null
      : pass === "final-visible"
        ? null
        : STORYTELLER_TOOL_SUPPORT_RULES,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}
