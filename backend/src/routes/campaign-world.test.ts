import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LanguageModel } from "ai";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStructuredOutputModelMetadata,
  rememberStructuredOutputModelMetadata,
} from "../ai/structured-output-capabilities.js";
import {
  safeGenerateObject,
  type SafeGenerateTrace,
} from "../ai/generate-object-safe.js";
import { closeDb } from "../db/index.js";
import {
  createCampaignWorldBuilder,
  createCampaignWorldBuildService,
  createCampaignWorldSourceService,
  openCampaignWorldDatabase,
} from "../campaign-world/index.js";
import type {
  WorldCastPacket,
  WorldConnectionsPacket,
  WorldFramePacket,
} from "../campaign-world/contracts.js";
import { createCampaignWorldRoutes } from "./campaign-world.js";

const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";

function framePacket(): WorldFramePacket {
  return {
    worldSummary: "Three stormbound harbors depend on routes that fail after each eclipse.",
    locations: [
      {
        locationRef: "location:north-harbor",
        name: "North Harbor",
        description: "A fortified harbor governed by signal keepers.",
        kind: "macro",
        parentLocationRef: null,
        tags: ["fortified"],
        isStarting: true,
      },
      {
        locationRef: "location:glass-reef",
        name: "Glass Reef",
        description: "A trading harbor built around luminous shoals.",
        kind: "macro",
        parentLocationRef: null,
        tags: ["trade"],
        isStarting: false,
      },
      {
        locationRef: "location:bell-island",
        name: "Bell Island",
        description: "An island settlement that measures storms through bronze bells.",
        kind: "macro",
        parentLocationRef: null,
        tags: ["weather"],
        isStarting: false,
      },
      {
        locationRef: "location:north-dock",
        name: "North Dock",
        description: "A public counter for passage records beneath the harbor signal lines.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:north-harbor",
        tags: ["fortified", "records"],
        isStarting: false,
      },
      {
        locationRef: "location:signal-tower",
        name: "Signal Tower",
        description: "A wind-scoured tower where harbor flags mark the next crossing.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:north-harbor",
        tags: ["fortified", "signals"],
        isStarting: false,
      },
      {
        locationRef: "location:reef-market",
        name: "Reef Market",
        description: "A covered exchange behind the luminous reef quay.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:glass-reef",
        tags: ["trade"],
        isStarting: false,
      },
      {
        locationRef: "location:tide-gate",
        name: "Tide Gate",
        description: "A narrow gate where tide charts and cargo seals are checked.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:glass-reef",
        tags: ["trade", "routes"],
        isStarting: false,
      },
      {
        locationRef: "location:bell-foundry",
        name: "Bell Foundry",
        description: "A hot foundry that casts the bronze bells used to read the weather.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:bell-island",
        tags: ["weather", "bells"],
        isStarting: false,
      },
      {
        locationRef: "location:storm-shrine",
        name: "Storm Shrine",
        description: "A salt-dark shrine where sailors leave tokens before a crossing.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:bell-island",
        tags: ["weather", "ritual"],
        isStarting: false,
      },
    ],
    routes: [
      {
        fromLocationRef: "location:north-dock",
        toLocationRef: "location:signal-tower",
        travelCost: 2,
      },
      {
        fromLocationRef: "location:signal-tower",
        toLocationRef: "location:reef-market",
        travelCost: 3,
      },
      {
        fromLocationRef: "location:reef-market",
        toLocationRef: "location:tide-gate",
        travelCost: 4,
      },
      {
        fromLocationRef: "location:tide-gate",
        toLocationRef: "location:bell-foundry",
        travelCost: 5,
      },
      {
        fromLocationRef: "location:bell-foundry",
        toLocationRef: "location:storm-shrine",
        travelCost: 6,
      },
      {
        fromLocationRef: "location:storm-shrine",
        toLocationRef: "location:north-dock",
        travelCost: 7,
      },
    ],
  };
}

function castPacket(): WorldCastPacket {
  return {
    actors: [
      {
        actorRef: "actor:mara-venn",
        kind: "person",
        controller: "agent",
        role: "key",
        name: "Mara Venn",
        summary: "A signal keeper tracking the broken route pattern.",
        traits: ["methodical"],
        tags: ["navigator"],
      },
      {
        actorRef: "actor:oren-tide",
        kind: "person",
        controller: "agent",
        role: "support",
        name: "Oren Tide",
        summary: "A courier who knows the reef passages.",
        traits: ["observant"],
        tags: ["courier"],
      },
      {
        actorRef: "actor:sel-bell",
        kind: "person",
        controller: "agent",
        role: "support",
        name: "Sel Bell",
        summary: "A bell tender who records impossible storms.",
        traits: ["patient"],
        tags: ["weather"],
      },
      {
        actorRef: "actor:lantern-council",
        kind: "person",
        controller: "agent",
        role: "background",
        name: "Ilya Venn",
        summary: "A harbor clerk who tracks denied passage windows.",
        traits: ["precise"],
        tags: ["clerk"],
      },
      { actorRef: "actor:niko-salt", kind: "person", controller: "agent", role: "background", name: "Niko Salt", summary: "A dock medic who hears crews' private fears.", traits: ["steady"], tags: ["medic"] },
      { actorRef: "actor:rhea-quill", kind: "person", controller: "agent", role: "key", name: "Rhea Quill", summary: "A route assessor who suspects the storms are directed.", traits: ["skeptical"], tags: ["assessor"] },
    ],
    goals: [
      {
        actorRef: "actor:mara-venn",
        objective: "Map the next route change.",
        motivation: "Keep North Harbor supplied.",
        horizon: "immediate",
        priority: 5,
        status: "active",
      },
      {
        actorRef: "actor:oren-tide",
        objective: "Deliver a sealed route ledger.",
        motivation: "Clear an old family debt.",
        horizon: "immediate",
        priority: 4,
        status: "active",
      },
      {
        actorRef: "actor:sel-bell",
        objective: "Explain the false storm signal.",
        motivation: "Protect Bell Island from panic.",
        horizon: "ongoing",
        priority: 3,
        status: "active",
      },
      {
        actorRef: "actor:lantern-council",
        objective: "Recover the missing passage register.",
        motivation: "Prove the harbor records were altered.",
        horizon: "ongoing",
        priority: 4,
        status: "active",
      },
      { actorRef: "actor:niko-salt", objective: "Keep exhausted crews working.", motivation: "Prevent another dockside death.", horizon: "immediate", priority: 3, status: "active" },
      { actorRef: "actor:rhea-quill", objective: "Identify who redirects storm signals.", motivation: "Restore safe crossings before eclipse.", horizon: "ongoing", priority: 5, status: "active" },
    ],
    placements: [
      {
        actorRef: "actor:mara-venn",
        locationRef: "location:north-dock",
        placementKind: "present",
      },
      {
        actorRef: "actor:oren-tide",
        locationRef: "location:signal-tower",
        placementKind: "present",
      },
      {
        actorRef: "actor:sel-bell",
        locationRef: "location:reef-market",
        placementKind: "present",
      },
      {
        actorRef: "actor:lantern-council",
        locationRef: "location:tide-gate",
        placementKind: "present",
      },
      { actorRef: "actor:niko-salt", locationRef: "location:bell-foundry", placementKind: "present" },
      { actorRef: "actor:rhea-quill", locationRef: "location:storm-shrine", placementKind: "present" },
    ],
  };
}

function connectionsPacket(): WorldConnectionsPacket {
  return {
    relations: [
      {
        sourceActorRef: "actor:mara-venn",
        targetActorRef: "actor:lantern-council",
        relationType: "authority",
        summary: "Ilya controls Mara's signal archive access.",
        intensity: 4,
      },
      {
        sourceActorRef: "actor:oren-tide",
        targetActorRef: "actor:mara-venn",
        relationType: "dependency",
        summary: "Oren needs Mara to validate the route ledger.",
        intensity: 3,
      },
      {
        sourceActorRef: "actor:sel-bell",
        targetActorRef: "actor:lantern-council",
        relationType: "rivalry",
        summary: "Sel disputes Ilya's storm records.",
        intensity: 2,
      },
      { sourceActorRef: "actor:lantern-council", targetActorRef: "actor:niko-salt", relationType: "association", summary: "Ilya trusts Niko with copied records.", intensity: 3 },
      { sourceActorRef: "actor:niko-salt", targetActorRef: "actor:rhea-quill", relationType: "dependency", summary: "Niko needs Rhea to keep relief routes open.", intensity: 4 },
    ],
    pressures: [
      {
        name: "Failing Routes",
        description: "Safe sea lanes close earlier after every eclipse.",
        trajectory: "North Harbor loses supply access within two route cycles.",
        urgency: 5,
        actorRefs: ["actor:mara-venn", "actor:lantern-council", "actor:rhea-quill"],
        locationRefs: ["location:signal-tower"],
      },
      {
        name: "False Bells",
        description: "Bell Island signals storms that never arrive.",
        trajectory: "Couriers stop trusting Bell Island's warnings.",
        urgency: 3,
        actorRefs: ["actor:sel-bell", "actor:niko-salt"],
        locationRefs: ["location:bell-foundry"],
      },
    ],
  };
}

function successfulTrace(): SafeGenerateTrace {
  return {
    text: "private model output",
    cleanedText: "private model output",
    requestedMode: "auto",
    strategy: "native_schema",
    primaryStrategy: "native_schema",
    fallbackStrategy: "text_fallback",
    capability: {
      requestedMode: "auto",
      primaryStrategy: "native_schema",
      fallbackStrategy: "text_fallback",
      actualMode: "native_schema",
      reason: "route integration fixture",
    },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    },
    response: {
      id: "private-response-id",
      modelId: "route-model",
      timestamp: "private-timestamp",
    },
    finishReason: "stop",
  };
}

function structuredModel(): LanguageModel {
  const model = {} as LanguageModel;
  rememberStructuredOutputModelMetadata(
    model,
    buildStructuredOutputModelMetadata({
      providerId: "route-provider",
      providerName: "Route Provider",
      model: "route-model",
      protocol: "openai-compatible",
      baseUrl: "https://example.test/v1",
      transport: "chat-completions",
    }),
  );
  return model;
}

interface Gate {
  entered: Promise<void>;
  release(): void;
}

function controlledSuccessfulProvider(): {
  generateObject: typeof safeGenerateObject;
  gate: Gate;
} {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const packets = [framePacket(), castPacket(), connectionsPacket()];
  let index = 0;
  const generateObject = vi.fn(async () => {
    if (index === 0) {
      enter();
      await released;
    }
    const object = packets[index++];
    return { object, trace: successfulTrace() };
  }) as unknown as typeof safeGenerateObject;
  return {
    generateObject,
    gate: { entered, release },
  };
}

function controlledFailingProvider(): {
  generateObject: typeof safeGenerateObject;
  gate: Gate;
} {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const generateObject = vi.fn(async () => {
    enter();
    await released;
    throw new Error("Injected provider failure");
  }) as unknown as typeof safeGenerateObject;
  return {
    generateObject,
    gate: { entered, release },
  };
}

interface RouteHarness {
  app: Hono;
  buildService: ReturnType<typeof createCampaignWorldBuildService>;
}

function createHarness(generateObject: typeof safeGenerateObject): RouteHarness {
  let entitySequence = 0;
  let buildSequence = 0;
  const sourceService = createCampaignWorldSourceService();
  const builder = createCampaignWorldBuilder({
    generateObject,
    idFactory: () => `route-entity-${++entitySequence}`,
  });
  const buildService = createCampaignWorldBuildService({
    sourceService,
    builder,
    idFactory: () => `route-build-${++buildSequence}`,
  });
  const model = structuredModel();
  const routes = createCampaignWorldRoutes({
    sourceService,
    buildService,
    createModel: () => model,
    loadSettings: () => ({}) as never,
    resolveGenerator: () => ({
      resolved: {
        provider: {
          id: "route-provider",
          name: "Route Provider",
          baseUrl: "https://example.test/v1",
          apiKey: "route-key",
          model: "route-model",
        },
        temperature: 0.7,
        maxTokens: 8_000,
      },
    }),
    eventPollMilliseconds: 1,
  });
  const app = new Hono();
  app.route("/api/campaigns", routes);
  return { app, buildService };
}

interface SseRecord {
  id: number;
  event: string;
  data: Record<string, unknown>;
}

function parseSse(text: string): SseRecord[] {
  const records: SseRecord[] = [];
  for (const block of text.split("\n\n")) {
    if (block.length === 0) continue;
    let id: number | null = null;
    let event = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("id:")) id = Number(line.slice(3).trim());
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data = line.slice(5).trim();
    }
    if (id !== null && event.length > 0 && data.length > 0) {
      records.push({ id, event, data: JSON.parse(data) as Record<string, unknown> });
    }
  }
  return records;
}

let root = "";
let previousCampaignsRoot: string | undefined;

function campaignDirectory(): string {
  return path.join(root, CAMPAIGN_ID);
}

function writeConfig(): void {
  fs.mkdirSync(campaignDirectory(), { recursive: true });
  fs.writeFileSync(
    path.join(campaignDirectory(), "config.json"),
    JSON.stringify({
      name: "Route Integration Campaign",
      premise: "A stormbound archipelago faces a failing sea route.",
      createdAt: 1_000,
      updatedAt: 1_000,
    }),
    "utf-8",
  );
}

async function loadSource(app: Hono) {
  const response = await app.request(
    `/api/campaigns/${CAMPAIGN_ID}/world/source`,
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    sourceDigest: string;
    dna: unknown;
  }>;
}

async function startBuild(app: Hono, sourceDigest: string) {
  return app.request(`/api/campaigns/${CAMPAIGN_ID}/world/builds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedSourceDigest: sourceDigest }),
  });
}

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-world-route-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
  writeConfig();
});

afterEach(() => {
  closeDb();
  if (previousCampaignsRoot === undefined) {
    delete process.env.GSD_CAMPAIGNS_ROOT;
  } else {
    process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Campaign World routes", () => {
  it("loads source through the normal migration path and saves strict DNA", async () => {
    const provider = controlledSuccessfulProvider();
    const { app } = createHarness(provider.generateObject);
    const initial = await loadSource(app);
    expect(initial.dna).toBeNull();

    const database = openCampaignWorldDatabase(CAMPAIGN_ID);
    database.close();

    const invalid = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/dna`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geography: " Leading space",
          politicalStructure: "Harbor councils",
          centralConflict: "Failing routes",
          culturalFlavor: "Signal songs",
          environment: "Stormy islands",
          wildcard: "Living maps",
        }),
      },
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: "invalid_request" },
    });

    const saved = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/dna`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geography: "A ring of stormbound islands",
          politicalStructure: "Independent harbor councils",
          centralConflict: "The sea routes are failing",
          culturalFlavor: "Salt-worn ritual; Communal songs",
          environment: "Cold ocean winds and luminous reefs",
          wildcard: "Maps change after every eclipse",
        }),
      },
    );
    expect(saved.status).toBe(200);
    const savedSource = await saved.json() as {
      sourceDigest: string;
      dna: { culturalFlavor: string };
    };
    expect(savedSource.sourceDigest).not.toBe(initial.sourceDigest);
    expect(savedSource.dna.culturalFlavor).toBe(
      "Salt-worn ritual; Communal songs",
    );
  });

  it("replays a completed build, resumes by sequence, and accepts persisted review", async () => {
    const provider = controlledSuccessfulProvider();
    const { app, buildService } = createHarness(provider.generateObject);
    const source = await loadSource(app);
    const startedResponse = await startBuild(app, source.sourceDigest);
    expect(startedResponse.status).toBe(202);
    const started = await startedResponse.json() as { buildId: string };
    await provider.gate.entered;
    expect(buildService.hasLiveCoordinator(CAMPAIGN_ID, started.buildId)).toBe(true);
    const liveEventsResponse = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/builds/${started.buildId}/events?afterSequence=0`,
    );
    const liveEventsText = liveEventsResponse.text();
    const completion = buildService.waitForBuild(CAMPAIGN_ID, started.buildId);
    provider.gate.release();
    await completion;
    const allEvents = parseSse(await liveEventsText);
    expect(allEvents.map((event) => event.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);

    const stateResponse = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    );
    expect(stateResponse.status).toBe(200);
    const reviewState = await stateResponse.json() as {
      status: string;
      currentBuildId: string;
      currentStage: string;
      lastEventSequence: number;
      world: { version: number; contentHash: string; locations: unknown[] };
    };
    expect(reviewState).toMatchObject({
      status: "review",
      currentBuildId: started.buildId,
      currentStage: "persistence",
      lastEventSequence: 12,
    });
    expect(reviewState.world.locations).toHaveLength(9);

    const resumed = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/builds/${started.buildId}/events`,
      { headers: { "Last-Event-ID": "5" } },
    );
    const resumedEvents = parseSse(await resumed.text());
    expect(resumedEvents.map((event) => event.id)).toEqual([
      6, 7, 8, 9, 10, 11, 12,
    ]);
    const applied = new Map<number, SseRecord>();
    for (const event of allEvents.slice(0, 5)) applied.set(event.id, event);
    for (const event of resumedEvents) applied.set(event.id, event);
    expect([...applied.keys()]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);

    closeDb();
    const restartedProvider = controlledSuccessfulProvider();
    const restarted = createHarness(restartedProvider.generateObject).app;
    const restartedState = await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    );
    expect(await restartedState.json()).toMatchObject({
      status: "review",
      world: {
        version: reviewState.world.version,
        contentHash: reviewState.world.contentHash,
      },
    });
    const restartedReplay = await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/builds/${started.buildId}/events?afterSequence=0`,
    );
    expect(parseSse(await restartedReplay.text()).map((event) => event.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);

    const staleAccept = await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: reviewState.world.version + 1,
          expectedContentHash: reviewState.world.contentHash,
        }),
      },
    );
    expect(staleAccept.status).toBe(409);
    expect(await staleAccept.json()).toMatchObject({
      error: { code: "world_version_conflict" },
    });

    const staleHashAccept = await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: reviewState.world.version,
          expectedContentHash: "0".repeat(64),
        }),
      },
    );
    expect(staleHashAccept.status).toBe(409);
    expect(await staleHashAccept.json()).toMatchObject({
      error: { code: "world_version_conflict" },
    });

    const accepted = await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: reviewState.world.version,
          expectedContentHash: reviewState.world.contentHash,
        }),
      },
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({
      campaignId: CAMPAIGN_ID,
      worldVersion: 1,
      contentHash: reviewState.world.contentHash,
    });
    const acceptedState = await (await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    )).json();
    expect(acceptedState).toMatchObject({
      status: "accepted",
      world: { contentHash: reviewState.world.contentHash },
    });

    const acceptedDatabase = openCampaignWorldDatabase(CAMPAIGN_ID);
    try {
      acceptedDatabase.sqlite.prepare(`
        UPDATE actors
        SET summary = 'Live actor summary after acceptance.'
        WHERE campaign_id = ?
      `).run(CAMPAIGN_ID);
    } finally {
      acceptedDatabase.close();
    }
    expect(await (await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    )).json()).toEqual(acceptedState);
  });

  it("returns one accepted start and one conflict for simultaneous build requests", async () => {
    const provider = controlledSuccessfulProvider();
    const { app, buildService } = createHarness(provider.generateObject);
    const source = await loadSource(app);

    const [first, second] = await Promise.all([
      startBuild(app, source.sourceDigest),
      startBuild(app, source.sourceDigest),
    ]);
    const responses = [first, second].sort((left, right) => left.status - right.status);
    expect(responses.map((response) => response.status)).toEqual([202, 409]);
    const started = await responses[0].json() as { buildId: string };
    expect(await responses[1].json()).toMatchObject({
      error: { code: "world_build_running" },
    });
    await provider.gate.entered;
    const completion = buildService.waitForBuild(CAMPAIGN_ID, started.buildId);
    provider.gate.release();
    await completion;
    expect(await (await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    )).json()).toMatchObject({ status: "review" });
  });

  it("streams a durable provider failure and leaves domain rows empty", async () => {
    const provider = controlledFailingProvider();
    const { app, buildService } = createHarness(provider.generateObject);
    const source = await loadSource(app);
    const startedResponse = await startBuild(app, source.sourceDigest);
    const started = await startedResponse.json() as { buildId: string };
    await provider.gate.entered;
    const completion = buildService.waitForBuild(CAMPAIGN_ID, started.buildId);
    provider.gate.release();
    await completion;

    const eventsResponse = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/builds/${started.buildId}/events`,
    );
    const events = parseSse(await eventsResponse.text());
    expect(events.at(-1)).toMatchObject({
      id: 3,
      event: "build_failed",
      data: { errorCode: "model_contract_failed" },
    });
    expect(await (await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    )).json()).toMatchObject({
      status: "failed",
      currentBuildId: started.buildId,
      lastEventSequence: 3,
      build: { errorCode: "model_contract_failed" },
    });

    const database = openCampaignWorldDatabase(CAMPAIGN_ID);
    try {
      expect(database.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM locations WHERE campaign_id = ?",
      ).get(CAMPAIGN_ID)).toEqual({ count: 0 });
      expect(database.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM actors WHERE campaign_id = ?",
      ).get(CAMPAIGN_ID)).toEqual({ count: 0 });
    } finally {
      database.close();
    }

    const invalidCursor = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/builds/${started.buildId}/events?afterSequence=two`,
    );
    expect(invalidCursor.status).toBe(400);
    expect(await invalidCursor.json()).toMatchObject({
      error: { code: "invalid_event_cursor" },
    });
  });
});
