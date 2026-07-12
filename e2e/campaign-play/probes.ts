import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import {
  CAMPAIGN_PLAY_EVIDENCE_VERSION,
  CAMPAIGN_PLAY_REQUIRED_DIRECTORIES,
  CAMPAIGN_PLAY_REQUIRED_FILES,
  campaignPlayActorJobEvidenceSchema,
  campaignPlayBrowserActionEvidenceSchema,
  campaignPlayBudgetSchema,
  campaignPlayEligibilitySchema,
  campaignPlayInputEvidenceSchema,
  campaignPlayInventorySchema,
  campaignPlayManifestSchema,
  campaignPlayModelStageEvidenceSchema,
  campaignPlayNetworkEvidenceSchema,
  campaignPlayReceiptEvidenceSchema,
  campaignPlayRunConfigSchema,
  campaignPlayRuntimeEventEvidenceSchema,
  campaignPlayScorecardSchema,
  campaignPlayTurnEvidenceSchema,
  campaignPlayVisibilityEvidenceSchema,
  type CampaignPlayInventory,
  type CampaignPlayManifest,
  type CampaignPlayScorecard,
} from "./contracts.js";

export interface CampaignPlayBundleValidation {
  valid: boolean;
  promotionEligible: boolean;
  manifest: CampaignPlayManifest | null;
  scorecard: CampaignPlayScorecard | null;
  issues: string[];
}

export class CampaignPlayEvidenceError extends Error {
  constructor(readonly issues: string[]) {
    super(`Campaign Play evidence validation failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "CampaignPlayEvidenceError";
  }
}

const JSONL_SCHEMAS = {
  "turns.jsonl": campaignPlayTurnEvidenceSchema,
  "inputs.jsonl": campaignPlayInputEvidenceSchema,
  "browser-actions.jsonl": campaignPlayBrowserActionEvidenceSchema,
  "network-trace.jsonl": campaignPlayNetworkEvidenceSchema,
  "model-stages.jsonl": campaignPlayModelStageEvidenceSchema,
  "runtime-events.jsonl": campaignPlayRuntimeEventEvidenceSchema,
  "receipts.jsonl": campaignPlayReceiptEvidenceSchema,
  "actor-jobs.jsonl": campaignPlayActorJobEvidenceSchema,
  "visibility.jsonl": campaignPlayVisibilityEvidenceSchema,
} as const;

type JsonlFile = keyof typeof JSONL_SCHEMAS;

function sha256(bytes: Buffer | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function readJsonLines(filePath: string, schema: z.ZodType<unknown>): unknown[] {
  const text = fs.readFileSync(filePath, "utf8");
  if (text.length === 0) return [];
  const records: unknown[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (line.length === 0) continue;
    try {
      records.push(schema.parse(JSON.parse(line) as unknown));
    } catch (error) {
      throw new Error(`${path.basename(filePath)} line ${index + 1} is invalid.`, { cause: error });
    }
  }
  return records;
}

function collectBundleFiles(bundleRoot: string): string[] {
  const files: string[] = [];
  const visit = (relativeDirectory: string) => {
    const directory = path.join(bundleRoot, relativeDirectory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory.length === 0
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw new Error(`Evidence bundles cannot contain symbolic links: ${relativePath}.`);
      }
      if (entry.isDirectory()) visit(relativePath);
      else if (entry.isFile() && relativePath !== "inventory.json") files.push(relativePath);
    }
  };
  visit("");
  return files.sort((left, right) => left.localeCompare(right));
}

export function createCampaignPlayInventory(
  bundleRoot: string,
  runId: string,
): CampaignPlayInventory {
  return campaignPlayInventorySchema.parse({
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId,
    entries: collectBundleFiles(bundleRoot).map((relativePath) => {
      const bytes = fs.readFileSync(path.join(bundleRoot, ...relativePath.split("/")));
      return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
    }),
  });
}

function verifyInventory(
  bundleRoot: string,
  inventory: CampaignPlayInventory,
  issues: string[],
): void {
  const actual = createCampaignPlayInventory(bundleRoot, inventory.runId);
  if (JSON.stringify(actual.entries) !== JSON.stringify(inventory.entries)) {
    issues.push("inventory.json does not match the bundle files, byte counts, or SHA-256 hashes.");
  }
}

function hasDisplacedPath(requestPath: string): boolean {
  return requestPath === "/game"
    || requestPath.startsWith("/game?")
    || requestPath === "/api/chat"
    || requestPath.startsWith("/api/chat/")
    || requestPath === "/api/worldgen/save-character"
    || requestPath === "/api/worldgen/parse-character"
    || requestPath === "/api/worldgen/resolve-starting-location";
}

function exactActionNumbers(values: Array<number | null>, expected: number): boolean {
  const actual = values.filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  return actual.length === expected && actual.every((value, index) => value === index + 1);
}

function validateRuntimeChain(
  events: Array<z.infer<typeof campaignPlayRuntimeEventEvidenceSchema>>,
  issues: string[],
): void {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  for (const [index, event] of ordered.entries()) {
    if (event.sequence !== index + 1) {
      issues.push("runtime-events.jsonl has a missing or duplicate sequence.");
      break;
    }
    const previous = ordered[index - 1];
    if (previous && (
      event.priorRuntimeRevision !== previous.resultRuntimeRevision
      || event.priorRuntimeHash !== previous.resultRuntimeHash
    )) {
      issues.push("runtime-events.jsonl breaks the revision or hash chain.");
      break;
    }
  }
}

export function validateCampaignPlayBundle(bundleRoot: string): CampaignPlayBundleValidation {
  const issues: string[] = [];
  let manifest: CampaignPlayManifest | null = null;
  let scorecard: CampaignPlayScorecard | null = null;
  if (!fs.existsSync(bundleRoot) || !fs.statSync(bundleRoot).isDirectory()) {
    return { valid: false, promotionEligible: false, manifest, scorecard, issues: ["Bundle root is missing."] };
  }

  for (const requiredDirectory of CAMPAIGN_PLAY_REQUIRED_DIRECTORIES) {
    const directoryPath = path.join(bundleRoot, requiredDirectory);
    if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
      issues.push(`Required directory is missing: ${requiredDirectory}.`);
    }
  }
  for (const requiredFile of CAMPAIGN_PLAY_REQUIRED_FILES) {
    const filePath = path.join(bundleRoot, requiredFile);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      issues.push(`Required file is missing: ${requiredFile}.`);
    }
  }
  if (issues.length > 0) {
    return { valid: false, promotionEligible: false, manifest, scorecard, issues };
  }

  try {
    manifest = campaignPlayManifestSchema.parse(readJson(path.join(bundleRoot, "manifest.json")));
    campaignPlayEligibilitySchema.parse(readJson(path.join(bundleRoot, "eligibility.json")));
    const runConfig = campaignPlayRunConfigSchema.parse(
      readJson(path.join(bundleRoot, "build", "run-config.json")),
    );
    const budget = campaignPlayBudgetSchema.parse(readJson(path.join(bundleRoot, "budget.json")));
    scorecard = campaignPlayScorecardSchema.parse(readJson(path.join(bundleRoot, "scorecard.json")));
    const inventory = campaignPlayInventorySchema.parse(readJson(path.join(bundleRoot, "inventory.json")));
    const browserConsole = z.array(z.unknown()).parse(readJson(path.join(bundleRoot, "browser-console.json")));
    const networkErrors = z.array(z.unknown()).parse(readJson(path.join(bundleRoot, "network-errors.json")));
    if (manifest.status === "complete" && browserConsole.length > 0) {
      issues.push("A complete bundle contains browser console errors.");
    }
    if (manifest.status === "complete" && networkErrors.length > 0) {
      issues.push("A complete bundle contains network errors.");
    }
    if (inventory.runId !== manifest.runId || scorecard.runId !== manifest.runId) {
      issues.push("Manifest, scorecard, and inventory run IDs differ.");
    }
    if (scorecard.lane !== manifest.lane) issues.push("Manifest and scorecard lanes differ.");
    if (scorecard.completedPlayerActions !== manifest.completedPlayerActions) {
      issues.push("Manifest and scorecard action counts differ.");
    }
    verifyInventory(bundleRoot, inventory, issues);

    const ledgers = Object.fromEntries(
      Object.entries(JSONL_SCHEMAS).map(([fileName, schema]) => [
        fileName,
        readJsonLines(path.join(bundleRoot, fileName), schema),
      ]),
    ) as Record<JsonlFile, unknown[]>;
    const turns = ledgers["turns.jsonl"] as Array<z.infer<typeof campaignPlayTurnEvidenceSchema>>;
    const inputs = ledgers["inputs.jsonl"] as Array<z.infer<typeof campaignPlayInputEvidenceSchema>>;
    const browserActions = ledgers["browser-actions.jsonl"] as Array<z.infer<typeof campaignPlayBrowserActionEvidenceSchema>>;
    const network = ledgers["network-trace.jsonl"] as Array<z.infer<typeof campaignPlayNetworkEvidenceSchema>>;
    const modelStages = ledgers["model-stages.jsonl"] as Array<z.infer<typeof campaignPlayModelStageEvidenceSchema>>;
    const runtimeEvents = ledgers["runtime-events.jsonl"] as Array<z.infer<typeof campaignPlayRuntimeEventEvidenceSchema>>;

    if (runConfig.runId !== manifest.runId || runConfig.campaignId !== manifest.campaignId) {
      issues.push("Run config, manifest, and campaign ownership differ.");
    }
    const subscription = runConfig.execution.kind === "live"
      && runConfig.execution.billing.kind === "subscription";
    if (subscription) {
      if (budget.billingKind !== "subscription") {
        issues.push("Subscription execution requires a subscription budget.");
      } else {
        const billing = runConfig.execution.kind === "live"
          && runConfig.execution.billing.kind === "subscription"
          ? runConfig.execution.billing
          : null;
        if (
          !billing
          || budget.providerName !== billing.providerName
          || budget.planId !== billing.planId
          || budget.monthlyListPriceMicros !== billing.monthlyListPriceMicros
        ) {
          issues.push("Subscription budget does not match the frozen run config.");
        }
        const quotaBefore = readJson(path.join(bundleRoot, "probes", "subscription-quota-before.json"));
        const quotaAfter = readJson(path.join(bundleRoot, "probes", "subscription-quota-after.json"));
        if (
          JSON.stringify(quotaBefore) !== JSON.stringify(budget.quotaBefore)
          || JSON.stringify(quotaAfter) !== JSON.stringify(budget.quotaAfter)
        ) {
          issues.push("Subscription quota probes do not match budget evidence.");
        }
      }
      if (modelStages.some((stage) => stage.costMicros !== null)) {
        issues.push("Subscription model stages must not claim an attributable per-run cost.");
      }
    } else {
      if (budget.billingKind !== "metered") {
        issues.push("Metered or deterministic execution requires a metered budget.");
      }
      if (modelStages.some((stage) => stage.costMicros === null)) {
        issues.push("Metered model stages require attributable costs.");
      }
    }

    for (const [fileName, records] of Object.entries(ledgers)) {
      for (const record of records as Array<{ runId: string; campaignId: string }>) {
        if (record.runId !== manifest.runId || record.campaignId !== manifest.campaignId) {
          issues.push(`${fileName} contains a record owned by another run or campaign.`);
          break;
        }
      }
    }
    if (!exactActionNumbers(turns.map((turn) => turn.playerActionNumber), manifest.completedPlayerActions)) {
      issues.push("turns.jsonl does not contain one contiguous completed player-action sequence.");
    }
    if (!exactActionNumbers(inputs.map((input) => input.playerActionNumber), manifest.completedPlayerActions)) {
      issues.push("inputs.jsonl does not contain one input per completed player action.");
    }
    if (new Set(turns.map((turn) => turn.turnId)).size !== turns.length) {
      issues.push("turns.jsonl contains a duplicate turn ID.");
    }
    if (new Set(inputs.map((input) => input.idempotencyKey)).size !== inputs.length) {
      issues.push("inputs.jsonl contains a duplicate idempotency key.");
    }
    const liveLane = ["first-playable", "causal-20", "diagnostic-30", "pristine-60", "provenance-60", "soak-300", "longplay-600"].includes(manifest.lane);
    if (liveLane && !exactActionNumbers(
      browserActions.map((action) => action.playerActionNumber),
      manifest.completedPlayerActions,
    )) {
      issues.push("browser-actions.jsonl does not prove every live player action.");
    }
    if (network.some((request) => hasDisplacedPath(request.path))) {
      issues.push("network-trace.jsonl contains a displaced gameplay path.");
    }
    validateRuntimeChain(runtimeEvents, issues);
    if (manifest.status === "complete" && turns.some((turn) => turn.status !== "completed")) {
      issues.push("A complete bundle contains a nonterminal or failed turn.");
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Bundle content validation failed.");
  }

  return {
    valid: issues.length === 0,
    promotionEligible: issues.length === 0 && scorecard?.promotionEligible === true,
    manifest,
    scorecard,
    issues,
  };
}

export function assertCampaignPlayBundle(bundleRoot: string): CampaignPlayBundleValidation {
  const validation = validateCampaignPlayBundle(bundleRoot);
  if (!validation.valid) throw new CampaignPlayEvidenceError(validation.issues);
  return validation;
}
