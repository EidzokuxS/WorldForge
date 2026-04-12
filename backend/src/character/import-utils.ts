export type CharacterImportMode = "native" | "outsider";

const TAG_WORD_SEPARATOR = /[-_/]+/g;
const TAG_NOISE = new Set([
  "anypov",
  "female",
  "male",
  "non binary",
  "nonbinary",
  "nsfw",
  "oc",
  "original character",
  "offworld origin",
  "player",
  "pov",
  "user",
]);

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function cleanTag(raw: string): string {
  return raw
    .trim()
    .replace(/^[\[\]"'`#*]+|[\[\]"'`#*]+$/g, "")
    .replace(TAG_WORD_SEPARATOR, " ")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulTag(tag: string): boolean {
  if (!tag) return false;
  if (TAG_NOISE.has(tag.toLowerCase())) return false;

  const words = tag.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 3) return false;

  const lowered = tag.toLowerCase();
  if (lowered.includes("metadata") || lowered.includes("format")) return false;

  return true;
}

function collectFallbackTags(tags: string[], max: number, seen: Set<string>): string[] {
  const fallback: string[] = [];

  for (const raw of tags) {
    const cleaned = cleanTag(raw);
    if (!cleaned) continue;
    if (TAG_NOISE.has(cleaned.toLowerCase())) continue;

    const words = cleaned.split(" ").filter(Boolean);
    if (words.length === 0 || words.length > 4) continue;

    const titled = toTitleCase(cleaned);
    const key = titled.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    fallback.push(titled);

    if (fallback.length >= max) {
      break;
    }
  }

  return fallback;
}

export function normalizeImportedTags(
  tags: string[],
  opts?: { max?: number }
): string[] {
  const max = opts?.max ?? 8;
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of tags) {
    const cleaned = cleanTag(raw);
    if (!isUsefulTag(cleaned)) continue;

    const titled = toTitleCase(cleaned);
    const key = titled.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(titled);

    if (normalized.length >= max) {
      break;
    }
  }

  if (normalized.length === 0) {
    normalized.push(...collectFallbackTags(tags, max, seen));
  }

  return normalized;
}

export function buildImportModeGuidance(mode: CharacterImportMode): string {
  if (mode === "outsider") {
    return [
      "- IMPORT MODE: outsider.",
      "- Treat this character as someone who arrived from outside the setting with their own prior history intact.",
      "- Preserve the fact that they are not native to this world, but adapt their current role, goals, and social friction to the campaign's lore.",
      "- Their outsider status belongs in persona/backstory/goals, not as cheap metadata tags like Offworld Origin.",
    ].join("\n");
  }

  return [
    "- IMPORT MODE: native resident.",
    "- Rewrite the imported character so they feel like an organic local inhabitant of this setting.",
    "- Ground their history, worldview, and current role in the campaign's lore, factions, and locations.",
    "- Do not describe them as coming from another universe or carrying their original setting wholesale into this world.",
  ].join("\n");
}
