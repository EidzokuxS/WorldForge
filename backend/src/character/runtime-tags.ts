import type { CharacterRecord } from "@worldforge/shared";

function pushUnique(target: string[], value: string) {
  const normalized = value.trim();
  if (!normalized) return;

  const exists = target.some(
    (current) => current.toLowerCase() === normalized.toLowerCase(),
  );
  if (!exists) {
    target.push(normalized);
  }
}

function skillToTag(skill: CharacterRecord["capabilities"]["skills"][number]) {
  return skill.tier ? `${skill.tier} ${skill.name}` : skill.name;
}

/**
 * Compact runtime tags are derived snapshots, never an authored source of truth.
 * Only canonical buckets participate here.
 */
export function deriveRuntimeCharacterTags(record: CharacterRecord): string[] {
  const tags: string[] = [];

  for (const value of record.capabilities.traits) {
    pushUnique(tags, value);
  }
  for (const value of record.capabilities.skills) {
    pushUnique(tags, skillToTag(value));
  }
  for (const value of record.capabilities.flaws) {
    pushUnique(tags, value);
  }
  if (record.capabilities.wealthTier) {
    pushUnique(tags, record.capabilities.wealthTier);
  }

  for (const value of record.state.conditions) {
    pushUnique(tags, value);
  }
  for (const value of record.state.statusFlags) {
    pushUnique(tags, value);
  }

  for (const value of record.socialContext.socialStatus) {
    pushUnique(tags, value);
  }

  for (const value of record.motivations.drives) {
    pushUnique(tags, value);
  }
  for (const value of record.motivations.frictions) {
    pushUnique(tags, value);
  }

  return tags;
}
