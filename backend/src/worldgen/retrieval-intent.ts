export const RETRIEVAL_INTENTS = [
  "world_canon_fact",
  "character_canon_fact",
  "power_profile",
  "event_clarification",
] as const;

export type RetrievalIntent = (typeof RETRIEVAL_INTENTS)[number];

export type WorldgenResearchTopic =
  | "locations"
  | "factions"
  | "npcs"
  | "rules"
  | "event_history";

export interface WorldgenResearchJob {
  intent: "world_canon_fact";
  topic: WorldgenResearchTopic;
  purpose: string;
  query: string;
  missingTopic?: string;
}

export interface WorldgenResearchPlan {
  intent: "world_canon_fact";
  franchise: string;
  step: "overview" | "locations" | "factions" | "npcs";
  jobs: WorldgenResearchJob[];
}

export interface BuildWorldgenResearchPlanInput {
  franchise: string;
  premise: string;
  step?: "locations" | "factions" | "npcs";
  missingTopics?: string[];
  maxJobs?: number;
}

const TOPIC_PURPOSES: Record<WorldgenResearchTopic, string> = {
  locations: "Ground world generation in named locations, regions, borders, and spatial anchors.",
  factions: "Ground world generation in named factions, organizations, clans, and political powers.",
  npcs: "Ground world generation in notable canonical characters, leaders, rivals, and local personalities.",
  rules: "Ground world generation in the canonical power system, abilities, limits, and world rules.",
  event_history: "Ground world generation in canonical timeline events, wars, upheavals, and major turning points.",
};

const TOPIC_QUERY_STEMS: Record<WorldgenResearchTopic, string> = {
  locations: "canonical locations regions map geography",
  factions: "canonical factions organizations clans nations",
  npcs: "canonical characters leaders rivals role summaries",
  rules: "canonical power system rules abilities limits",
  event_history: "canonical timeline wars crises key events history",
};

const LOCATION_PATTERN = /\b(location|locations|map|maps|geography|geographic|village|villages|city|cities|town|towns|region|regions|kingdom|land|lands|territory|territories|realm|realms|planet|planets|island|islands|forest|mountain|mountains|castle|route|routes|border|borders)\b/i;
const FACTION_PATTERN = /\b(faction|factions|organization|organizations|clan|clans|guild|guilds|alliance|alliances|army|armies|government|governments|nation|nations|empire|empires|order|orders|politic|political|village leadership)\b/i;
const NPC_PATTERN = /\b(character|characters|npc|npcs|leader|leaders|mentor|mentors|villain|villains|hero|heroes|protagonist|antagonist|rival|rivals|hokage|captain|general|commander)\b/i;
const RULES_PATTERN = /\b(power|powers|system|systems|ability|abilities|magic|spell|spells|chakra|jutsu|technique|techniques|technology|weapon|weapons|rule|rules|limit|limits|constraint|constraints|weakness|weaknesses|transformation|transformations)\b/i;
const HISTORY_PATTERN = /\b(history|historical|timeline|event|events|war|wars|battle|battles|rebellion|rebellions|uprising|uprisings|incident|incidents|aftermath|era|eras|fall|collapse|crisis|crises|before|after)\b/i;

function buildJob(
  franchise: string,
  topic: WorldgenResearchTopic,
  missingTopic?: string,
): WorldgenResearchJob {
  const suffix = missingTopic?.trim()
    ? `${TOPIC_QUERY_STEMS[topic]} ${missingTopic.trim()}`
    : TOPIC_QUERY_STEMS[topic];

  return {
    intent: "world_canon_fact",
    topic,
    purpose: missingTopic?.trim()
      ? `${TOPIC_PURPOSES[topic]} Focus on: ${missingTopic.trim()}.`
      : TOPIC_PURPOSES[topic],
    query: `${franchise} ${suffix}`.trim(),
    missingTopic: missingTopic?.trim() || undefined,
  };
}

function classifyMissingTopic(
  missingTopic: string,
  fallbackStep?: "locations" | "factions" | "npcs",
): WorldgenResearchTopic {
  if (LOCATION_PATTERN.test(missingTopic)) return "locations";
  if (FACTION_PATTERN.test(missingTopic)) return "factions";
  if (NPC_PATTERN.test(missingTopic)) return "npcs";
  if (RULES_PATTERN.test(missingTopic)) return "rules";
  if (HISTORY_PATTERN.test(missingTopic)) return "event_history";
  if (fallbackStep === "locations") return "locations";
  if (fallbackStep === "factions") return "factions";
  if (fallbackStep === "npcs") return "npcs";
  return "rules";
}

function derivePremiseTopics(premise: string): WorldgenResearchTopic[] {
  const topics = new Set<WorldgenResearchTopic>(["locations", "factions", "rules"]);

  if (NPC_PATTERN.test(premise)) {
    topics.add("npcs");
  }

  if (HISTORY_PATTERN.test(premise)) {
    topics.add("event_history");
  }

  if (LOCATION_PATTERN.test(premise)) {
    topics.add("locations");
  }

  if (FACTION_PATTERN.test(premise)) {
    topics.add("factions");
  }

  if (RULES_PATTERN.test(premise)) {
    topics.add("rules");
  }

  if (topics.size < 4) {
    topics.add("event_history");
  }

  return [...topics];
}

export function buildWorldgenResearchPlan(
  input: BuildWorldgenResearchPlanInput,
): WorldgenResearchPlan {
  const maxJobs = Math.max(1, input.maxJobs ?? 5);
  const step = input.step ?? "overview";
  const seen = new Set<string>();

  const jobs = (input.missingTopics?.length
    ? input.missingTopics.map((missingTopic) =>
        buildJob(
          input.franchise,
          classifyMissingTopic(missingTopic, input.step),
          missingTopic,
        ),
      )
    : derivePremiseTopics(input.premise).map((topic) => buildJob(input.franchise, topic)))
    .filter((job) => {
      const key = `${job.topic}:${job.missingTopic ?? job.query}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxJobs);

  return {
    intent: "world_canon_fact",
    franchise: input.franchise,
    step,
    jobs,
  };
}
