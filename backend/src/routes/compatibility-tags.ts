import type { CharacterRecord } from "@worldforge/shared";
import { toTitleCase, cleanTag } from "../lib/string-utils.js";

const META_PATTERNS = [
  /\bnsfw\b/i,
  /\bsfw\b/i,
  /\banypov\b/i,
  /\bpov\b/i,
  /\broleplay\b/i,
  /\bromance\b/i,
  /\bsmut\b/i,
  /\bfemdom\b/i,
  /\bmalepov\b/i,
  /\bfemalepov\b/i,
  /\bmetadata\b/i,
  /\bformat\b/i,
  /\boriginal character\b/i,
  /\boc\b/i,
];


function isCompatibilityTag(tag: string): boolean {
  if (!tag) return false;
  if (META_PATTERNS.some((pattern) => pattern.test(tag))) return false;

  const words = tag.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  if (tag.length > 40) return false;

  return true;
}

function skillToTag(skill: CharacterRecord["capabilities"]["skills"][number]) {
  return skill.tier ? `${skill.tier} ${skill.name}` : skill.name;
}

export function buildCompatibilityTags(
  record: CharacterRecord,
  opts?: { max?: number },
): string[] {
  const max = opts?.max ?? 10;
  const tags: string[] = [];
  const seen = new Set<string>();

  const candidates = [
    ...(record.capabilities.traits ?? []),
    ...record.capabilities.skills.map(skillToTag),
    ...(record.capabilities.flaws ?? []),
    ...(record.capabilities.specialties ?? []),
    ...(record.state.conditions ?? []),
    ...(record.state.statusFlags ?? []),
    ...(record.provenance.legacyTags ?? []),
    ...(record.capabilities.wealthTier ? [record.capabilities.wealthTier] : []),
  ];

  for (const raw of candidates) {
    const normalized = cleanTag(raw);
    if (!isCompatibilityTag(normalized)) continue;

    const titled = toTitleCase(normalized);
    const key = titled.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    tags.push(titled);
    if (tags.length >= max) break;
  }

  return tags;
}
