import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  CampaignWorldDna,
  WorldgenResearchArtifactV2,
} from "@worldforge/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readCampaignConfigSnapshot,
  saveWorldSeeds,
} from "../campaign/index.js";
import {
  assertCampaignWorldSourceWritable,
  CampaignWorldSourceError,
  createCampaignWorldSourceService,
} from "./world-source.js";

const CAMPAIGN_ID = "campaign-source-test";
const DNA: CampaignWorldDna = {
  geography: "A ring of stormbound islands",
  politicalStructure: "Independent harbor councils",
  centralConflict: "The sea routes are failing",
  culturalFlavor: "Salt-worn ritual; Brass instruments, communal songs",
  environment: "Cold ocean winds and luminous reefs",
  wildcard: "Maps change after every eclipse",
};

const RESEARCH_ARTIFACT: WorldgenResearchArtifactV2 = {
  version: 2,
  rawPremise: "A stormbound archipelago faces a failing sea route.",
  rawKnownIP: null,
  researchBrief: {
    interpretationSummary: "A maritime society shaped by unreliable travel.",
    ambiguityNotes: [],
    sourceUsageRules: [
      {
        sourceLabel: "Maritime history",
        role: "world_basis",
        useFor: ["trade and travel"],
        avoidFor: [],
        rationale: "Grounds the island network.",
      },
    ],
    searchJobs: [
      {
        id: "job-1",
        sourceLabel: "Maritime history",
        query: "island trade networks",
        purpose: "Ground travel pressure",
        useFor: ["trade and travel"],
      },
    ],
  },
  searchResults: [
    {
      jobId: "job-1",
      title: "Island trade networks",
      description: "A source on seasonal maritime routes.",
      url: "https://example.test/island-trade",
    },
  ],
  generatedContext: {
    keyFacts: ["Seasonal routes concentrate power in safe harbors."],
    tonalNotes: ["Wind-beaten civic life"],
    citations: [
      {
        jobId: "job-1",
        url: "https://example.test/island-trade",
        note: "Seasonal route evidence",
      },
    ],
  },
  provenance: {
    createdAt: "2026-07-09T00:00:00.000Z",
    model: "research-model",
    searchProvider: "test-search",
  },
};

let tempRoot: string;
let previousCampaignsRoot: string | undefined;

function campaignDirectory(): string {
  return path.join(tempRoot, CAMPAIGN_ID);
}

function writeConfig(overrides: Record<string, unknown> = {}): void {
  fs.writeFileSync(
    path.join(campaignDirectory(), "config.json"),
    JSON.stringify(
      {
        name: "Source Test",
        premise: "A stormbound archipelago faces a failing sea route.",
        createdAt: 1_783_000_000_000,
        ...overrides,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-source-"));
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  process.env.GSD_CAMPAIGNS_ROOT = tempRoot;
  fs.mkdirSync(campaignDirectory(), { recursive: true });
  writeConfig();
});

afterEach(() => {
  if (previousCampaignsRoot === undefined) {
    delete process.env.GSD_CAMPAIGNS_ROOT;
  } else {
    process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("Campaign World source", () => {
  it("produces a stable premise-only source digest", () => {
    const service = createCampaignWorldSourceService();
    const first = service.load(CAMPAIGN_ID);
    const second = service.load(CAMPAIGN_ID);

    expect(first).toEqual(second);
    expect(first.dna).toBeNull();
    expect(first.researchSummary).toBeNull();
    expect(first.sourceReferences).toEqual([]);
    expect(first.sourceDigest).toHaveLength(64);
  });

  it("builds from one captured config revision when the file changes after the read", () => {
    writeConfig({
      premise: "Revision A keeps the archipelago supplied.",
      seeds: {
        geography: DNA.geography,
        politicalStructure: DNA.politicalStructure,
        centralConflict: DNA.centralConflict,
        culturalFlavor: ["Salt-worn ritual", "Brass instruments, communal songs"],
        environment: DNA.environment,
        wildcard: DNA.wildcard,
      },
    });
    const readConfigSnapshot = vi.fn((campaignId: string) => {
      const captured = readCampaignConfigSnapshot(campaignId);
      writeConfig({ premise: "Revision B replaces the world after capture." });
      return captured;
    });
    const service = createCampaignWorldSourceService({ readConfigSnapshot });

    const source = service.load(CAMPAIGN_ID);

    expect(readConfigSnapshot).toHaveBeenCalledOnce();
    expect(source.premise).toBe("Revision A keeps the archipelago supplied.");
    expect(source.dna).toEqual(DNA);
    expect(JSON.parse(
      fs.readFileSync(path.join(campaignDirectory(), "config.json"), "utf-8"),
    ).premise).toBe("Revision B replaces the world after capture.");
  });

  it("normalizes complete DNA and changes the digest when the source changes", () => {
    writeConfig({
      seeds: {
        geography: DNA.geography,
        politicalStructure: DNA.politicalStructure,
        centralConflict: DNA.centralConflict,
        culturalFlavor: ["Salt-worn ritual", "Brass instruments, communal songs"],
        environment: DNA.environment,
        wildcard: DNA.wildcard,
      },
    });
    const service = createCampaignWorldSourceService();
    const initial = service.load(CAMPAIGN_ID);

    writeConfig({
      seeds: {
        geography: `${DNA.geography} and one hidden atoll`,
        politicalStructure: DNA.politicalStructure,
        centralConflict: DNA.centralConflict,
        culturalFlavor: ["Salt-worn ritual", "Brass instruments, communal songs"],
        environment: DNA.environment,
        wildcard: DNA.wildcard,
      },
    });
    const changed = service.load(CAMPAIGN_ID);

    expect(initial.dna).toEqual(DNA);
    expect(changed.sourceDigest).not.toBe(initial.sourceDigest);
  });

  it("includes saved research and source references in a stable snapshot", () => {
    writeConfig({
      worldgenSourceHint: "Maritime history",
      worldgenResearchArtifact: RESEARCH_ARTIFACT,
      worldbookSelection: [
        {
          id: "worldbook-1",
          displayName: "Harbor Notes",
          normalizedSourceHash: "source-hash",
          entryCount: 12,
          createdAt: 100,
          updatedAt: 200,
        },
      ],
    });
    const service = createCampaignWorldSourceService();
    const source = service.load(CAMPAIGN_ID);

    expect(source.researchSummary).toContain(
      "A maritime society shaped by unreliable travel.",
    );
    expect(source.sourceReferences.map(({ label, sourceType }) => ({
      label,
      sourceType,
    }))).toEqual([
      {
        label: "Island trade networks",
        sourceType: "research_result",
      },
      {
        label: "Maritime history",
        sourceType: "source_hint",
      },
      {
        label: "Harbor Notes",
        sourceType: "worldbook",
      },
    ]);
    const researchReferenceId = source.sourceReferences[0]?.id ?? "";
    const researchIdentity = researchReferenceId.slice("research:1@".length);
    expect(researchReferenceId.startsWith("research:1@")).toBe(true);
    expect(researchIdentity).toHaveLength(64);
    expect(
      [...researchIdentity].every((character) =>
        "0123456789abcdef".includes(character),
      ),
    ).toBe(true);
    expect(source.sourceReferences[1]?.id).toBe("known-ip");
    expect(source.sourceReferences[2]?.id).toBe(
      "worldbook:worldbook-1@source-hash",
    );
    expect(service.load(CAMPAIGN_ID).sourceDigest).toBe(source.sourceDigest);
  });

  it("uses selected-worldbook research context when the premise is empty", () => {
    writeConfig({
      premise: "",
      ipContext: {
        franchise: "Harbor Notes",
        keyFacts: ["Safe harbors control seasonal trade."],
        tonalNotes: ["Cold maritime civic life"],
        canonicalNames: {
          locations: ["North Harbor"],
          factions: ["Lantern Council"],
          characters: ["Mara Venn"],
        },
        source: "mcp",
        sourceGroups: [
          {
            sourceName: "Harbor Notes",
            priority: "primary",
            keyFacts: ["Safe harbors control seasonal trade."],
          },
        ],
      },
      worldbookSelection: [
        {
          id: "worldbook-1",
          displayName: "Harbor Notes",
          normalizedSourceHash: "source-hash",
          entryCount: 12,
          createdAt: 100,
          updatedAt: 200,
        },
      ],
    });
    const source = createCampaignWorldSourceService().load(CAMPAIGN_ID);

    expect(source.researchSummary).toContain('"collectives":["Lantern Council"]');
    expect(source.researchSummary).not.toContain('"factions"');
    expect(source.sourceReferences).toContainEqual({
      id: "research-context:1",
      label: "Harbor Notes",
      sourceType: "research_context",
    });
  });

  it("changes the source digest when a selected source hash changes", () => {
    const selection = {
      id: "worldbook-1",
      displayName: "Harbor Notes",
      normalizedSourceHash: "source-hash-a",
      entryCount: 12,
      createdAt: 100,
      updatedAt: 200,
    };
    writeConfig({ worldbookSelection: [selection] });
    const service = createCampaignWorldSourceService();
    const first = service.load(CAMPAIGN_ID);

    writeConfig({
      worldbookSelection: [
        { ...selection, normalizedSourceHash: "source-hash-b" },
      ],
    });
    expect(service.load(CAMPAIGN_ID).sourceDigest).not.toBe(first.sourceDigest);
  });

  it("changes the source digest when a research result URL changes", () => {
    writeConfig({ worldgenResearchArtifact: RESEARCH_ARTIFACT });
    const service = createCampaignWorldSourceService();
    const first = service.load(CAMPAIGN_ID);

    writeConfig({
      worldgenResearchArtifact: {
        ...RESEARCH_ARTIFACT,
        searchResults: [
          {
            ...RESEARCH_ARTIFACT.searchResults[0],
            url: "https://example.test/revised-island-trade",
          },
        ],
      },
    });
    expect(service.load(CAMPAIGN_ID).sourceDigest).not.toBe(first.sourceDigest);
  });

  it("saves DNA once, preserves commas, and leaves kernel.json byte-identical", async () => {
    const kernelPath = path.join(campaignDirectory(), "kernel.json");
    const kernelBytes = Buffer.from('{"phase":"draft","worldGraph":{"nodes":[]}}\n');
    fs.writeFileSync(kernelPath, kernelBytes);
    const saveSeeds = vi.fn((campaignId: string, seeds: Parameters<typeof saveWorldSeeds>[1]) =>
      saveWorldSeeds(campaignId, seeds),
    );
    const assertWritable = vi.fn();
    const service = createCampaignWorldSourceService({ saveSeeds });

    const source = await service.saveDna({
      campaignId: CAMPAIGN_ID,
      dna: DNA,
      assertWritable,
    });

    expect(assertWritable).toHaveBeenCalledOnce();
    expect(saveSeeds).toHaveBeenCalledOnce();
    expect(source.dna).toEqual(DNA);
    expect(JSON.parse(fs.readFileSync(path.join(campaignDirectory(), "config.json"), "utf-8")).seeds.culturalFlavor).toEqual([
      "Salt-worn ritual",
      "Brass instruments, communal songs",
    ]);
    expect(fs.readFileSync(kernelPath)).toEqual(kernelBytes);
  });

  it.each([
    {
      label: "partial stored DNA",
      seeds: { geography: DNA.geography },
    },
    {
      label: "empty cultural flavor entry",
      seeds: {
        geography: DNA.geography,
        politicalStructure: DNA.politicalStructure,
        centralConflict: DNA.centralConflict,
        culturalFlavor: ["Salt-worn ritual", ""],
        environment: DNA.environment,
        wildcard: DNA.wildcard,
      },
    },
    {
      label: "reserved delimiter inside stored entry",
      seeds: {
        geography: DNA.geography,
        politicalStructure: DNA.politicalStructure,
        centralConflict: DNA.centralConflict,
        culturalFlavor: ["Salt-worn; ritual"],
        environment: DNA.environment,
        wildcard: DNA.wildcard,
      },
    },
  ])("rejects $label", ({ seeds }) => {
    writeConfig({ seeds });
    const service = createCampaignWorldSourceService();

    expect(() => service.load(CAMPAIGN_ID)).toThrow(CampaignWorldSourceError);
  });

  it("rejects an empty cultural flavor segment during DNA save", async () => {
    const service = createCampaignWorldSourceService();

    await expect(
      service.saveDna({
        campaignId: CAMPAIGN_ID,
        dna: { ...DNA, culturalFlavor: "Salt-worn ritual; ; communal songs" },
        assertWritable: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "campaign_dna_invalid" });
  });

  it("rejects invalid campaign source JSON", () => {
    fs.writeFileSync(path.join(campaignDirectory(), "config.json"), "{", "utf-8");
    const service = createCampaignWorldSourceService();

    expect(() => service.load(CAMPAIGN_ID)).toThrow(CampaignWorldSourceError);
  });

  it("rejects a source hint without premise or research context", () => {
    writeConfig({ premise: "", worldgenSourceHint: "Maritime history" });
    const service = createCampaignWorldSourceService();

    expect(() => service.load(CAMPAIGN_ID)).toThrow(CampaignWorldSourceError);
  });

  it("rejects a present research artifact that normalizes to absence", () => {
    writeConfig({ worldgenResearchArtifact: null });
    const service = createCampaignWorldSourceService();

    expect(() => service.load(CAMPAIGN_ID)).toThrow(CampaignWorldSourceError);
  });

  it("rejects fractional worldbook timestamps", () => {
    writeConfig({
      worldbookSelection: [
        {
          id: "worldbook-1",
          displayName: "Harbor Notes",
          normalizedSourceHash: "source-hash",
          entryCount: 12,
          createdAt: 100.5,
          updatedAt: 200,
        },
      ],
    });
    const service = createCampaignWorldSourceService();

    expect(() => service.load(CAMPAIGN_ID)).toThrow(CampaignWorldSourceError);
  });

  it("permits DNA changes only before a world exists or after a failed build", () => {
    expect(() => assertCampaignWorldSourceWritable("unbuilt")).not.toThrow();
    expect(() => assertCampaignWorldSourceWritable("failed")).not.toThrow();
    expect(() => assertCampaignWorldSourceWritable("building")).toThrow(
      expect.objectContaining({ code: "world_build_running" }),
    );
    expect(() => assertCampaignWorldSourceWritable("review")).toThrow(
      expect.objectContaining({ code: "campaign_world_exists" }),
    );
    expect(() => assertCampaignWorldSourceWritable("accepted")).toThrow(
      expect.objectContaining({ code: "campaign_world_exists" }),
    );
  });

  it("does not save when the state guard rejects the write", async () => {
    const saveSeeds = vi.fn();
    const service = createCampaignWorldSourceService({ saveSeeds });

    await expect(
      service.saveDna({
        campaignId: CAMPAIGN_ID,
        dna: DNA,
        assertWritable: () => assertCampaignWorldSourceWritable("building"),
      }),
    ).rejects.toMatchObject({ code: "world_build_running" });
    expect(saveSeeds).not.toHaveBeenCalled();
  });
});
