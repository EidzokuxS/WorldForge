import type { StorytellerPass } from "./storyteller-contract.js";

export type StorytellerSceneMode = "default" | "combat" | "dialogue" | "horror" | "quiet";

export interface StorytellerPresetOptions {
  pass: StorytellerPass;
  sceneMode?: StorytellerSceneMode;
}

interface StorytellerGlmPresetOptions {
  pass: StorytellerPass;
  sceneMode?: StorytellerSceneMode;
}

const PASS_MOTIFS: Record<StorytellerPass, string[]> = {
  "hidden-tool-driving": [
    "simulate scene-state consequences before narration.",
    "Do not speak or decide for the player.",
    "The narrator is a scene simulator, not a reflective narrator.",
    "Prioritize concrete nouns and actions over abstraction.",
    "do not claim knowledge beyond player perception.",
    "avoid repeating the same emotional beat in alternate wording.",
    "Keep output bounded and paced: 1-3 compact paragraphs unless the scene demands more.",
  ],
  "final-visible": [
    "Use the settled visible scene as the only basis for narration.",
    "simulate scene-state consequences before visible narration.",
    "Do not invent facts that are not in the assembled scene input.",
    "keep output bounded for one narration beat and avoid hidden systems language.",
    "Concrete nouns and actions are mandatory over vague adjectives.",
    "do not claim knowledge beyond what the player can perceive.",
    "avoid repeating conclusions once they have resolved.",
  ],
};

const SCENE_MOTIFS: Record<StorytellerSceneMode, string[]> = {
  default: [
    "Scene rhythm: show what changes and what is currently at stake.",
    "Keep calm or mundane moments specific and observable.",
  ],
  combat: [
    "Combat mode: impactful action beats, direct causality, physical clarity.",
    "Track tactical outcomes and reactions without melodramatic inflation.",
    "Keep combat consequences grounded and bounded.",
  ],
  dialogue: [
    "Dialogue mode: speak in active conversation beats.",
    "Let exchanges drive the moment; keep reactions concrete.",
    "Avoid decorative exposition overlays during dialogue.",
  ],
  horror: [
    "Horror mode: increase pressure through concrete sensory beats.",
    "Build dread with pressure and silence, not inflated purple prose.",
    "Avoid overexplaining the threat; keep tension scene-bound.",
  ],
  quiet: [
    "quiet scene: keep scene texture, small gestures, and observed detail first.",
    "Quiet pacing should move with small, meaningful actions.",
  ],
};

const BASELINE_SHARED_MOTIFS = [
  "Keep anti-repetition and anti-echo control active.",
  "Concrete nouns and actions are mandatory.",
  "Narration length is bounded.",
];

const BASELINE_FINAL_SHARED_MOTIFS = [
  "No tool-syntax, no hidden metadata, no bracketed command text.",
  "Do not reveal simulation internals while describing the scene.",
];

function sanitizePresetLines(lines: string[]): string {
  return lines
    .filter((line): line is string => line.trim().length > 0)
    .map((line) => line.trim())
    .join("\n");
}

export function buildStorytellerBaselinePreset(
  options: Partial<StorytellerPresetOptions> = {},
): string {
  const pass: StorytellerPass = options.pass ?? "hidden-tool-driving";
  const sceneMode: StorytellerSceneMode = options.sceneMode ?? "default";

  const lines = [
    ...BASELINE_SHARED_MOTIFS,
    ...(pass === "final-visible" ? BASELINE_FINAL_SHARED_MOTIFS : []),
    ...PASS_MOTIFS[pass],
    ...SCENE_MOTIFS[sceneMode],
  ];

  return sanitizePresetLines(lines);
}

const GLM_OVERLAY_MOTIFS: Record<StorytellerPass, string[]> = {
  "hidden-tool-driving": [
    "GLM overlay: short, concrete turns are required.",
    "cut repetitive loops and trim overthinking patterns.",
    "Use concise reaction cadence over layered self-commentary.",
    "preserve sampler behavior while keeping instruction pressure high.",
  ],
  "final-visible": [
    "GLM visible pass overlay: stay tightly bounded and concrete.",
    "No tool-calling language in the final pass.",
    "Reduce fluff so the scene stays readable and grounded.",
    "visible pass sampler behavior should remain intact and bounded.",
  ],
};

const GLM_SCENE_OVERLAY: Record<StorytellerSceneMode, string[]> = {
  default: ["GLM: prefer one-pass closure over looped elaboration."],
  combat: ["GLM combat overlay: prioritize concrete action over repetition."],
  dialogue: ["GLM dialogue overlay: keep spoken turns crisp."],
  horror: ["GLM horror overlay: keep dread tight and concise."],
  quiet: ["GLM quiet overlay: avoid turning quiet beats into ornate description."],
};

export function buildStorytellerGlmOverlay(
  options: Partial<StorytellerGlmPresetOptions> = {},
): string {
  const pass: StorytellerPass = options.pass ?? "hidden-tool-driving";
  const sceneMode: StorytellerSceneMode = options.sceneMode ?? "default";

  const lines = [
    ...GLM_OVERLAY_MOTIFS[pass],
    ...GLM_SCENE_OVERLAY[sceneMode],
    "anti-echo controls are strongest with bounded turns.",
  ];

  return sanitizePresetLines(lines);
}

export function buildStorytellerContractPreset(
  options: Partial<StorytellerPresetOptions> = {},
): string {
  return [
    buildStorytellerBaselinePreset({
      pass: options.pass ?? "hidden-tool-driving",
      sceneMode: options.sceneMode,
    }),
    buildStorytellerGlmOverlay({
      pass: options.pass ?? "hidden-tool-driving",
      sceneMode: options.sceneMode,
    }),
  ]
    .filter((block) => block.length > 0)
    .join("\n\n");
}
