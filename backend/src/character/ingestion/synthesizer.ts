import { z } from "zod";
import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { createModel } from "../../ai/index.js";
import {
  richCharacterSchema,
  buildFlatOutputStrategy,
  toCharacterDraftFromRich,
} from "../generator.js";
import { buildCharacterPromptContract } from "../prompt-contract.js";
import { buildV2CardSections } from "../v2-sections.js";
import { buildImportModeGuidance } from "../import-utils.js";
import { extractSampleLinesFromMesExample } from "./mes-example-parser.js";
import { clampTokens } from "../../lib/clamp.js";
import { createLogger } from "../../lib/index.js";
import { withPipelineRetry } from "./retry.js";
import type { CharacterDraft, CharacterSourceKind } from "@worldforge/shared";
import type {
  IngestionClassification,
  IngestionContext,
  IngestionSources,
} from "./types.js";

const log = createLogger("ingestion-synthesizer");

const looseRichCharacterSchema = richCharacterSchema.extend({
  race: z.string().default(""),
  gender: z.string().default(""),
  age: z.string().default(""),
  appearance: z.string().default(""),
  backgroundSummary: z.string().default(""),
  personaSummary: z.string().default(""),
  drives: z.union([z.array(z.unknown()), z.string(), z.null()]).default([]),
  frictions: z.union([z.array(z.unknown()), z.string(), z.null()]).default([]),
  shortTermGoals: z.union([z.array(z.unknown()), z.string(), z.null()]).default([]),
  longTermGoals: z.union([z.array(z.unknown()), z.string(), z.null()]).default([]),
  personalitySummary: z.string().default(""),
  personalityVoice: z.string().default(""),
  personalityDecisionStyle: z.string().default(""),
  personalityWorldview: z.string().default(""),
  personalityContradictions: z.union([z.array(z.unknown()), z.string(), z.null()]).default([]),
  personalityMythology: z.string().default(""),
  personalitySampleLines: z.union([z.array(z.unknown()), z.string(), z.null()]).default([]),
  tags: z.union([z.array(z.unknown()), z.string(), z.null()]).default([]),
  hp: z.union([z.number(), z.string(), z.null()]).default(5),
  equippedItems: z.union([z.array(z.unknown()), z.string(), z.null()]).default([]),
  locationName: z.string().default(""),
});

function truncateText(value: string | null | undefined, maxLength: number): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength * 0.7)) {
    return sliced.slice(0, lastSpace).trim();
  }

  return sliced.trim();
}

function normalizeListString(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  const normalizedBullets = trimmed
    .replace(/\r\n/g, "\n")
    .replace(/[•◦]/g, "\n")
    .replace(/(?:^|\n)\s*[-*]\s+/g, "\n")
    .replace(/(?:^|\s)\d+\.\s+/g, "\n");

  const lines = normalizedBullets
    .split(/\n+/)
    .map((item) => item.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""))
    .filter(Boolean);
  if (lines.length > 1) {
    return lines;
  }

  const semicolonSplit = trimmed
    .split(/\s*;\s+/)
    .map((item) => item.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""))
    .filter(Boolean);
  if (semicolonSplit.length > 1) {
    return semicolonSplit;
  }

  return [trimmed.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")];
}

function normalizeStringList(
  value: unknown,
  opts: { maxItems: number; maxItemLength: number },
): string[] {
  const items = Array.isArray(value)
    ? value.flatMap((entry) =>
        typeof entry === "string" ? normalizeListString(entry) : [],
      )
    : typeof value === "string"
      ? normalizeListString(value)
      : [];

  return items
    .map((item) => truncateText(item, opts.maxItemLength))
    .filter(Boolean)
    .slice(0, opts.maxItems);
}

function clampInteger(
  value: unknown,
  opts: { min: number; max: number; fallback: number },
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return opts.fallback;
  }

  return Math.max(opts.min, Math.min(opts.max, Math.round(parsed)));
}

function normalizeTags(value: unknown, fallbackTags: string[]): string[] {
  const merged = [
    ...normalizeStringList(value, { maxItems: 12, maxItemLength: 60 }),
    ...fallbackTags,
  ]
    .map((tag) => truncateText(tag.replace(/^\[|\]$/g, ""), 60))
    .filter(Boolean);

  return [...new Set(merged)].slice(0, 12);
}

function normalizeLocationName(raw: string, knownLocations: string[]): string {
  const normalized = raw.trim();
  if (knownLocations.length === 0) {
    return normalized;
  }
  if (!normalized) {
    return knownLocations[0]!;
  }

  const exact = knownLocations.find(
    (candidate) => candidate.toLowerCase() === normalized.toLowerCase(),
  );
  if (exact) {
    return exact;
  }

  const fuzzy = knownLocations.find((candidate) => {
    const left = candidate.toLowerCase();
    const right = normalized.toLowerCase();
    return left.includes(right) || right.includes(left);
  });
  if (fuzzy) {
    return fuzzy;
  }

  return knownLocations[0]!;
}

function normalizeLooseRichOutput(
  raw: z.infer<typeof looseRichCharacterSchema>,
  opts: { fallbackTags: string[]; knownLocations: string[] },
) {
  return {
    ...raw,
    race: truncateText(raw.race, 100),
    gender: truncateText(raw.gender, 100),
    age: truncateText(raw.age, 100),
    appearance: truncateText(raw.appearance, 1000),
    backgroundSummary: truncateText(raw.backgroundSummary, 2000),
    personaSummary: truncateText(raw.personaSummary, 2000),
    drives: normalizeStringList(raw.drives, {
      maxItems: 6,
      maxItemLength: 180,
    }),
    frictions: normalizeStringList(raw.frictions, {
      maxItems: 6,
      maxItemLength: 180,
    }),
    shortTermGoals: normalizeStringList(raw.shortTermGoals, {
      maxItems: 6,
      maxItemLength: 220,
    }),
    longTermGoals: normalizeStringList(raw.longTermGoals, {
      maxItems: 6,
      maxItemLength: 220,
    }),
    personalitySummary: truncateText(raw.personalitySummary, 400),
    personalityVoice: truncateText(raw.personalityVoice, 600),
    personalityDecisionStyle: truncateText(raw.personalityDecisionStyle, 400),
    personalityWorldview: truncateText(raw.personalityWorldview, 400),
    personalityContradictions: normalizeStringList(raw.personalityContradictions, {
      maxItems: 3,
      maxItemLength: 300,
    }),
    personalityMythology: truncateText(raw.personalityMythology, 400),
    personalitySampleLines: normalizeStringList(raw.personalitySampleLines, {
      maxItems: 3,
      maxItemLength: 300,
    }),
    tags: normalizeTags(raw.tags, opts.fallbackTags),
    hp: 5,
    equippedItems: normalizeStringList(raw.equippedItems, {
      maxItems: 6,
      maxItemLength: 120,
    }),
    locationName: normalizeLocationName(raw.locationName, opts.knownLocations),
  };
}

function formatOverrideSection(overrideText: string | null): string {
  if (!overrideText) {
    return "PRIORITY 1 — USER OVERRIDE INSTRUCTIONS (HIGHEST — must win any conflict with lower sources):\n(none provided — ignore this section, do not invent overrides.)";
  }
  return `PRIORITY 1 — USER OVERRIDE INSTRUCTIONS (HIGHEST — must win any conflict with lower sources):
The user explicitly directs the following. Honor every directive literally, even if it contradicts the source card or research. Preserve override phrasing verbatim in the relevant field:
"""
${overrideText}
"""`;
}

function formatCardSection(sources: IngestionSources): string {
  if (!sources.card) {
    return "PRIORITY 2 — SOURCE CARD:\n(no card imported — ignore this section)";
  }
  const sampleLines = extractSampleLinesFromMesExample(sources.card.mesExample ?? "");
  const cardBlock = buildV2CardSections({
    name: sources.card.name,
    description: sources.card.description,
    personality: sources.card.personality,
    scenario: sources.card.scenario,
    v2Tags: sources.card.tags,
  }, sampleLines);
  return `PRIORITY 2 — SOURCE CARD (character author's interpretation; preserve unless overridden):
${cardBlock}
${buildImportModeGuidance(sources.card.importMode)}`;
}

function formatResearchSection(
  researchDigest: string | null,
  canonicalStatus: string,
): string {
  if (!researchDigest) {
    return "PRIORITY 3 — CANON RESEARCH:\n(not a canonical character or research unavailable — ignore this section)";
  }
  return `PRIORITY 3 — CANON RESEARCH (${canonicalStatus}; use to fill gaps only; never overrides card or user override):
${researchDigest}`;
}

function formatFreeTextSection(sources: IngestionSources): string {
  const text = sources.freeText ?? sources.archetype;
  if (!text) {
    return "PRIORITY 4 — FREE-TEXT CONCEPT OR ARCHETYPE:\n(none provided — infer entirely from higher priorities or the world premise)";
  }
  const label = sources.mode === "research" ? "ARCHETYPE" : "FREE-TEXT CONCEPT";
  return `PRIORITY 4 — ${label} (lowest priority among supplied sources; filled-in by higher ones when they speak):
${text}`;
}

function sourceKindForMode(mode: IngestionSources["mode"]): CharacterSourceKind {
  switch (mode) {
    case "parse":
      return "player-input";
    case "import":
      return "import";
    case "research":
      return "archetype";
    case "generate":
      return "generator";
  }
}

export async function synthesizeDraftFromSources(opts: {
  sources: IngestionSources;
  classification: IngestionClassification;
  researchDigest: string | null;
  ctx: IngestionContext;
}): Promise<CharacterDraft> {
  const { sources, classification, researchDigest, ctx } = opts;

  const roleEmphasis =
    sources.mode === "import"
      ? "Imported characters preserve canon-facing facts and card cues, but the user override (PRIORITY 1) always wins. Reconcile priorities explicitly per field."
      : sources.mode === "research"
        ? "Archetype-researched characters build from canonical archetype cues while honoring user override and any supplied card."
        : sources.mode === "parse"
          ? "Parse free-text into structured draft fields while honoring user override directives literally."
          : "Generate a fresh character from the world premise while honoring user override directives literally.";

  const knownFactionsBlock = ctx.factionNames.length
    ? "KNOWN FACTIONS:\n" + ctx.factionNames.map((n) => "- " + n).join("\n")
    : "";

  const prompt = `You are synthesizing a WorldForge CharacterDraft from multiple sources using strict priority merge.

${buildCharacterPromptContract({
  marker: "character-synthesis.v1",
  roleEmphasis,
  includeCanonicalLoadout: classification.canonicalStatus === "known_ip_canonical",
})}

FLAT OUTPUT STRATEGY:
${buildFlatOutputStrategy({
  preservePlayerAgency:
    sources.role === "player" && (sources.mode === "parse" || sources.mode === "generate"),
})}

WORLD PREMISE:
${ctx.campaign.premise}

KNOWN LOCATIONS (pick one as locationName):
${ctx.locationNames.map((n) => `- ${n}`).join("\n")}

${knownFactionsBlock}

===== SOURCES (ranked by priority) =====
${formatOverrideSection(sources.overrideText)}

${formatCardSection(sources)}

${formatResearchSection(researchDigest, classification.canonicalStatus)}

${formatFreeTextSection(sources)}
===== END SOURCES =====

MERGE RULES (MUST be followed field-by-field):
1. When PRIORITY 1 (user override) speaks to a field, use its value literally. Override phrasing is the ground truth — do not paraphrase away the directive.
2. When PRIORITY 1 is silent on a field, use PRIORITY 2 (card) if present.
3. When PRIORITY 2 is silent, use PRIORITY 3 (canon research) to fill the field for canonical characters.
4. When higher priorities are all silent, use PRIORITY 4 (free text / archetype) or reasonable inference from the world premise.
5. Never invent facts that no source supports. If the fourth priority is also silent on a minor field, leave a sensible default rather than fabricating lore.
6. If PRIORITY 1 contradicts PRIORITY 2 or 3, PRIORITY 1 wins. Document the override in backgroundSummary when the change is materially biographical.
7. Keep the displayName from PRIORITY 2 (card) when present. Otherwise generate a fitting name.
8. Tags must be Title Case, 1-3 words each, no fandom meta.
9. locationName MUST be one of KNOWN LOCATIONS above.
10. If PRIORITY 2 supplied SAMPLE LINES, preserve 2-3 of them verbatim in personalitySampleLines — they are the character's canonical voice.

FIELD LIMITS (must be respected literally):
- hp must be 5 exactly; starting HP is a system default, not a creative choice
- tags must be an ARRAY of 3-12 concise strings
- equippedItems must be an ARRAY of 0-6 strings
- personalitySummary <= 400 characters
- personalityVoice <= 600 characters
- personalityDecisionStyle <= 400 characters
- personalityWorldview <= 400 characters
- personalityContradictions must be an ARRAY of 1-3 concise strings, each <= 300 characters
- personalityMythology <= 400 characters
- personalitySampleLines must be an ARRAY of 0-3 spoken lines, each <= 300 characters`;

  const rich = await withPipelineRetry("synthesize", async () => {
    log.info("synthesize: calling generateObject", {
      mode: sources.mode,
      role: sources.role,
      canonicalStatus: classification.canonicalStatus,
      hasOverride: !!sources.overrideText,
      hasCard: !!sources.card,
      hasResearch: !!researchDigest,
    });
    const result = await generateObject({
      model: createModel(ctx.gen.provider),
      schema: looseRichCharacterSchema,
      prompt,
      temperature: ctx.gen.temperature,
      maxOutputTokens: clampTokens(ctx.gen.maxTokens),
      retries: 1,
    });
    return normalizeLooseRichOutput(result.object, {
      fallbackTags: sources.card?.tags ?? [],
      knownLocations: ctx.locationNames,
    });
  });

  const draft = toCharacterDraftFromRich(rich, {
    sourceKind: sourceKindForMode(sources.mode),
    importMode: sources.card?.importMode ?? null,
    canonicalStatus: classification.canonicalStatus,
  });

  if (sources.role === "key") {
    draft.identity.role = "npc";
    draft.identity.tier = "key";
  }

  // Record override provenance on the draft so downstream consumers (route responses,
  // power assessor) and the Phase 61 UI can surface it. `overrideText` is an
  // additive field beyond the typed CharacterProvenance contract — the cast
  // documents the intentional widening.
  if (sources.overrideText) {
    (draft.provenance as CharacterDraft["provenance"] & { overrideText?: string }).overrideText =
      sources.overrideText;
  }

  return draft;
}
