import { describe, expect, it } from "vitest";
import {
  PHASE95_REQUIRED_STORE_KEYS,
  PHASE95_STORE_MANIFEST,
  type StoreManifestEntry,
} from "../../engine/gameplay-control-plane-contract.js";
import {
  assertCampaignStoreManifestOperationPlanClosed,
  planCampaignStoreManifestOperation,
} from "../store-manifest-executor.js";

function stepsByStore(mode: Parameters<typeof planCampaignStoreManifestOperation>[0]["mode"]) {
  const plan = planCampaignStoreManifestOperation({ mode });
  return new Map(plan.steps.map((step) => [step.store, step]));
}

describe("campaign store manifest executor", () => {
  it("plans every required store for each manifest-owned operation mode", () => {
    for (const mode of ["clean_start_clone", "turn_rollback_restore", "checkpoint_restore"] as const) {
      const plan = planCampaignStoreManifestOperation({ mode });

      expect(plan.steps.map((step) => step.store).sort())
        .toEqual([...PHASE95_REQUIRED_STORE_KEYS].sort());
      expect(plan.steps.every((step) => step.mode === mode)).toBe(true);
    }
  });

  it("keeps clean-start clone policies separate from restore policies", () => {
    const steps = stepsByStore("clean_start_clone");

    expect(steps.get("json:config")).toMatchObject({
      action: "rewrite",
      sourceCampaignIdPolicy: "rewrite",
    });
    expect(steps.get("json:chat_history")).toMatchObject({
      action: "purge",
      sourceCampaignIdPolicy: "purge",
    });
    expect(steps.get("sqlite:turn_sagas")).toMatchObject({
      action: "purge",
      sourceCampaignIdPolicy: "purge",
    });
    expect(steps.get("vectors:episodic_events")).toMatchObject({
      action: "rebuild",
      sourceCampaignIdPolicy: "reject_if_present",
    });
    expect(steps.get("vectors:lore_cards")).toMatchObject({
      action: "rebuild",
      sourceCampaignIdPolicy: "reject_if_present",
    });
    expect(steps.get("artifact:checkpoints")).toMatchObject({
      action: "reject",
      sourceCampaignIdPolicy: "reject_if_present",
    });
  });

  it("uses physical snapshot restore for bundled authoritative state instead of legacy coarse rollback labels", () => {
    const steps = stepsByStore("turn_rollback_restore");

    expect(PHASE95_STORE_MANIFEST.find((entry) => entry.store === "sqlite:campaigns"))
      .toMatchObject({
        rollbackPolicy: "rewrite",
        restorePolicies: { turnRollback: "snapshot_restore" },
      });
    expect(steps.get("sqlite:campaigns")).toMatchObject({ action: "snapshot_restore" });
    expect(steps.get("sqlite:quick_action_offers")).toMatchObject({ action: "snapshot_restore" });
    expect(steps.get("json:config")).toMatchObject({ action: "snapshot_restore" });
    expect(steps.get("json:chat_history")).toMatchObject({ action: "snapshot_restore" });
  });

  it("makes turn rollback vector and projection recovery explicit", () => {
    const steps = stepsByStore("turn_rollback_restore");

    expect(steps.get("vectors:episodic_events")).toMatchObject({
      action: "purge_rebuild",
      sourceCampaignIdPolicy: "reject_if_present",
    });
    expect(steps.get("vectors:lore_cards")).toMatchObject({
      action: "preserve_verified",
      sourceCampaignIdPolicy: "reject_if_present",
    });
    expect(steps.get("projection:public_dtos")).toMatchObject({ action: "purge_rebuild" });
    expect(steps.get("artifact:turn_boundaries")).toMatchObject({ action: "purge" });
    expect(steps.get("evidence:playtest_reports")).toMatchObject({ action: "reject" });
  });

  it("uses exact vector restore only for checkpoint restore plans", () => {
    const steps = stepsByStore("checkpoint_restore");

    expect(steps.get("vectors:episodic_events")).toMatchObject({
      action: "exact_restore",
      requiresHash: true,
      requiresRowCount: true,
    });
    expect(steps.get("vectors:lore_cards")).toMatchObject({
      action: "exact_restore",
      requiresHash: true,
      requiresRowCount: true,
    });
    expect(steps.get("projection:public_dtos")).toMatchObject({ action: "purge_rebuild" });
  });

  it("fails closed when a plan misses, duplicates, or invents stores", () => {
    const plan = planCampaignStoreManifestOperation({ mode: "clean_start_clone" });

    expect(() => assertCampaignStoreManifestOperationPlanClosed({
      ...plan,
      steps: plan.steps.filter((step) => step.store !== "json:chat_history"),
    })).toThrow(/json:chat_history/i);

    expect(() => assertCampaignStoreManifestOperationPlanClosed({
      ...plan,
      steps: [...plan.steps, plan.steps[0]!],
    })).toThrow(/duplicate/i);

    expect(() => assertCampaignStoreManifestOperationPlanClosed({
      ...plan,
      steps: [
        ...plan.steps,
        {
          ...plan.steps[0]!,
          store: "json:unexpected",
        },
      ],
    })).toThrow(/unexpected/i);
  });

  it("rejects manifest entries outside the Phase 95 store contract", () => {
    const rogueEntry: StoreManifestEntry = {
      ...PHASE95_STORE_MANIFEST[0]!,
      store: "json:unexpected",
    };

    expect(() => planCampaignStoreManifestOperation({
      mode: "checkpoint_restore",
      manifest: [...PHASE95_STORE_MANIFEST, rogueEntry],
    })).toThrow(/unexpected/i);
  });
});
