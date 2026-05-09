export type MemoryWriteDecision =
  | {
      write: true;
      reason: string;
      importance: number;
      route: "memory" | "belief" | "report_message" | "rumor";
    }
  | {
      write: false;
      reason: string;
    };

export interface EvaluateMemoryWriteInput {
  eventType: string;
  summary: string;
  importance?: number | null;
  source?: "tool_result" | "location_recent_event" | "committed_event" | "reflection" | "narration";
  tags?: readonly string[];
}

const CONSEQUENTIAL_EVENT_TYPES = new Set([
  "actor_plan_step",
  "actor_plan_failure",
  "tool_result",
  "durable_event",
  "relationship_change",
  "goal_change",
  "belief_change",
  "promise",
  "threat",
  "order",
  "combat_outcome",
  "hidden_revelation",
  "state_change",
  "report",
  "rumor",
]);

const POLLUTION_PATTERNS = [
  /\bscene holds\b/i,
  /\batmosphere\b/i,
  /\bozone\b/i,
  /\bmost people\b/i,
  /\bunchanged\b/i,
  /\bdebug\b/i,
];

function hasConcreteAnchor(text: string): boolean {
  return /[A-ZА-ЯЁ][\p{L}'-]{2,}/u.test(text)
    || /\b(loc|npc|item|faction|event)[:_-][a-z0-9_-]+\b/i.test(text)
    || /["“][^"”]+["”]/.test(text);
}

export function evaluateMemoryWrite(input: EvaluateMemoryWriteInput): MemoryWriteDecision {
  const summary = input.summary.trim();
  if (!summary) {
    return { write: false, reason: "empty_summary" };
  }
  if (input.source === "narration") {
    return { write: false, reason: "narration_flavor_not_memory" };
  }
  if (POLLUTION_PATTERNS.some((pattern) => pattern.test(summary))) {
    return { write: false, reason: "stock_or_flavor_phrase" };
  }

  const eventType = input.eventType.trim().toLowerCase();
  const importance = Math.max(0, Math.min(10, Math.round(input.importance ?? 0)));
  const tagSet = new Set((input.tags ?? []).map((tag) => tag.toLowerCase()));
  const consequential =
    CONSEQUENTIAL_EVENT_TYPES.has(eventType)
    || importance >= 4
    || ["promise", "threat", "order", "relationship", "goal", "belief"].some((tag) => tagSet.has(tag));

  if (!consequential) {
    return { write: false, reason: "not_consequential" };
  }
  if (!hasConcreteAnchor(summary)) {
    return { write: false, reason: "no_concrete_anchor" };
  }

  if (eventType === "report") {
    return { write: true, reason: "source_backed_report", importance, route: "report_message" };
  }
  if (eventType === "rumor") {
    return { write: true, reason: "source_backed_rumor", importance, route: "rumor" };
  }
  if (eventType === "belief_change") {
    return { write: true, reason: "belief_changed", importance, route: "belief" };
  }
  return { write: true, reason: "consequential_source_backed_event", importance, route: "memory" };
}
