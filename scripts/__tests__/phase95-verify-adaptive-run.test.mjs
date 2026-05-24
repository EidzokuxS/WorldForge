import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validateAdaptiveRun } from "../phase95-verify-adaptive-run.mjs";

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wf-phase95-verify-"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function turn(index, overrides = {}) {
  return {
    index,
    status: "done",
    mode: `mode-${index}`,
    action: `I take grounded action ${index}.`,
    visibleText:
      `Visible grounded outcome ${index} has enough concrete public detail to prove the turn produced a playable scene beat without leaking internals.`,
    done: { tick: index, type: "done" },
    eventTypes: ["progress", "narrative", "done"],
    before: { worldVersion: index - 1 },
    after: { worldVersion: index },
    quickActions: [
      {
        label: `Ask follow-up ${index}`,
        action: `Ask a grounded follow-up for turn ${index}.`,
        offerId: `offer-${index}`,
        actionId: `action-${index}`,
      },
    ],
    ...overrides,
  };
}

function writeTurnArtifacts(root, turns) {
  for (const current of turns) {
    writeJson(path.join(root, `turn-${String(current.index).padStart(2, "0")}.json`), {
      turn: current,
      world: { campaign: { id: "campaign-fresh" } },
      history: { messages: [] },
    });
  }
}

function writeProgress(root, count) {
  const lines = [];
  for (let index = 1; index <= count; index += 1) {
    lines.push(JSON.stringify({ type: "turn", index, status: "done" }));
  }
  lines.push(JSON.stringify({ type: "complete", doneCount: count }));
  fs.writeFileSync(path.join(root, "clean-adaptive-progress.jsonl"), `${lines.join("\n")}\n`, "utf8");
}

function writeFreshRun(root, turns) {
  writeJson(path.join(root, "state.json"), {
    setupMode: "worldgen",
    campaignId: "campaign-fresh",
    worldGeneratedAt: "2026-05-24T00:00:00.000Z",
    playerSavedAt: "2026-05-24T00:00:01.000Z",
    openingAt: "2026-05-24T00:00:02.000Z",
    turns,
  });
  fs.writeFileSync(path.join(root, "transcript.md"), "# transcript\n", "utf8");
  writeJson(path.join(root, "world-after-generation.json"), {
    locations: [{ id: "loc-a" }],
    factions: [{ id: "faction-a" }],
    npcs: [{ id: "npc-a" }],
    items: [{ id: "item-a" }],
  });
  writeJson(path.join(root, "world-after-opening.json"), { ok: true });
  writeTurnArtifacts(root, turns);
  writeProgress(root, turns.length);
}

function writeCloneRun(root, turns, cloneWorld = { campaign: { id: "clone-campaign" } }) {
  const cloneCampaignPath = path.join(root, "clone-campaign-dir");
  fs.mkdirSync(cloneCampaignPath, { recursive: true });
  writeJson(path.join(cloneCampaignPath, "clone-manifest.json"), {
    sourceCampaignId: "source-campaign",
    targetCampaignId: "clone-campaign",
  });
  writeJson(path.join(root, "state.json"), {
    setupMode: "clone",
    campaignId: "clone-campaign",
    sourceCampaignId: "source-campaign",
    turns,
  });
  fs.writeFileSync(path.join(root, "transcript.md"), "# transcript\n", "utf8");
  writeJson(path.join(root, "clone-provenance.json"), {
    sourceCampaignId: "source-campaign",
    cloneCampaignId: "clone-campaign",
    cloneCampaignPath,
  });
  writeJson(path.join(root, "baseline-pool.json"), { routeClones: [] });
  writeJson(path.join(root, "world-after-clone-load.json"), cloneWorld);
  writeTurnArtifacts(root, turns);
  writeProgress(root, turns.length);
}

describe("phase95 adaptive run verifier", () => {
  it("accepts a minimal fresh pilot with grounded turns and progress evidence", () => {
    const root = makeRoot();
    const turns = [turn(1), turn(2)];
    writeFreshRun(root, turns);

    const result = validateAdaptiveRun({ root, targetTurns: 2 });

    expect(result.ok).toBe(true);
    expect(result.hardFailureCount).toBe(0);
    expect(result.setupMode).toBe("worldgen");
  });

  it("rejects player-visible raw refs and quick actions without authority handles", () => {
    const root = makeRoot();
    const turns = [
      turn(1, {
        visibleText:
          "The clerk says npc-hidden-7 should never be displayed but this sentence is deliberately long enough to pass the length floor.",
        quickActions: [{ label: "Use loc-secret", action: "Use raw id loc-secret" }],
      }),
    ];
    writeFreshRun(root, turns);

    const result = validateAdaptiveRun({ root, targetTurns: 1 });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "visible-internal-leak",
        "quick-action-missing-capability",
        "quick-action-visible-leak",
      ]),
    );
  });

  it("rejects clone runs whose public world projection still contains the source campaign id", () => {
    const root = makeRoot();
    writeCloneRun(root, [turn(1)], {
      campaign: { id: "clone-campaign" },
      leakedSourceCampaignId: "source-campaign",
    });

    const result = validateAdaptiveRun({ root, targetTurns: 1 });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("clone-world-source-id-residue");
  });

  it("rejects clone runs without a campaign-local clone manifest", () => {
    const root = makeRoot();
    writeCloneRun(root, [turn(1)]);
    fs.rmSync(path.join(root, "clone-campaign-dir", "clone-manifest.json"));

    const result = validateAdaptiveRun({ root, targetTurns: 1 });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("missing-campaign-clone-manifest");
  });

  it("rejects raw ids inside public world and history projections", () => {
    const root = makeRoot();
    const turns = [turn(1)];
    writeFreshRun(root, turns);
    writeJson(path.join(root, "turn-01.json"), {
      turn: turns[0],
      world: {
        scene: {
          handle: "pdto_location_visible",
          unsafeRawLocation: "loc-secret-room",
        },
      },
      history: {
        messages: [
          {
            role: "assistant",
            content: "Public text should not replay NarratorPacket internals.",
          },
        ],
      },
    });

    const result = validateAdaptiveRun({ root, targetTurns: 1 });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "turn-world-public-projection-leak",
        "turn-history-public-projection-leak",
      ]),
    );
  });

  it("requires mode diversity for 60-turn acceptance evidence", () => {
    const root = makeRoot();
    const turns = Array.from({ length: 60 }, (_, index) => turn(index + 1, { mode: "repeat-mode" }));
    writeFreshRun(root, turns);

    const result = validateAdaptiveRun({ root, targetTurns: 60, minModeDiversity: 8 });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("low-action-mode-diversity");
  });
});
