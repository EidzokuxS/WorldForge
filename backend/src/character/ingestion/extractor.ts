import type { IngestionInput, IngestionSources } from "./types.js";

function nullIfBlank(value: string | undefined | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function extractIngestionSources(input: IngestionInput): IngestionSources {
  const overrideText = nullIfBlank(input.overrideText);
  const base = { mode: input.mode, role: input.role, overrideText } as const;

  switch (input.mode) {
    case "import":
      return {
        ...base,
        freeText: null,
        archetype: null,
        card: input.v2Card,
        displayName: nullIfBlank(input.v2Card.name),
      };
    case "parse":
      return {
        ...base,
        freeText: nullIfBlank(input.freeText),
        archetype: null,
        card: null,
        displayName: null,
      };
    case "research":
      return {
        ...base,
        freeText: null,
        archetype: nullIfBlank(input.archetype),
        card: null,
        displayName: null,
      };
    case "generate":
      return {
        ...base,
        freeText: null,
        archetype: null,
        card: null,
        displayName: null,
      };
  }
}
