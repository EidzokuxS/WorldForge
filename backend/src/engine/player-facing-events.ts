export interface PlayerFacingQuickAction {
  label: string;
  action: string;
}

export interface PlayerFacingQuickActionsEvent {
  actions: PlayerFacingQuickAction[];
}

const MAX_QUICK_ACTIONS = 5;
const MAX_QUICK_ACTION_LABEL_LENGTH = 80;
const MAX_QUICK_ACTION_TEXT_LENGTH = 320;

const PLAYER_REF_REPLACEMENT = "[hidden]";
const PLAYER_FACING_UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;
const PLAYER_FACING_TYPED_REF_PATTERN =
  /\b(?:tool[-_]result|action|actor|campaign|candidate|edge|effect|event|fact|faction|item|knowledge|loc|location|movement|npc|player|response|route|scene|source|authority|world|forecast|tool)(?::|_)[a-z0-9][a-z0-9._:-]*\b/giu;
const PLAYER_FACING_HYPHEN_REF_PATTERN =
  /\b(?:action|actor|anchor|campaign|candidate|committed|edge|effect|event|fact|faction|forecast|item|knowledge|loc|location|movement|npc|perceivable|response|route|scene|tool|world)-[a-z0-9][a-z0-9._:-]*\b/giu;
const PLAYER_FACING_SAFE_HYPHEN_TOKENS = new Set([
  "player-facing",
  "player-supplied",
  "player-known",
  "source-boundary",
  "source-linked",
  "world-facing",
  "world-state",
  "world-states",
  "route-hazard",
  "route-hazards",
]);
const PLAYER_FACING_TOOL_NAME_PATTERN =
  /\b(?:create_minor_poi|create_scene_extra|move_actor|move_to|record_player_intent|reveal_location|spawn_npc|start_search)\b/giu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readActionArray(value: unknown): unknown[] {
  if (!isRecord(value)) return [];
  if (Array.isArray(value.actions)) return value.actions;
  if (isRecord(value.result) && Array.isArray(value.result.actions)) {
    return value.result.actions;
  }
  return [];
}

export function isSafePlayerFacingHyphenToken(token: string): boolean {
  const normalized = token.toLowerCase();
  if (PLAYER_FACING_SAFE_HYPHEN_TOKENS.has(normalized)) return true;

  if (normalized.startsWith("route-")) {
    const tail = normalized.slice("route-".length);
    return /^[a-z]+(?:-[a-z]+)*$/u.test(tail)
      && !/\b(?:backend|hidden|private|raw|secret|unknown)\b/u.test(tail);
  }

  return false;
}

function sanitizePlayerFacingBackendRefs(text: string): string {
  return text
    .replace(PLAYER_FACING_UUID_PATTERN, PLAYER_REF_REPLACEMENT)
    .replace(PLAYER_FACING_TYPED_REF_PATTERN, PLAYER_REF_REPLACEMENT)
    .replace(PLAYER_FACING_HYPHEN_REF_PATTERN, (token) =>
      isSafePlayerFacingHyphenToken(String(token))
        ? token
        : PLAYER_REF_REPLACEMENT
    );
}

export function sanitizePlayerFacingText(
  value: string,
  options: { maxChars?: number; preserveWhitespace?: boolean } = {},
): string {
  const redacted = sanitizePlayerFacingBackendRefs(value)
    .replace(PLAYER_FACING_TOOL_NAME_PATTERN, PLAYER_REF_REPLACEMENT);
  const normalized = options.preserveWhitespace
    ? redacted
    : redacted.replace(/\s+/g, " ").trim();
  if (!options.maxChars || normalized.length <= options.maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, options.maxChars - 3)).trimEnd()}...`;
}

function playerFacingText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = sanitizePlayerFacingText(value, { maxChars: maxLength });
  if (!text || text === PLAYER_REF_REPLACEMENT) return null;
  return text;
}

export function toPlayerFacingQuickActions(value: unknown): PlayerFacingQuickActionsEvent | null {
  const actions = readActionArray(value)
    .flatMap((entry): PlayerFacingQuickAction[] => {
      if (!isRecord(entry)) return [];
      const label = playerFacingText(entry.label, MAX_QUICK_ACTION_LABEL_LENGTH);
      const action = playerFacingText(entry.action, MAX_QUICK_ACTION_TEXT_LENGTH);
      return label && action ? [{ label, action }] : [];
    })
    .slice(0, MAX_QUICK_ACTIONS);

  return actions.length > 0 ? { actions } : null;
}
