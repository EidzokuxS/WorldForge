import crypto from "node:crypto";
import type { WorldSeeds, SeedCategory } from "@worldforge/shared";
import { isRecord } from "../lib/index.js";

export type { WorldSeeds, SeedCategory } from "@worldforge/shared";

const GEOGRAPHY = [
  "Vast archipelago of floating islands",
  "Sprawling underground cavern network",
  "Continent-spanning megacity in decay",
  "Endless frozen tundra with buried ruins",
  "Dense jungle canopy with cities built in treetops",
  "Volcanic island chain on a boiling sea",
  "Desert wasteland dotted with ancient oases",
  "Coastal cliffs and fjords battered by storms",
  "Rolling plains with roaming fortress-cities",
  "Mountain range split by a massive rift valley",
  "Swamplands built on the bones of a dead leviathan",
  "Sky-piercing mesas connected by rope bridges",
];

const POLITICAL_STRUCTURE = [
  "Crumbling empire ruled by a dying dynasty",
  "Loose confederation of rival city-states",
  "Theocratic hierarchy worshipping a living god",
  "Military junta after a recent coup",
  "Tribal councils bound by blood oaths",
  "Merchant oligarchy where coin is law",
  "Feudal kingdoms in uneasy truce",
  "Anarchic free territories with no central rule",
  "Magocracy where power follows magical ability",
  "Elected council plagued by corruption and assassinations",
  "Dual monarchy split between two rival bloodlines",
  "Colonial occupation by a distant foreign power",
];

const CENTRAL_CONFLICT = [
  "Civil war between loyalists and rebels",
  "Foreign invasion from across the sea",
  "Spreading supernatural plague with no known cure",
  "Succession crisis - the throne sits empty",
  "Resource scarcity - water, food, or magic is running out",
  "Ancient sealed evil breaking free",
  "Religious schism tearing society apart",
  "Class uprising - the poor against the elite",
  "Territorial war between two major factions",
  "A prophecy that multiple factions interpret differently",
  "Ecological collapse - the land itself is dying",
  "Discovery of a powerful artifact everyone wants",
];

const CULTURAL_FLAVOR = [
  "Medieval Scandinavian",
  "Feudal Japanese",
  "Ancient Egyptian",
  "Byzantine Greek",
  "Mongol Steppe",
  "West African Empire",
  "Mesoamerican",
  "Persian Imperial",
  "Celtic/Gaelic",
  "Ottoman",
  "Ancient Roman",
  "Polynesian",
  "Mughal Indian",
  "Han Dynasty Chinese",
  "Moorish Iberian",
  "Slavic/Kievan",
  "Southeast Asian",
  "Inuit/Arctic",
];

const ENVIRONMENT = [
  "Eternal twilight - the sun never fully rises or sets",
  "Perpetual winter with rare, precious thaws",
  "Magical corruption visibly warping the landscape",
  "Two moons causing extreme tidal forces",
  "Frequent earthquakes from something stirring underground",
  "Bioluminescent flora lighting the darkness",
  "Toxic atmosphere outside protected settlements",
  "Seasons that last decades",
  "Constant rain and flooding",
  "A sky filled with aurora-like magical phenomena",
  "Gravity anomalies in certain regions",
  "Day/night cycle of 60 hours",
];

const WILDCARD = [
  "A sentient moon that whispers to sleepers",
  "The dead do not stay dead - they return changed",
  "Music has literal magical power",
  "A massive wall divides the world and no one remembers why",
  "Dreams are a shared dimension people can enter",
  "Time flows differently in different regions",
  "Animals are as intelligent as humans but cannot speak",
  "The ocean is alive and has demands",
  "Memory can be physically extracted and traded",
  "A second invisible world overlaps with this one",
  "The stars are going out, one by one",
  "Blood determines your caste and magical ability",
];

function pickRandom<T>(arr: T[]): T {
  const index = crypto.randomInt(arr.length);
  return arr[index];
}

function pickMultiple<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i += 1) {
    const remaining = copy.length - i;
    const swapIndex = i + crypto.randomInt(remaining);
    [copy[i], copy[swapIndex]] = [copy[swapIndex], copy[i]];
  }
  return copy.slice(0, n);
}

export function rollSeed<T extends SeedCategory>(category: T): WorldSeeds[T] {
  switch (category) {
    case "geography":
      return pickRandom(GEOGRAPHY) as WorldSeeds[T];
    case "politicalStructure":
      return pickRandom(POLITICAL_STRUCTURE) as WorldSeeds[T];
    case "centralConflict":
      return pickRandom(CENTRAL_CONFLICT) as WorldSeeds[T];
    case "culturalFlavor":
      return pickMultiple(CULTURAL_FLAVOR, 2 + crypto.randomInt(2)) as WorldSeeds[T];
    case "environment":
      return pickRandom(ENVIRONMENT) as WorldSeeds[T];
    case "wildcard":
      return pickRandom(WILDCARD) as WorldSeeds[T];
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function rollWorldSeeds(): WorldSeeds {
  return {
    geography: rollSeed("geography"),
    politicalStructure: rollSeed("politicalStructure"),
    centralConflict: rollSeed("centralConflict"),
    culturalFlavor: rollSeed("culturalFlavor"),
    environment: rollSeed("environment"),
    wildcard: rollSeed("wildcard"),
  };
}

const STRING_SEED_FIELDS: SeedCategory[] = [
  "geography",
  "politicalStructure",
  "centralConflict",
  "environment",
  "wildcard",
];

export function parseWorldSeeds(value: unknown): WorldSeeds | null {
  if (!isRecord(value)) {
    return null;
  }

  const seeds: WorldSeeds = {};
  let hasAny = false;

  for (const field of STRING_SEED_FIELDS) {
    const raw = value[field];
    if (typeof raw === "string" && raw.trim()) {
      (seeds as Record<string, string>)[field] = raw.trim();
      hasAny = true;
    }
  }

  if (
    Array.isArray(value.culturalFlavor) &&
    value.culturalFlavor.every((item: unknown) => typeof item === "string")
  ) {
    const culturalFlavor = (value.culturalFlavor as string[])
      .map((item) => item.trim())
      .filter(Boolean);
    if (culturalFlavor.length > 0) {
      seeds.culturalFlavor = culturalFlavor;
      hasAny = true;
    }
  }

  return hasAny ? seeds : null;
}
