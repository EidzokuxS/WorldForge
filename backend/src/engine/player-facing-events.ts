export interface PlayerFacingQuickAction {
  label: string;
  action: string;
  handle: string;
}

export interface PlayerFacingQuickActionsEvent {
  actions: PlayerFacingQuickAction[];
}

const MAX_QUICK_ACTIONS = 5;
const MAX_QUICK_ACTION_LABEL_LENGTH = 80;
const MAX_QUICK_ACTION_TEXT_LENGTH = 320;
const PLAYER_FACING_QUICK_ACTION_HANDLE_PATTERN = /^qac_[a-f0-9]{32}$/u;

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
const PLAYER_FACING_TOOL_NAMES = [
  "add_chronicle_entry",
  "add_tag",
  "advance_time",
  "check_route",
  "create_minor_poi",
  "create_scene_extra",
  "find_actor_candidates",
  "find_location_candidates",
  "find_object_candidates",
  "find_poi_candidates",
  "inspect_known_fact",
  "list_navigation_options",
  "list_visible_affordances",
  "log_event",
  "move_actor",
  "move_to",
  "offer_quick_actions",
  "promote_npc",
  "record_dialogue_outcome",
  "record_player_intent",
  "record_world_fact",
  "remove_tag",
  "request_contested_outcome",
  "reveal_location",
  "set_condition",
  "set_relationship",
  "spawn_item",
  "spawn_npc",
  "start_search",
  "transfer_item",
].sort((left, right) => right.length - left.length);

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

function isToolTokenChar(value: string | undefined): boolean {
  if (!value) return false;
  return (value >= "a" && value <= "z")
    || (value >= "A" && value <= "Z")
    || (value >= "0" && value <= "9")
    || value === "_";
}

function redactPlayerFacingToolNames(text: string): string {
  const lower = text.toLowerCase();
  let output = "";
  let cursor = 0;

  while (cursor < text.length) {
    const match = PLAYER_FACING_TOOL_NAMES.find((toolName) =>
      lower.startsWith(toolName, cursor)
      && !isToolTokenChar(text[cursor - 1])
      && !isToolTokenChar(text[cursor + toolName.length]));
    if (match) {
      output += PLAYER_REF_REPLACEMENT;
      cursor += match.length;
      continue;
    }
    output += text[cursor];
    cursor += 1;
  }

  return output;
}

export function sanitizePlayerFacingText(
  value: string,
  options: { maxChars?: number; preserveWhitespace?: boolean } = {},
): string {
  const redacted = redactPlayerFacingToolNames(sanitizePlayerFacingBackendRefs(value));
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

function playerFacingQuickActionHandle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const handle = value.trim();
  return PLAYER_FACING_QUICK_ACTION_HANDLE_PATTERN.test(handle) ? handle : null;
}

export function toPlayerFacingQuickActions(value: unknown): PlayerFacingQuickActionsEvent | null {
  const actions = readActionArray(value)
    .flatMap((entry): PlayerFacingQuickAction[] => {
      if (!isRecord(entry)) return [];
      const label = playerFacingText(entry.label, MAX_QUICK_ACTION_LABEL_LENGTH);
      const action = playerFacingText(entry.action, MAX_QUICK_ACTION_TEXT_LENGTH);
      const handle = playerFacingQuickActionHandle(entry.handle);
      return label && action && handle ? [{ label, action, handle }] : [];
    })
    .slice(0, MAX_QUICK_ACTIONS);

  return actions.length > 0 ? { actions } : null;
}
