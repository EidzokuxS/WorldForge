export type SessionResponseLanguageSource = "explicit" | "inferred" | "default";

export interface SessionResponseLanguage {
  languageName: "English" | "Russian";
  source: SessionResponseLanguageSource;
  reason: string;
}

const EXPLICIT_ENGLISH_PATTERNS: readonly RegExp[] = [
  /\b(?:respond|reply|write|narrate|output)\s+in\s+english\b/i,
  /\blanguage\s*:\s*english\b/i,
  /\benglish\s+only\b/i,
];

const EXPLICIT_RUSSIAN_PATTERNS: readonly RegExp[] = [
  /\b(?:respond|reply|write|narrate|output)\s+in\s+russian\b/i,
  /\blanguage\s*:\s*russian\b/i,
  /\brussian\s+only\b/i,
];

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeWhitespace(value ?? "");
    if (normalized) return normalized;
  }
  return null;
}

function explicitLanguageFromText(value: string): SessionResponseLanguage | null {
  if (EXPLICIT_ENGLISH_PATTERNS.some((pattern) => pattern.test(value))) {
    return {
      languageName: "English",
      source: "explicit",
      reason: "explicit English instruction",
    };
  }
  if (EXPLICIT_RUSSIAN_PATTERNS.some((pattern) => pattern.test(value))) {
    return {
      languageName: "Russian",
      source: "explicit",
      reason: "explicit Russian instruction",
    };
  }
  return null;
}

function inferLanguageFromText(
  value: string,
  reason: string,
): SessionResponseLanguage | null {
  const cyrillicCount = (value.match(/[\u0400-\u04FF]/g) ?? []).length;
  const latinCount = (value.match(/[A-Za-z]/g) ?? []).length;

  if (cyrillicCount >= 8 && cyrillicCount > latinCount) {
    return {
      languageName: "Russian",
      source: "inferred",
      reason,
    };
  }

  if (latinCount >= 8 && latinCount >= cyrillicCount) {
    return {
      languageName: "English",
      source: "inferred",
      reason,
    };
  }

  return null;
}

export function inferSessionResponseLanguage(input: {
  playerAction?: string | null;
  campaignName?: string | null;
  campaignPremise?: string | null;
  recentConversation?: readonly { role: string; content: string }[] | null;
}): SessionResponseLanguage {
  const explicitSources = [
    input.playerAction,
    input.campaignName,
    input.campaignPremise,
    ...(input.recentConversation ?? []).map((entry) => entry.content),
  ];
  for (const explicitSource of explicitSources) {
    const explicitText = firstNonEmpty(explicitSource);
    if (!explicitText) continue;
    const explicit = explicitLanguageFromText(explicitText);
    if (explicit) return explicit;
  }

  const actionLanguage = firstNonEmpty(input.playerAction);
  if (actionLanguage) {
    const inferred = inferLanguageFromText(actionLanguage, "current player action language");
    if (inferred) return inferred;
  }

  const premiseLanguage = firstNonEmpty(input.campaignPremise, input.campaignName);
  if (premiseLanguage) {
    const inferred = inferLanguageFromText(premiseLanguage, "campaign premise language");
    if (inferred) return inferred;
  }

  return {
    languageName: "English",
    source: "default",
    reason: "no strong session language signal",
  };
}

export function formatSessionLanguageContract(
  language: SessionResponseLanguage,
): string {
  return [
    "SESSION RESPONSE LANGUAGE",
    `Output language: ${language.languageName}.`,
    `Source: ${language.source}; ${language.reason}.`,
    `Write every player-visible prose line and model free-text field in ${language.languageName}.`,
    "Keep proper nouns, quoted source terms, character names, place names, and franchise terminology exactly as written when that preserves canon or user intent.",
    "Do not switch language because of operator locale, developer chat, logs, system text, or unrelated prior conversation.",
    "Use a different language only when the player action or campaign premise explicitly asks for it.",
  ].join("\n");
}
