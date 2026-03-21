export interface PortraitPromptOptions {
  name: string;
  race: string;
  gender: string;
  age: string;
  appearance: string;
  tags: string[];
  stylePrompt: string;
}

export interface LocationPromptOptions {
  locationName: string;
  tags: string[];
  premise: string;
  stylePrompt: string;
}

export interface ScenePromptOptions {
  eventText: string;
  locationName: string;
  premise: string;
  stylePrompt: string;
}

/** Tag prefixes that are not relevant for visual appearance */
const NON_VISUAL_PREFIXES = [
  "wealth:",
  "skill:",
  "relationship:",
  "faction:",
  "quest:",
  "goal:",
  "reputation:",
];

function isVisualTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  return !NON_VISUAL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

/**
 * Build an image prompt for a character portrait.
 */
export function buildPortraitPrompt(opts: PortraitPromptOptions): string {
  const { name, race, gender, age, appearance, tags, stylePrompt } = opts;

  const visualTags = tags.filter(isVisualTag);
  const parts: string[] = [];

  parts.push(`Portrait of ${name}, ${race} ${gender}, ${age}`);

  if (appearance) {
    parts.push(appearance);
  }

  if (visualTags.length > 0) {
    parts.push(`Tags: ${visualTags.join(", ")}`);
  }

  if (stylePrompt) {
    parts.push(stylePrompt);
  }

  return parts.join(". ") + ".";
}

/**
 * Build an image prompt for a location illustration.
 */
export function buildLocationPrompt(opts: LocationPromptOptions): string {
  const { locationName, tags, premise, stylePrompt } = opts;
  const parts: string[] = [];

  parts.push(`Fantasy landscape: ${locationName}`);

  if (tags.length > 0) {
    parts.push(tags.join(", "));
  }

  if (premise) {
    parts.push(`World: ${truncate(premise, 200)}`);
  }

  if (stylePrompt) {
    parts.push(stylePrompt);
  }

  return parts.join(". ") + ".";
}

/**
 * Build an image prompt for a scene illustration.
 */
export function buildScenePrompt(opts: ScenePromptOptions): string {
  const { eventText, locationName, premise, stylePrompt } = opts;
  const parts: string[] = [];

  parts.push(`Scene illustration: ${eventText}`);

  if (locationName) {
    parts.push(`Setting: ${locationName}`);
  }

  if (premise) {
    parts.push(`World: ${truncate(premise, 200)}`);
  }

  if (stylePrompt) {
    parts.push(stylePrompt);
  }

  return parts.join(". ") + ".";
}
