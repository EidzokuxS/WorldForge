import { parseLookupLogEntry, type ChatRole } from "@worldforge/shared";

export type GameMessageKind =
  | "narration"
  | "player"
  | "system"
  | "lookup"
  | "compare"
  | "mechanical"
  | "progress";

const PROGRESS_PATTERNS = [
  /^the storyteller is weaving the scene/i,
  /^the opening scene is taking shape/i,
  /^the scene is still settling into place/i,
  /^the world is still resolving/i,
];

const MECHANICAL_PATTERNS = [
  /^mechanical resolution:/i,
  /^oracle(?:\s+result)?:/i,
  /^roll(?:\s+result)?:/i,
  /^check(?:\s+result)?:/i,
];

export function deriveGameMessageKind(
  role: ChatRole,
  content: string
): GameMessageKind {
  if (role === "user") {
    return "player";
  }

  if (role === "system") {
    return "system";
  }

  const trimmed = content.trim();
  const lookupEntry = parseLookupLogEntry(trimmed);

  if (lookupEntry) {
    const lookupKind = lookupEntry.lookupKind.trim().toLowerCase();
    return lookupKind === "power_profile" || lookupKind === "compare"
      ? "compare"
      : "lookup";
  }

  if (PROGRESS_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "progress";
  }

  if (MECHANICAL_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "mechanical";
  }

  return "narration";
}

export function stripLookupPrefix(content: string): string {
  return parseLookupLogEntry(content)?.answer.trimStart() ?? content;
}

export function splitGameplayParagraphs(content: string): string[] {
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

export function isDialogueParagraph(paragraph: string): boolean {
  const trimmed = paragraph.trim();
  return (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("“") && trimmed.endsWith("”")))
  );
}

export function preserveSoftBreaks(content: string): string {
  return content.replace(/(?<!\n)\n(?!\n)/g, "  \n");
}
