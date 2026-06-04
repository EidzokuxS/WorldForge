import {
  PHASE95_STORE_MANIFEST,
  assertStoreManifestCoverage,
  type SourceCampaignIdPolicy,
  type StoreCheckpointRestorePolicy,
  type StoreManifestEntry,
  type StorePolicy,
  type StoreTurnRollbackPolicy,
} from "../engine/gameplay-control-plane-contract.js";

export const STORE_MANIFEST_OPERATION_MODE_VALUES = [
  "clean_start_clone",
  "replay_preserving_clone",
  "turn_rollback_restore",
  "checkpoint_restore",
] as const;

export type StoreManifestOperationMode = (typeof STORE_MANIFEST_OPERATION_MODE_VALUES)[number];

export type StoreManifestOperationAction =
  | StorePolicy
  | StoreManifestEntry["replayPolicy"]
  | StoreTurnRollbackPolicy
  | StoreCheckpointRestorePolicy;

export interface CampaignStoreManifestOperationStep {
  mode: StoreManifestOperationMode;
  store: string;
  authorityLevel: StoreManifestEntry["authorityLevel"];
  action: StoreManifestOperationAction;
  sourceCampaignIdPolicy: SourceCampaignIdPolicy;
  replayPolicy: StoreManifestEntry["replayPolicy"];
  requiresHash: boolean;
  requiresRowCount: boolean;
}

export interface CampaignStoreManifestOperationPlan {
  mode: StoreManifestOperationMode;
  steps: CampaignStoreManifestOperationStep[];
}

function actionForMode(
  entry: StoreManifestEntry,
  mode: StoreManifestOperationMode,
): StoreManifestOperationAction {
  switch (mode) {
    case "clean_start_clone":
      return entry.clonePolicy;
    case "replay_preserving_clone":
      return entry.replayPolicy;
    case "turn_rollback_restore":
      return entry.restorePolicies.turnRollback;
    case "checkpoint_restore":
      return entry.restorePolicies.checkpointRestore;
  }
}

function assertKnownOperationMode(mode: StoreManifestOperationMode): void {
  if (!(STORE_MANIFEST_OPERATION_MODE_VALUES as readonly string[]).includes(mode)) {
    throw new Error(`Unknown store manifest operation mode: ${mode}.`);
  }
}

export function assertCampaignStoreManifestOperationPlanClosed(
  plan: CampaignStoreManifestOperationPlan,
  manifest: readonly StoreManifestEntry[] = PHASE95_STORE_MANIFEST,
): CampaignStoreManifestOperationPlan {
  assertKnownOperationMode(plan.mode);
  const manifestEntries = assertStoreManifestCoverage(manifest);
  const manifestStores = new Set(manifestEntries.map((entry) => entry.store));
  const plannedStores = new Set<string>();
  const replayUnsupportedStores: string[] = [];

  for (const step of plan.steps) {
    if (step.mode !== plan.mode) {
      throw new Error(`Store manifest operation step has wrong mode for ${step.store}.`);
    }
    if (!manifestStores.has(step.store)) {
      throw new Error(`Store manifest operation includes unexpected store: ${step.store}.`);
    }
    if (plannedStores.has(step.store)) {
      throw new Error(`Store manifest operation includes duplicate store: ${step.store}.`);
    }
    plannedStores.add(step.store);
    if (!step.action) {
      throw new Error(`Store manifest operation has no action for store: ${step.store}.`);
    }
    if (plan.mode === "clean_start_clone" && step.action === "preserve") {
      throw new Error(`Clean-start clone cannot preserve source-owned store: ${step.store}.`);
    }
    if (plan.mode === "replay_preserving_clone"
      && (step.action === "reject" || step.action === "regenerate")) {
      replayUnsupportedStores.push(`${step.store}:${step.action}`);
    }
    if (step.action === "exact_restore" && !step.requiresHash) {
      throw new Error(`Exact restore requires hash evidence for store: ${step.store}.`);
    }
  }

  for (const entry of manifestEntries) {
    if (!plannedStores.has(entry.store)) {
      throw new Error(`Store manifest operation is missing store: ${entry.store}.`);
    }
  }

  if (replayUnsupportedStores.length > 0) {
    throw new Error(
      `Replay-preserving clone is not supported by the current store manifest: ${replayUnsupportedStores.join(", ")}.`,
    );
  }

  return plan;
}

export function planCampaignStoreManifestOperation(input: {
  mode: StoreManifestOperationMode;
  manifest?: readonly StoreManifestEntry[];
}): CampaignStoreManifestOperationPlan {
  const manifest = assertStoreManifestCoverage(input.manifest ?? PHASE95_STORE_MANIFEST);
  const plan: CampaignStoreManifestOperationPlan = {
    mode: input.mode,
    steps: manifest.map((entry) => ({
      mode: input.mode,
      store: entry.store,
      authorityLevel: entry.authorityLevel,
      action: actionForMode(entry, input.mode),
      sourceCampaignIdPolicy: entry.sourceCampaignIdPolicy,
      replayPolicy: entry.replayPolicy,
      requiresHash: entry.requiresHash,
      requiresRowCount: entry.requiresRowCount,
    })),
  };
  return assertCampaignStoreManifestOperationPlanClosed(plan, manifest);
}
