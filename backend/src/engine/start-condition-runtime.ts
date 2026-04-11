import type { CharacterRecord } from "@worldforge/shared";

const OPENING_PREFIX = "Opening:";
const OPENING_EFFECT_TICK_CEILING = 3;

type ImmediateSituationId =
  | "pursuit"
  | "injured"
  | "questioned"
  | "concealed"
  | "escorted";

interface ImmediateSituationRule {
  id: ImmediateSituationId;
  flag: string;
  patterns: RegExp[];
  constraint: string;
  opportunity: string;
  resolutionPatterns: RegExp[];
}

export interface StartConditionRuntimeEffects {
  isActive: boolean;
  openingStatusFlags: string[];
  activeStatusFlags: string[];
  sceneFlags: string[];
  sceneContextLines: string[];
  promptLines: string[];
  companionNames: string[];
  expirationReason: "none" | "location_change" | "tick_ceiling" | "explicit_resolution";
}

export interface StartConditionRuntimeOptions {
  currentTick: number;
  currentLocationId: string | null;
  playerAction?: string | null;
}

const IMMEDIATE_SITUATION_RULES: ImmediateSituationRule[] = [
  {
    id: "pursuit",
    flag: `${OPENING_PREFIX} Situation - Pursued`,
    patterns: [/tail/i, /pursu/i, /chase/i, /flee/i, /hunt/i],
    constraint: "Someone is actively closing in, so lingering or loud actions are riskier.",
    opportunity: "Actions to break line of sight, slip away, or buy time directly address the opening situation.",
    resolutionPatterns: [
      /slip (?:into|through)/i,
      /lose (?:the )?tail/i,
      /shake (?:the )?tail/i,
      /break line of sight/i,
      /evade/i,
      /escape/i,
    ],
  },
  {
    id: "injured",
    flag: `${OPENING_PREFIX} Situation - Wounded Arrival`,
    patterns: [/bleed/i, /wound/i, /injur/i, /hurt/i],
    constraint: "Pain and instability complicate precision and sustained effort.",
    opportunity: "Actions to stabilize, bandage, or secure shelter directly address the opening strain.",
    resolutionPatterns: [/bandage/i, /stabiliz/i, /dress (?:the )?wound/i, /rest/i],
  },
  {
    id: "questioned",
    flag: `${OPENING_PREFIX} Situation - Under Questioning`,
    patterns: [/question/i, /interrogat/i, /demand/i, /identify yourself/i],
    constraint: "Direct scrutiny limits evasive movement and makes obvious lies riskier.",
    opportunity: "Actions to comply, bluff, redirect, or produce credentials directly address the opening pressure.",
    resolutionPatterns: [/bluff/i, /explain/i, /present papers/i, /answer/i, /talk my way/i],
  },
  {
    id: "concealed",
    flag: `${OPENING_PREFIX} Situation - In Hiding`,
    patterns: [/hid(?:e|ing)/i, /lay low/i, /conceal/i, /keep out of sight/i, /disguise/i],
    constraint: "Maintaining cover matters; abrupt public acts may blow the opening advantage.",
    opportunity: "Quiet scouting, subtle movement, or maintaining cover directly exploit the opening state.",
    resolutionPatterns: [/reveal myself/i, /announce myself/i, /step out/i, /drop (?:the )?disguise/i],
  },
  {
    id: "escorted",
    flag: `${OPENING_PREFIX} Situation - Under Escort`,
    patterns: [/escort/i, /guarded/i, /custody/i, /under guard/i],
    constraint: "Your movement is constrained by the escort's expectations and position.",
    opportunity: "Actions to negotiate, misdirect, or slip the escort directly address the opening state.",
    resolutionPatterns: [/dismiss/i, /slip away/i, /break free/i, /misdirect/i],
  },
];

function pushUnique(target: string[], value: string | null | undefined): void {
  if (!value) {
    return;
  }

  const normalized = value.trim();
  if (!normalized) {
    return;
  }

  if (!target.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
    target.push(normalized);
  }
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizePhrase(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeFlagFragment(value: string): string {
  return toTitleCase(normalizePhrase(value));
}

function isOpeningFlag(value: string): boolean {
  return value.startsWith(OPENING_PREFIX);
}

function stripOpeningFlags(flags: string[]): string[] {
  return flags.filter((flag) => !isOpeningFlag(flag));
}

function hasStructuredOpeningState(record: CharacterRecord): boolean {
  const start = record.startConditions;
  return Boolean(
    start.arrivalMode
      || start.startingVisibility
      || (start.entryPressure && start.entryPressure.length > 0)
      || (start.companions && start.companions.length > 0)
      || start.immediateSituation,
  );
}

function detectImmediateSituationRules(value: string | null | undefined): ImmediateSituationRule[] {
  const text = value?.trim() ?? "";
  if (!text) {
    return [];
  }

  return IMMEDIATE_SITUATION_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text)),
  );
}

function actionResolvesOpeningState(
  action: string | null | undefined,
  activeRules: ImmediateSituationRule[],
  entryPressure: string[],
  startingVisibility: string | null | undefined,
): boolean {
  const text = action?.trim() ?? "";
  if (!text) {
    return false;
  }

  for (const rule of activeRules) {
    if (rule.resolutionPatterns.some((pattern) => pattern.test(text))) {
      return true;
    }
  }

  const visibility = (startingVisibility ?? "").trim().toLowerCase();
  if (visibility === "noticed" || visibility === "public" || visibility === "obvious") {
    if (
      /(blend in|keep a low profile|slip away|lose myself in the crowd|stay inconspicuous)/i.test(
        text,
      )
    ) {
      return true;
    }
  }

  if (
    entryPressure.some((pressure) => /under watch|clock running out|being tracked/i.test(pressure))
    && /(shake|evade|lose|escape|hide|slip into)/i.test(text)
  ) {
    return true;
  }

  return false;
}

function deriveOpeningPayload(record: CharacterRecord): {
  openingStatusFlags: string[];
  sceneFlags: string[];
  sceneContextLines: string[];
  promptLines: string[];
  companionNames: string[];
  immediateRules: ImmediateSituationRule[];
} {
  const openingStatusFlags: string[] = [];
  const sceneFlags: string[] = [];
  const constraints: string[] = [];
  const opportunities: string[] = [];
  const promptLines: string[] = [];
  const companionNames = (record.startConditions.companions ?? [])
    .map((value) => normalizePhrase(value))
    .filter(Boolean);

  const arrivalMode = normalizePhrase(record.startConditions.arrivalMode ?? "");
  if (arrivalMode) {
    pushUnique(openingStatusFlags, `${OPENING_PREFIX} Arrival - ${normalizeFlagFragment(arrivalMode)}`);
    pushUnique(sceneFlags, `opening-arrival:${arrivalMode.toLowerCase()}`);
    promptLines.push(`Opening Arrival: ${arrivalMode}`);
    if (/on[- ]?foot/i.test(arrivalMode)) {
      constraints.push("You arrived on foot and are limited to what you can carry right now.");
    } else if (/escort/i.test(arrivalMode)) {
      constraints.push("Your arrival posture assumes someone else is controlling or observing your entry.");
    } else if (/hidden|concealed|sneak/i.test(arrivalMode)) {
      constraints.push("Your entry depends on keeping your arrival discreet.");
    }
  }

  const visibility = normalizePhrase(record.startConditions.startingVisibility ?? "");
  if (visibility) {
    pushUnique(openingStatusFlags, `${OPENING_PREFIX} Visibility - ${normalizeFlagFragment(visibility)}`);
    pushUnique(sceneFlags, `opening-visibility:${visibility.toLowerCase()}`);
    promptLines.push(`Opening Visibility: ${visibility}`);
    if (/noticed|public|obvious/i.test(visibility)) {
      constraints.push("Your arrival is already noticed, so obvious or disruptive actions attract faster reactions.");
    } else if (/hidden|unnoticed|unknown/i.test(visibility)) {
      opportunities.push("Remaining discreet or exploiting your low profile is easier right now.");
    } else if (/expected|welcome/i.test(visibility)) {
      opportunities.push("Because your arrival is expected, direct social actions start from a steadier footing.");
    }
  }

  const entryPressure = (record.startConditions.entryPressure ?? [])
    .map((value) => normalizePhrase(value))
    .filter(Boolean);
  for (const pressure of entryPressure) {
    pushUnique(openingStatusFlags, `${OPENING_PREFIX} Pressure - ${normalizeFlagFragment(pressure)}`);
    pushUnique(sceneFlags, `opening-pressure:${pressure.toLowerCase()}`);
  }
  if (entryPressure.length > 0) {
    promptLines.push(`Opening Pressure: ${entryPressure.join(", ")}`);
    constraints.push(`You are under immediate pressure: ${entryPressure.join(", ")}.`);
  }

  if (companionNames.length > 0) {
    pushUnique(openingStatusFlags, `${OPENING_PREFIX} Companion Present`);
    pushUnique(sceneFlags, "opening-companions:present");
    promptLines.push(`Opening Companions: ${companionNames.join(", ")}`);
  }

  const immediateRules = detectImmediateSituationRules(record.startConditions.immediateSituation);
  for (const rule of immediateRules) {
    pushUnique(openingStatusFlags, rule.flag);
    pushUnique(sceneFlags, `opening-situation:${rule.id}`);
    constraints.push(rule.constraint);
    opportunities.push(rule.opportunity);
  }

  const sceneContextLines: string[] = [];
  if (constraints.length > 0) {
    sceneContextLines.push(`Opening Constraints: ${constraints.join(" ")}`);
  }
  if (opportunities.length > 0) {
    sceneContextLines.push(`Opening Opportunities: ${opportunities.join(" ")}`);
  }
  if (companionNames.length > 0) {
    sceneContextLines.push(`Opening Companions: ${companionNames.join(", ")}`);
  }

  return {
    openingStatusFlags,
    sceneFlags,
    sceneContextLines,
    promptLines,
    companionNames,
    immediateRules,
  };
}

export function deriveStartConditionEffects(
  record: CharacterRecord,
  options: StartConditionRuntimeOptions,
): StartConditionRuntimeEffects {
  const stableFlags = stripOpeningFlags(record.state.statusFlags);
  if (!hasStructuredOpeningState(record)) {
    return {
      isActive: false,
      openingStatusFlags: [],
      activeStatusFlags: stableFlags,
      sceneFlags: [],
      sceneContextLines: [],
      promptLines: [],
      companionNames: [],
      expirationReason: "none",
    };
  }

  const canonicalLocationId =
    record.startConditions.startLocationId ?? record.socialContext.currentLocationId ?? null;
  const expiredByLocation =
    Boolean(canonicalLocationId && options.currentLocationId && canonicalLocationId !== options.currentLocationId);
  const expiredByTick = options.currentTick >= OPENING_EFFECT_TICK_CEILING;
  const payload = deriveOpeningPayload(record);
  const expiredByResolution = actionResolvesOpeningState(
    options.playerAction,
    payload.immediateRules,
    record.startConditions.entryPressure ?? [],
    record.startConditions.startingVisibility,
  );

  let expirationReason: StartConditionRuntimeEffects["expirationReason"] = "none";
  if (expiredByLocation) {
    expirationReason = "location_change";
  } else if (expiredByResolution) {
    expirationReason = "explicit_resolution";
  } else if (expiredByTick) {
    expirationReason = "tick_ceiling";
  }

  const isActive = expirationReason === "none";
  const activeStatusFlags = isActive
    ? [...stableFlags, ...payload.openingStatusFlags]
    : stableFlags;

  return {
    isActive,
    openingStatusFlags: payload.openingStatusFlags,
    activeStatusFlags,
    sceneFlags: isActive ? payload.sceneFlags : [],
    sceneContextLines: isActive ? payload.sceneContextLines : [],
    promptLines: isActive ? payload.promptLines : [],
    companionNames: isActive ? payload.companionNames : [],
    expirationReason,
  };
}

export function applyStartConditionEffects(
  record: CharacterRecord,
  options: StartConditionRuntimeOptions,
): {
  record: CharacterRecord;
  effects: StartConditionRuntimeEffects;
  changed: boolean;
} {
  const effects = deriveStartConditionEffects(record, options);
  const nextRecord: CharacterRecord = {
    ...record,
    state: {
      ...record.state,
      statusFlags: effects.activeStatusFlags,
    },
  };

  const changed =
    nextRecord.state.statusFlags.length !== record.state.statusFlags.length
    || nextRecord.state.statusFlags.some(
      (value, index) => record.state.statusFlags[index] !== value,
    );

  return {
    record: changed ? nextRecord : record,
    effects,
    changed,
  };
}
