import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { jjkWithNarutoPowerSystemArtifact } from "../../worldgen/__tests__/fixtures/jjk-naruto-artifact.js";
import { readCampaignConfig } from "../../campaign/manager.js";
import {
  advanceCampaignKernelToWorldReady,
  buildRevampWorldDna,
  getRevampCampaignKernelPath,
  readCampaignKernel,
} from "../dna-adapter.js";
import type { WorldSeeds } from "@worldforge/shared";

const CAMPAIGN_ID = "campaign-a3";

const FULL_SEEDS: WorldSeeds = {
  geography: " Tokyo curse districts ",
  politicalStructure: "Jujutsu schools and hidden councils",
  centralConflict: "Curses spill into public life",
  culturalFlavor: [" Secret sorcery ", "", "Chakra discipline"],
  environment: "Urban occult wards",
  wildcard: "Chakra-style cursed techniques",
};

let originalCampaignRoot: string | undefined;
let campaignRoot: string;

function writeConfig(config: Record<string, unknown>): void {
  const campaignDir = path.join(campaignRoot, CAMPAIGN_ID);
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(
    path.join(campaignDir, "config.json"),
    JSON.stringify(
      {
        name: "A3 Campaign",
        premise: "Jujutsu Kaisen world with Naruto power system",
        createdAt: 1,
        updatedAt: 1,
        ...config,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

describe("revamp DNA adapter", () => {
  beforeEach(() => {
    originalCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-a3-"));
    process.env.GSD_CAMPAIGNS_ROOT = campaignRoot;
  });

  afterEach(() => {
    if (originalCampaignRoot === undefined) {
      delete process.env.GSD_CAMPAIGNS_ROOT;
    } else {
      process.env.GSD_CAMPAIGNS_ROOT = originalCampaignRoot;
    }
    fs.rmSync(campaignRoot, { recursive: true, force: true });
  });

  it("normalizes complete world seeds into revamp World DNA", () => {
    expect(buildRevampWorldDna(FULL_SEEDS)).toEqual({
      geography: "Tokyo curse districts",
      politicalStructure: "Jujutsu schools and hidden councils",
      centralConflict: "Curses spill into public life",
      culturalFlavor: "Secret sorcery; Chakra discipline",
      environment: "Urban occult wards",
      wildcard: "Chakra-style cursed techniques",
    });
  });

  it("fails closed when a required DNA field is missing", () => {
    expect(() =>
      buildRevampWorldDna({
        ...FULL_SEEDS,
        centralConflict: " ",
      }),
    ).toThrow("World DNA central conflict is required before A3 can run.");
  });

  it("advances a campaign kernel from draft to world_ready without touching old worldgen state", () => {
    writeConfig({
      seeds: FULL_SEEDS,
      worldgenResearchArtifact: jjkWithNarutoPowerSystemArtifact,
      worldgenSourceHint: "Jujutsu Kaisen / Naruto",
      worldgenResearchEnabled: true,
      generationComplete: false,
    });

    const kernel = advanceCampaignKernelToWorldReady(CAMPAIGN_ID);

    expect(kernel).toMatchObject({
      campaignId: CAMPAIGN_ID,
      phase: "world_ready",
      premise: "Jujutsu Kaisen world with Naruto power system",
      worldDna: {
        geography: "Tokyo curse districts",
        politicalStructure: "Jujutsu schools and hidden councils",
        centralConflict: "Curses spill into public life",
        culturalFlavor: "Secret sorcery; Chakra discipline",
        environment: "Urban occult wards",
        wildcard: "Chakra-style cursed techniques",
      },
      worldGraph: { nodes: [], edges: [] },
      turnIndex: 0,
    });
    expect(fs.existsSync(getRevampCampaignKernelPath(CAMPAIGN_ID))).toBe(true);
    expect(readCampaignKernel(CAMPAIGN_ID)).toEqual(kernel);

    const config = readCampaignConfig(CAMPAIGN_ID);
    expect(config.generationComplete).toBe(false);
    expect(config.worldgenResearchArtifact).toEqual(jjkWithNarutoPowerSystemArtifact);
  });

  it("uses the research artifact premise when config premise is empty", () => {
    writeConfig({
      premise: "",
      seeds: FULL_SEEDS,
      worldgenResearchArtifact: jjkWithNarutoPowerSystemArtifact,
    });

    const kernel = advanceCampaignKernelToWorldReady(CAMPAIGN_ID);

    expect(kernel.premise).toBe(jjkWithNarutoPowerSystemArtifact.rawPremise);
  });

  it("does not rerun A3 after the kernel has advanced past world_ready", () => {
    writeConfig({ seeds: FULL_SEEDS });
    const kernel = advanceCampaignKernelToWorldReady(CAMPAIGN_ID);
    fs.writeFileSync(
      getRevampCampaignKernelPath(CAMPAIGN_ID),
      JSON.stringify({ ...kernel, phase: "cast_ready" }, null, 2),
      "utf-8",
    );

    expect(() => advanceCampaignKernelToWorldReady(CAMPAIGN_ID)).toThrow(
      "Campaign kernel phase cast_ready cannot rerun A3.",
    );
  });
});
