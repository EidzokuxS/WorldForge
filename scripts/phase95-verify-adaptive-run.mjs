import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAW_REF_PATTERNS = [
  { code: "uuid", pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
  { code: "location-id", pattern: /\bloc-[a-z0-9][a-z0-9_-]*\b/i },
  { code: "npc-id", pattern: /\bnpc-[a-z0-9][a-z0-9_-]*\b/i },
  { code: "item-id", pattern: /\bitem-[a-z0-9][a-z0-9_-]*\b/i },
  { code: "route-id", pattern: /\b(?:route|edge)-[a-z0-9][a-z0-9_-]*\b/i },
  { code: "faction-id", pattern: /\bfaction-[a-z0-9][a-z0-9_-]*\b/i },
  { code: "command-node-id", pattern: /\b(?:cmd|command-node)-[a-z0-9][a-z0-9_-]*\b/i },
  { code: "public-handle", pattern: /\b(?:pdto|qac)_[a-z0-9_:-]+\b/i },
];

const PUBLIC_PROJECTION_REF_PATTERNS = RAW_REF_PATTERNS.filter(({ code }) => code !== "public-handle");

const INTERNAL_TEXT_PATTERNS = [
  { code: "prompt-label", pattern: /Player action request:/i },
  { code: "gm-contract", pattern: /GM no-mutation/i },
  { code: "narration-draft", pattern: /NarrationDraft/i },
  { code: "tool-result", pattern: /tool_result:/i },
  { code: "committed-event", pattern: /committed_event:/i },
  { code: "player-facing-packet", pattern: /PlayerFacingPacket/i },
  { code: "narrator-packet", pattern: /NarratorPacket/i },
  { code: "tool-name-dialogue", pattern: /record_dialogue_outcome/i },
  { code: "tool-name-world-fact", pattern: /record_world_fact/i },
  { code: "tool-name-oracle", pattern: /request_contested_outcome/i },
  { code: "legacy-action-result", pattern: /\[ACTION RESULT\]/i },
  { code: "legacy-sentences-text", pattern: /sentences\[\]\.text/i },
  { code: "support-context", pattern: /\bsupport[-_ ]only\b/i },
];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function add(list, severity, code, message, detail = null) {
  list.push({ severity, code, message, detail });
}

function compactText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function scanText(value, patterns) {
  const text = compactText(value);
  return patterns
    .filter(({ pattern }) => pattern.test(text))
    .map(({ code, pattern }) => ({ code, pattern: pattern.source }));
}

function scanJsonStrings(value, patterns, input, issues, trail = "$") {
  if (typeof value === "string") {
    const leaks = scanText(value, patterns);
    for (const leak of leaks) {
      add(issues, "hard", input.code, `${input.label} leaks ${leak.code}.`, {
        path: trail,
        ...leak,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanJsonStrings(entry, patterns, input, issues, `${trail}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "handle" && typeof child === "string" && /\b(?:pdto|qac)_/i.test(child)) continue;
    scanJsonStrings(child, patterns, input, issues, `${trail}.${key}`);
  }
}

function visibleFingerprint(value) {
  return compactText(value).toLowerCase().slice(0, 240);
}

function loadProgress(progressPath) {
  if (!fileExists(progressPath)) return [];
  return fs.readFileSync(progressPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { parseError: true, raw: line };
      }
    });
}

function validateQuickActions(input, issues) {
  const quickActions = Array.isArray(input.quickActions) ? input.quickActions : [];
  quickActions.forEach((action, index) => {
    if (!isRecord(action)) {
      add(issues, "hard", "quick-action-shape", `Turn ${input.turnIndex} quick action ${index + 1} is not an object.`, action);
      return;
    }
    if (!action.offerId || !action.actionId) {
      add(issues, "hard", "quick-action-missing-capability", `Turn ${input.turnIndex} quick action ${index + 1} lacks offerId/actionId authority.`, {
        label: action.label ?? null,
        offerId: action.offerId ?? null,
        actionId: action.actionId ?? null,
      });
    }
    const visible = `${action.label ?? ""} ${action.action ?? ""}`;
    const leaks = scanText(visible, [...RAW_REF_PATTERNS, ...INTERNAL_TEXT_PATTERNS]);
    for (const leak of leaks) {
      add(issues, "hard", "quick-action-visible-leak", `Turn ${input.turnIndex} quick action ${index + 1} leaks ${leak.code}.`, leak);
    }
  });
}

function validateTurnArtifact(input, issues) {
  const artifactPath = path.join(input.root, `turn-${String(input.turnIndex).padStart(2, "0")}.json`);
  if (!fileExists(artifactPath)) {
    add(issues, "hard", "missing-turn-json", `Turn ${input.turnIndex} artifact is missing.`, { artifactPath });
    return;
  }
  let artifact = null;
  try {
    artifact = readJson(artifactPath);
  } catch (error) {
    add(issues, "hard", "invalid-turn-json", `Turn ${input.turnIndex} artifact is not readable JSON.`, {
      artifactPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  if (!isRecord(artifact) || !isRecord(artifact.turn)) {
    add(issues, "hard", "turn-json-missing-turn", `Turn ${input.turnIndex} artifact lacks a turn object.`, { artifactPath });
    return;
  }
  if (!isRecord(artifact.world)) {
    add(issues, "hard", "turn-json-missing-world", `Turn ${input.turnIndex} artifact lacks world projection.`, { artifactPath });
  } else {
    scanJsonStrings(
      artifact.world,
      [...PUBLIC_PROJECTION_REF_PATTERNS, ...INTERNAL_TEXT_PATTERNS],
      {
        code: "turn-world-public-projection-leak",
        label: `Turn ${input.turnIndex} world projection`,
      },
      issues,
    );
  }
  if (!isRecord(artifact.history)) {
    add(issues, "hard", "turn-json-missing-history", `Turn ${input.turnIndex} artifact lacks chat history projection.`, { artifactPath });
  } else {
    scanJsonStrings(
      artifact.history,
      [...PUBLIC_PROJECTION_REF_PATTERNS, ...INTERNAL_TEXT_PATTERNS],
      {
        code: "turn-history-public-projection-leak",
        label: `Turn ${input.turnIndex} history projection`,
      },
      issues,
    );
  }
}

function validateSetup(input, issues) {
  const mode = input.state.setupMode ?? (fileExists(path.join(input.root, "clone-provenance.json")) ? "clone" : "worldgen");
  if (mode === "clone") {
    const provenancePath = path.join(input.root, "clone-provenance.json");
    const poolPath = path.join(input.root, "baseline-pool.json");
    const cloneWorldPath = path.join(input.root, "world-after-clone-load.json");
    if (!fileExists(provenancePath)) add(issues, "hard", "missing-clone-provenance", "Clone run is missing clone-provenance.json.");
    if (!fileExists(poolPath)) add(issues, "hard", "missing-baseline-pool", "Clone run is missing baseline-pool.json.");
    if (!fileExists(cloneWorldPath)) add(issues, "hard", "missing-clone-world", "Clone run is missing world-after-clone-load.json.");
    if (fileExists(provenancePath)) {
      const provenance = readJson(provenancePath);
      if (!provenance.sourceCampaignId || !provenance.cloneCampaignId) {
        add(issues, "hard", "clone-lineage-incomplete", "Clone provenance lacks sourceCampaignId or cloneCampaignId.", provenance);
      } else if (provenance.sourceCampaignId === provenance.cloneCampaignId) {
        add(issues, "hard", "clone-lineage-self", "Clone campaign id equals source campaign id.", provenance);
      }
      if (input.state.campaignId && provenance.cloneCampaignId && input.state.campaignId !== provenance.cloneCampaignId) {
        add(issues, "hard", "clone-state-campaign-mismatch", "state.campaignId does not match clone provenance.", {
          stateCampaignId: input.state.campaignId,
          cloneCampaignId: provenance.cloneCampaignId,
        });
      }
      if (provenance.cloneCampaignPath) {
        const manifestPath = path.join(provenance.cloneCampaignPath, "clone-manifest.json");
        if (!fileExists(manifestPath)) {
          add(issues, "hard", "missing-campaign-clone-manifest", "Clone campaign path is missing clone-manifest.json.", {
            cloneCampaignPath: provenance.cloneCampaignPath,
          });
        }
      }
      if (fileExists(cloneWorldPath) && provenance.sourceCampaignId) {
        const cloneWorldText = fs.readFileSync(cloneWorldPath, "utf8");
        if (cloneWorldText.includes(provenance.sourceCampaignId)) {
          add(issues, "hard", "clone-world-source-id-residue", "Clone world projection contains source campaign id.", {
            sourceCampaignId: provenance.sourceCampaignId,
            cloneWorldPath,
          });
        }
      }
    }
    if (fileExists(cloneWorldPath)) {
      scanJsonStrings(
        readJson(cloneWorldPath),
        [...PUBLIC_PROJECTION_REF_PATTERNS, ...INTERNAL_TEXT_PATTERNS],
        {
          code: "clone-world-public-projection-leak",
          label: "Clone world projection",
        },
        issues,
      );
    }
    const cloneHistoryPath = path.join(input.root, "history-after-clone-load.json");
    if (fileExists(cloneHistoryPath)) {
      scanJsonStrings(
        readJson(cloneHistoryPath),
        [...PUBLIC_PROJECTION_REF_PATTERNS, ...INTERNAL_TEXT_PATTERNS],
        {
          code: "clone-history-public-projection-leak",
          label: "Clone history projection",
        },
        issues,
      );
    }
    return mode;
  }

  const generatedPath = path.join(input.root, "world-after-generation.json");
  const openingPath = path.join(input.root, "world-after-opening.json");
  if (!fileExists(generatedPath)) add(issues, "hard", "missing-world-generation", "Fresh run is missing world-after-generation.json.");
  if (!fileExists(openingPath)) add(issues, "hard", "missing-world-opening", "Fresh run is missing world-after-opening.json.");
  if (!input.state.worldGeneratedAt) add(issues, "hard", "missing-worldgen-marker", "Fresh run state.worldGeneratedAt is missing.");
  if (!input.state.playerSavedAt) add(issues, "hard", "missing-player-marker", "Fresh run state.playerSavedAt is missing.");
  if (!input.state.openingAt) add(issues, "hard", "missing-opening-marker", "Fresh run state.openingAt is missing.");
  if (input.strictNoSeeds && input.state.world && Object.hasOwn(input.state.world, "seeds")) {
    add(issues, "hard", "manual-seeds-present", "state.world contains explicit seeds; this is not strict generated-world evidence.");
  }
  const openingHistoryPath = path.join(input.root, "history-after-opening.json");
  if (fileExists(openingHistoryPath)) {
    scanJsonStrings(
      readJson(openingHistoryPath),
      [...PUBLIC_PROJECTION_REF_PATTERNS, ...INTERNAL_TEXT_PATTERNS],
      {
        code: "opening-history-public-projection-leak",
        label: "Opening history projection",
      },
      issues,
    );
  }
  return mode;
}

export function validateAdaptiveRun(options) {
  const root = path.resolve(options.root);
  const targetTurns = Number.parseInt(String(options.targetTurns ?? 60), 10);
  const strictNoSeeds = options.strictNoSeeds ?? true;
  const minModeDiversity = Number.parseInt(String(options.minModeDiversity ?? (targetTurns >= 60 ? 8 : 1)), 10);
  const issues = [];

  const statePath = path.join(root, "state.json");
  const transcriptPath = path.join(root, "transcript.md");
  const progressPath = path.join(root, "clean-adaptive-progress.jsonl");

  if (!fileExists(statePath)) add(issues, "hard", "missing-state", "state.json is missing.");
  if (!fileExists(transcriptPath)) add(issues, "hard", "missing-transcript", "transcript.md is missing.");
  if (!fileExists(statePath)) {
    return {
      ok: false,
      root,
      targetTurns,
      setupMode: "unknown",
      turnCount: 0,
      hardFailureCount: issues.filter((issue) => issue.severity === "hard").length,
      warningCount: issues.filter((issue) => issue.severity === "warning").length,
      issues,
    };
  }

  const state = readJson(statePath);
  if (!state.campaignId) add(issues, "hard", "missing-campaign", "state.campaignId is missing.");
  const setupMode = validateSetup({ root, state, strictNoSeeds }, issues);

  const turns = Array.isArray(state.turns) ? state.turns : [];
  if (turns.length < targetTurns) {
    add(issues, "hard", "insufficient-turns", `Run has ${turns.length} turns, expected at least ${targetTurns}.`);
  }

  const seenModes = new Set();
  const repeatedActionCounts = new Map();
  const visibleCounts = new Map();

  for (let index = 0; index < Math.min(turns.length, targetTurns); index += 1) {
    const turn = turns[index];
    const turnIndex = index + 1;
    if (!isRecord(turn)) {
      add(issues, "hard", "turn-shape", `Turn ${turnIndex} is not an object.`, turn);
      continue;
    }
    if (turn.index !== turnIndex) {
      add(issues, "hard", "non-monotonic-index", `Turn index mismatch at slot ${turnIndex}.`, { actual: turn.index });
    }
    if (turn.status !== "done") {
      add(issues, "hard", "turn-not-done", `Turn ${turnIndex} status is not done.`, { status: turn.status, error: turn.error });
    }
    if (!turn.done) {
      add(issues, "hard", "missing-done-boundary", `Turn ${turnIndex} has no done boundary.`);
    }
    if (Array.isArray(turn.eventTypes) && !turn.eventTypes.includes("done") && !turn.eventTypes.includes("complete")) {
      add(issues, "hard", "missing-done-event", `Turn ${turnIndex} eventTypes do not include done/complete.`, turn.eventTypes);
    }
    const visible = compactText(turn.visibleText);
    if (visible.length < 80) {
      add(issues, "hard", "weak-visible-text", `Turn ${turnIndex} visible narration is too short.`, { length: visible.length });
    }
    for (const leak of scanText(visible, [...RAW_REF_PATTERNS, ...INTERNAL_TEXT_PATTERNS])) {
      add(issues, "hard", "visible-internal-leak", `Turn ${turnIndex} visible text leaks ${leak.code}.`, leak);
    }
    const fingerprint = visibleFingerprint(visible);
    if (fingerprint.length > 0) {
      visibleCounts.set(fingerprint, (visibleCounts.get(fingerprint) ?? 0) + 1);
      if ((visibleCounts.get(fingerprint) ?? 0) >= 3) {
        add(issues, "hard", "repeated-visible-loop", `Visible narration fingerprint repeated at least three times by turn ${turnIndex}.`, { fingerprint });
      }
    }
    if (typeof turn.mode === "string" && turn.mode.trim()) seenModes.add(turn.mode);
    const actionKey = compactText(turn.action).toLowerCase();
    if (actionKey) {
      repeatedActionCounts.set(actionKey, (repeatedActionCounts.get(actionKey) ?? 0) + 1);
      if ((repeatedActionCounts.get(actionKey) ?? 0) >= 4) {
        add(issues, "hard", "repeated-action-loop", `Same player action repeated at least four times by turn ${turnIndex}.`, {
          action: compactText(turn.action).slice(0, 240),
        });
      }
    }
    validateQuickActions({ turnIndex, quickActions: turn.quickActions }, issues);
    validateTurnArtifact({ root, turnIndex }, issues);
    if (index > 0) {
      const previous = turns[index - 1];
      if (
        isRecord(previous)
        && isRecord(turn.before)
        && isRecord(previous.after)
        && turn.before.worldVersion != null
        && previous.after.worldVersion != null
        && turn.before.worldVersion !== previous.after.worldVersion
      ) {
        add(issues, "warning", "between-turn-world-version-drift", `Turn ${turnIndex} starts from a different worldVersion than previous after.`, {
          previousAfter: previous.after.worldVersion,
          currentBefore: turn.before.worldVersion,
        });
      }
    }
  }

  if (targetTurns >= 60 && seenModes.size < minModeDiversity) {
    add(issues, "hard", "low-action-mode-diversity", `Run has ${seenModes.size} adaptive modes, expected at least ${minModeDiversity}.`, {
      modes: Array.from(seenModes).sort(),
    });
  }

  const progress = loadProgress(progressPath);
  if (progress.length === 0) {
    add(issues, "hard", "missing-progress", "clean-adaptive-progress.jsonl is missing or empty.");
  }
  for (const entry of progress) {
    if (entry.parseError) add(issues, "hard", "progress-parse-error", "Progress JSONL contains an unreadable line.", entry.raw);
    if (entry.type === "stop") add(issues, "hard", "progress-stop", "Progress contains a stop entry.", entry);
    if (entry.type === "turn" && entry.status !== "done") {
      add(issues, "hard", "progress-non-done-turn", "Progress contains a non-done turn.", entry);
    }
  }
  const complete = progress.filter((entry) => entry.type === "complete").at(-1);
  if (!complete) {
    add(issues, "hard", "missing-progress-complete", "Progress never recorded a complete entry.");
  } else if (Number(complete.doneCount ?? 0) < targetTurns) {
    add(issues, "hard", "progress-complete-too-small", "Progress complete entry has too few turns.", complete);
  }

  const hardFailureCount = issues.filter((issue) => issue.severity === "hard").length;
  return {
    ok: hardFailureCount === 0,
    root,
    targetTurns,
    setupMode,
    campaignId: state.campaignId ?? null,
    sourceCampaignId: state.sourceCampaignId ?? null,
    turnCount: turns.length,
    modeCount: seenModes.size,
    modes: Array.from(seenModes).sort(),
    hardFailureCount,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    issues,
  };
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const root = argv[0] ?? env.PHASE95_ACTUAL_ROOT;
  if (!root) {
    console.error("Usage: node scripts/phase95-verify-adaptive-run.mjs <run-root> [targetTurns]");
    return 2;
  }
  const targetTurns = argv[1] ?? env.PHASE95_TARGET_TURNS ?? "60";
  const strictNoSeeds = !["0", "false", "no"].includes(String(env.PHASE95_STRICT_NO_SEEDS ?? "1").toLowerCase());
  const minModeDiversity = env.PHASE95_MIN_MODE_DIVERSITY;
  const result = validateAdaptiveRun({ root, targetTurns, strictNoSeeds, minModeDiversity });
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main();
}
