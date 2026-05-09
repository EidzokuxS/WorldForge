import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  WORLD_FORECAST_CONFIG_KEY,
  WORLD_FORECAST_MAX_ENTRIES,
  buildScopedForecastExcerpt,
  loadWorldTrajectoryForecast,
  scopedForecastExcerptSchema,
  stageWorldTrajectoryForecast,
  worldTrajectoryForecastSchema,
  writeStagedWorldTrajectoryForecast,
  writeWorldTrajectoryForecast,
  type WorldTrajectoryForecast,
} from "../world-forecast.js";

const previousCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
let tempRoot: string | null = null;

afterEach(() => {
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }

  if (previousCampaignRoot === undefined) {
    delete process.env.GSD_CAMPAIGNS_ROOT;
  } else {
    process.env.GSD_CAMPAIGNS_ROOT = previousCampaignRoot;
  }
});

function createForecast(
  overrides: Partial<WorldTrajectoryForecast> = {},
): WorldTrajectoryForecast {
  return worldTrajectoryForecastSchema.parse({
    version: "world-trajectory-forecast.v1",
    campaignId: "campaign-1",
    baseTick: 10,
    generatedAtTick: 10,
    expiresAtTick: 20,
    entries: [
      {
        id: "forecast-local-public",
        baseTick: 10,
        horizonTicks: 3,
        subjectRefs: [{ type: "location", id: "loc-shibuya", label: "Shibuya Kissaten" }],
        confidence: 0.72,
        privacy: "public",
        playerFacingEligibility: "local_public",
        locality: {
          locationRefs: ["loc-shibuya"],
          sceneRefs: ["scene-kissaten"],
          actorRefs: ["actor-player"],
        },
        advisoryText: "The kissaten crowd is close to choosing whether to trust the player.",
        preconditions: ["The player keeps the exchange in the kissaten."],
        advisorySignals: [{ label: "crowd tension", evidenceRef: "event-1" }],
        privateTerms: [],
      },
    ],
    diagnostics: { source: "manual", notes: ["test forecast"] },
    ...overrides,
  });
}

function createCampaignConfig(campaignId = "campaign-1"): string {
  tempRoot = mkdtempSync(join(tmpdir(), "world-forecast-"));
  process.env.GSD_CAMPAIGNS_ROOT = tempRoot;
  const campaignDir = join(tempRoot, campaignId);
  mkdirSync(campaignDir, { recursive: true });
  writeFileSync(
    join(campaignDir, "config.json"),
    JSON.stringify(
      {
        name: "Forecast Test",
        premise: "Unknown fields must survive forecast persistence.",
        createdAt: 123,
        updatedAt: 456,
        unknownTopLevel: {
          nested: true,
          value: "preserve me",
        },
        futureConfigArray: [{ ok: true }],
      },
      null,
      2,
    ),
    "utf-8",
  );
  return join(campaignDir, "config.json");
}

function readConfig(configPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
}

describe("world trajectory forecast schemas", () => {
  it("requires bounded advisory fields and rejects unknown forecast or entry fields", () => {
    const forecast = createForecast();

    expect(worldTrajectoryForecastSchema.parse(forecast).promptReady).toBe(false);
    expect(worldTrajectoryForecastSchema.safeParse({ ...forecast, extra: true }).success).toBe(false);
    expect(
      worldTrajectoryForecastSchema.safeParse({
        ...forecast,
        promptReady: true,
      }).success,
    ).toBe(false);
    expect(
      worldTrajectoryForecastSchema.safeParse({
        ...forecast,
        entries: [{ ...forecast.entries[0], metadata: { note: "not in contract" } }],
      }).success,
    ).toBe(false);
    expect(
      worldTrajectoryForecastSchema.safeParse({
        ...forecast,
        entries: Array.from({ length: WORLD_FORECAST_MAX_ENTRIES + 1 }, (_, index) => ({
          ...forecast.entries[0],
          id: `forecast-${index}`,
        })),
      }).success,
    ).toBe(false);
    expect(
      worldTrajectoryForecastSchema.safeParse({
        ...forecast,
        entries: [{ ...forecast.entries[0], advisoryText: "x".repeat(321) }],
      }).success,
    ).toBe(false);
  });

  it("requires base tick, horizon, subject refs, confidence, privacy, and eligibility", () => {
    const forecast = createForecast();
    const requiredEntryKeys = [
      "baseTick",
      "horizonTicks",
      "subjectRefs",
      "confidence",
      "privacy",
      "playerFacingEligibility",
    ] as const;

    for (const key of requiredEntryKeys) {
      const entry = { ...forecast.entries[0] } as Record<string, unknown>;
      delete entry[key];

      expect(
        worldTrajectoryForecastSchema.safeParse({
          ...forecast,
          entries: [entry],
        }).success,
      ).toBe(false);
    }
  });

  it("rejects direct and nested executable tool/action payload fields", () => {
    const forecast = createForecast();
    const invalidEntries = [
      { ...forecast.entries[0], hpDelta: -5 },
      { ...forecast.entries[0], metadata: { toolInput: { toolName: "move_to" } } },
      { ...forecast.entries[0], revealBudget: { durableEvent: { id: "event-1" } } },
      { ...forecast.entries[0], candidateRefs: { locationId: "loc-remote" } },
      {
        ...forecast.entries[0],
        subjectRefs: [{ ...forecast.entries[0].subjectRefs[0], toolInput: { x: true } }],
      },
      {
        ...forecast.entries[0],
        advisorySignals: [
          {
            label: "smuggled operation",
            toolName: "spawn_npc",
            input: { locationId: "loc-remote" },
          },
        ],
      },
    ];

    for (const entry of invalidEntries) {
      expect(
        worldTrajectoryForecastSchema.safeParse({
          ...forecast,
          entries: [entry],
        }).success,
      ).toBe(false);
    }
  });
});

describe("world trajectory forecast config persistence", () => {
  it("writes and loads forecast through a raw-preserving config adapter", () => {
    const configPath = createCampaignConfig();
    const forecast = createForecast();

    writeWorldTrajectoryForecast("campaign-1", forecast);

    const rawConfig = readConfig(configPath);
    expect(rawConfig.name).toBe("Forecast Test");
    expect(rawConfig.unknownTopLevel).toEqual({
      nested: true,
      value: "preserve me",
    });
    expect(rawConfig.futureConfigArray).toEqual([{ ok: true }]);
    expect(rawConfig[WORLD_FORECAST_CONFIG_KEY]).toEqual(forecast);
    expect(loadWorldTrajectoryForecast("campaign-1")).toEqual(forecast);
  });

  it("stages forecast revisions without writing until explicitly committed", () => {
    const configPath = createCampaignConfig();
    const beforeStage = readFileSync(configPath, "utf-8");
    const forecast = createForecast();
    const staged = stageWorldTrajectoryForecast(forecast, 999);

    expect(staged).toEqual({ status: "staged", stagedAt: 999, forecast });
    expect(readFileSync(configPath, "utf-8")).toBe(beforeStage);

    writeStagedWorldTrajectoryForecast("campaign-1", staged);

    const rawConfig = readConfig(configPath);
    expect(rawConfig[WORLD_FORECAST_CONFIG_KEY]).toEqual(forecast);
  });
});

describe("scoped forecast excerpt", () => {
  it("includes only local public pressure and returns private-source terms for prompt/output guards", () => {
    const forecast = createForecast({
      entries: [
        createForecast().entries[0],
        {
          id: "forecast-remote-private",
          baseTick: 10,
          horizonTicks: 5,
          subjectRefs: [
            { type: "location", id: "loc-forest-outpost", label: "Forest Outpost" },
            { type: "actor", id: "actor-hidden-watcher", label: "Hidden Watcher" },
          ],
          confidence: 0.81,
          privacy: "private",
          playerFacingEligibility: "never",
          locality: {
            locationRefs: ["loc-forest-outpost"],
            sceneRefs: ["scene-forest-watch"],
            actorRefs: ["actor-hidden-watcher"],
          },
          advisoryText: "The hidden watcher is preparing a remote ambush.",
          preconditions: ["The player remains away from the forest."],
          advisorySignals: [{ label: "remote ambush pressure" }],
          privateTerms: ["Forest Outpost", "Hidden Watcher", "remote ambush"],
        },
        {
          id: "forecast-remote-public",
          baseTick: 10,
          horizonTicks: 4,
          subjectRefs: [{ type: "location", id: "loc-distant-market", label: "Distant Market" }],
          confidence: 0.5,
          privacy: "public",
          playerFacingEligibility: "local_public",
          locality: {
            locationRefs: ["loc-distant-market"],
            sceneRefs: [],
            actorRefs: [],
          },
          advisoryText: "A distant public market argument continues offscreen.",
          preconditions: [],
          advisorySignals: [],
          privateTerms: ["Distant Market"],
        },
      ],
    });

    const excerpt = buildScopedForecastExcerpt({
      forecast,
      localRefs: ["loc-shibuya", "scene-kissaten", "actor-player"],
    });
    const serializedEntries = JSON.stringify(excerpt.entries);

    expect(scopedForecastExcerptSchema.parse(excerpt)).toEqual(excerpt);
    expect(excerpt.promptReady).toBe(true);
    expect(excerpt.entries).toHaveLength(1);
    expect(excerpt.entries[0].entryId).toBe("forecast-local-public");
    expect(serializedEntries).not.toContain("Forest Outpost");
    expect(serializedEntries).not.toContain("Hidden Watcher");
    expect(serializedEntries).not.toContain("remote ambush pressure");
    expect(serializedEntries).not.toContain("Distant Market");
    expect(excerpt.forbiddenPrivateTerms).toEqual(
      expect.arrayContaining(["Forest Outpost", "Hidden Watcher", "remote ambush"]),
    );
    expect(excerpt.forbiddenPrivateTerms).not.toContain("Distant Market");
  });

  it("does not mark already local visible refs as forbidden private forecast terms", () => {
    const forecast = createForecast({
      entries: [
        createForecast().entries[0],
        {
          id: "forecast-local-private",
          baseTick: 10,
          horizonTicks: 4,
          subjectRefs: [{ type: "location", id: "loc-shibuya", label: "Shibuya Kissaten" }],
          confidence: 0.6,
          privacy: "private",
          playerFacingEligibility: "never",
          locality: {
            locationRefs: ["loc-shibuya"],
            sceneRefs: ["scene-kissaten"],
            actorRefs: ["actor-player"],
          },
          advisoryText: "A private forecast about the current scene should not poison visible anchors.",
          preconditions: [],
          advisorySignals: [],
          privateTerms: ["Shibuya Kissaten", "Hidden Watcher"],
        },
      ],
    });

    const excerpt = buildScopedForecastExcerpt({
      forecast,
      localRefs: ["loc-shibuya", "scene-kissaten", "actor-player", "Shibuya Kissaten"],
    });

    expect(excerpt.forbiddenPrivateTerms).not.toContain("Shibuya Kissaten");
    expect(excerpt.forbiddenPrivateTerms).toContain("Hidden Watcher");
  });
});
