import {
  CANONICAL_LOADOUT_RULE,
  DERIVED_RUNTIME_TAGS_RULE,
  START_CONDITIONS_CONTRACT,
} from "../character/prompt-contract.js";
import {
  buildStorytellerBaselinePreset,
  buildStorytellerGlmOverlay,
  type StorytellerPass,
  type StorytellerSceneMode,
} from "./storyteller-presets.js";
import {
  formatSessionLanguageContract,
  type SessionResponseLanguage,
} from "./session-language.js";

export const STORYTELLER_WORLD_RULES = [
  "Your output must be narrative prose only.",
  "Do not echo bracketed system sections, metadata, roll numbers, or tool syntax.",
  "Narrate the provided outcome faithfully instead of inventing new mechanics.",
  "Produce exactly one continuous narration pass for the turn. Do not restart the scene or restate the same beat in alternate wording.",
  "Never contradict established scene facts, inventory truth, or the world premise.",
].join(" ");

const STORYTELLER_DRAFT_JSON_WORLD_RULES = [
  "Return exactly one JSON object; the prose field must contain narrative prose only.",
  "Do not echo bracketed system sections, metadata, roll numbers, or tool syntax.",
  "Narrate the provided outcome faithfully instead of inventing new mechanics.",
  "Produce exactly one continuous narration pass for the turn. Do not restart the scene or restate the same beat in alternate wording.",
  "Never contradict established scene facts, inventory truth, or the world premise.",
].join(" ");

export const STORYTELLER_RP_PLAY_RULES = [
  "Write one playable RPG/VN beat, not a recap, report, or backend explanation.",
  "Player agency is locked: never write the player's deliberate words, feelings, choices, consent, or completed success unless settled inputs confirm them.",
  "NPCs are autonomous actors, not quest terminals; let them react from motives, pressure, relationships, limits, and incomplete knowledge.",
  "Dialogue should feel spoken: distinct voices, subtext, interruptions, omissions, and short replies before monologues.",
  "Do not open by echoing or paraphrasing the latest player action; continue from it with what visibly changes now.",
  "The first sentence must add new pressure, a visible reaction, or a fresh scene fact already supported by authoritative inputs; a brief connective phrase is allowed, a recap is not.",
  "When a present NPC matters to the beat, give at least one concrete line, gesture, decision, or refusal grounded in what they can perceive.",
  "Show concrete observable evidence before abstract mood: posture, distance, objects, expressions, light, sound, movement, or silence.",
  "Do not railroad future choices. End with a live situation, pressure, invitation, question, or fork that returns control to the player.",
].join(" ");

export const STORYTELLER_PROSE_TECHNIQUE_RULES = [
  "Prose target: plain scene truth first; restrained style is better than decorative intensity, and beauty must be earned by exact local detail.",
  "Write what an actor could perform or a camera could catch: object, gesture, sound, distance, changed task, interrupted line, or visible consequence.",
  "Action before interpretation: show the evidence first, then leave emotion partly inferred unless settled dialogue or visible behavior confirms it.",
  "Use background detail only when it changes the scene: a queue moves, a kettle clicks off, a siren starts, rain empties the square, a clerk stops counting.",
  "Teach pressure through replacement, not synonyms: replace 'the air was thick with tension' with one local behavior or object that changed because of tension.",
  "For mundane or tourist turns, keep the beat mundane but specific: prices, closing hours, weather, routine NPCs, overheard lines, small costs, and optional hooks.",
  "Rhythm stays readable: nouns and verbs first, few adjectives, no ornamental adverbs; after a long sentence, shorten the next.",
  "Dialogue carries pressure through voice, omission, interruption, and motive; avoid exposition kiosks and labels that explain how a line should feel.",
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
  "When a [WORLD-BRAIN DIRECTION] block is present, treat it as authoritative scene-causality input for focal actors, co-presence, and active tension. Do not invent a competing cause chain.",
  "Visible narration is generated later from scene effects and player-perceivable settled state.",
].join(" ");

export const FINAL_VISIBLE_NARRATION_RULES = [
  "This is the final visible narration pass.",
  "Write one final narration from settled opening state, current scene facts, and player-perceivable scene effects.",
  "When [SCENE DIRECTION] and [NARRATION GUARDRAILS] are present, they are authoritative player-perceivable scene framing from the backend.",
  "Do not invent new material events, tool calls, or off-screen knowledge that is not already present in the assembled scene effects.",
  "Treat scene effects and opening state as authoritative bounded inputs for the final narration.",
  "If no authoritative effect is present, keep the beat alive through existing actors, dialogue, refusal, posture, distance, attention, silence, or local sensory color already implied by the scene; do not add reusable props, routes, hazards, documents, authorities, promises, injuries, movement, changed positions, or new named facts.",
].join(" ");

export type { StorytellerPass };

interface BuildStorytellerContractOptions {
  pass?: StorytellerPass;
  outputMode?: "prose" | "narration-draft-json";
  includeWorldRules?: boolean;
  includeContextRules?: boolean;
  includeToolSupportRules?: boolean;
  includeGlmOverlay?: boolean;
  sceneMode?: StorytellerSceneMode;
  responseLanguage?: SessionResponseLanguage;
}

export function buildStorytellerContract(
  options: BuildStorytellerContractOptions = {},
): string {
  const pass = options.pass ?? "hidden-tool-driving";
  const outputMode = options.outputMode ?? "prose";
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
    options.responseLanguage
      ? formatSessionLanguageContract(options.responseLanguage)
      : null,
    presetSource,
    options.includeGlmOverlay ? presetOverlay : null,
    options.includeWorldRules === false
      ? null
      : outputMode === "narration-draft-json"
        ? STORYTELLER_DRAFT_JSON_WORLD_RULES
        : STORYTELLER_WORLD_RULES,
    STORYTELLER_RP_PLAY_RULES,
    pass === "final-visible" ? STORYTELLER_PROSE_TECHNIQUE_RULES : null,
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
