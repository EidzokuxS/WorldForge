import fs from "node:fs";
import path from "node:path";
import type { CampaignWorldSource } from "@worldforge/shared";
import { closeDb, connectDb, getSqliteConnection } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import type {
  CampaignWorldBuildCandidate,
  CampaignWorldModelStage,
  CampaignWorldStageEvidence,
} from "./world-builder.js";
import { calculateCampaignWorldContentHash } from "./world-snapshot.js";
import type { CampaignWorldDraft } from "./world-validator.js";
import type { CampaignWorldRepository } from "./world-repository.js";
import { calculateCampaignWorldSourceDigest } from "./world-source.js";

export const CAMPAIGN_A = "11111111-1111-4111-8111-111111111111";
export const CAMPAIGN_B = "22222222-2222-4222-8222-222222222222";

export function createMigratedCampaign(
  root: string,
  campaignId: string,
): string {
  const directory = path.join(root, campaignId);
  const databasePath = path.join(directory, "state.db");
  fs.mkdirSync(directory, { recursive: true });
  connectDb(databasePath);
  try {
    runMigrations();
    getSqliteConnection().prepare(`
      INSERT INTO campaigns (id, name, premise, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      campaignId,
      `Campaign ${campaignId.slice(0, 8)}`,
      "A stormbound archipelago faces a failing sea route.",
      1_000,
      1_000,
    );
  } finally {
    closeDb();
  }
  return databasePath;
}

export function sourceFixture(
  campaignId = CAMPAIGN_A,
): CampaignWorldSource {
  const source = {
    premise: "A stormbound archipelago faces a failing sea route.",
    dna: null,
    researchSummary: null,
    sourceReferences: [],
  };
  return {
    campaignId,
    ...source,
    sourceDigest: calculateCampaignWorldSourceDigest(source),
  };
}

export function worldDraftFixture(): CampaignWorldDraft {
  return {
    worldSummary: "Three stormbound harbors depend on routes that fail after each eclipse.",
    locations: [
      { id: "region-a", name: "North Harbor Region", description: "The northern harbor and its signal district.", kind: "macro", parentLocationId: null, tags: ["fortified"], isStarting: true },
      { id: "region-b", name: "Glass Reef Region", description: "The reef harbor and its trading district.", kind: "macro", parentLocationId: null, tags: ["trade"], isStarting: false },
      { id: "region-c", name: "Bell Island Region", description: "The island and its storm-measuring district.", kind: "macro", parentLocationId: null, tags: ["weather"], isStarting: false },
      {
        id: "location-a",
        name: "North Harbor Docks",
        description: "A fortified harbor governed by signal keepers.",
        kind: "persistent_sublocation",
        parentLocationId: "region-a",
        tags: ["fortified"],
        isStarting: false,
      },
      { id: "location-a-office", name: "North Harbor Office", description: "A public counter for passage records.", kind: "persistent_sublocation", parentLocationId: "region-a", tags: ["records"], isStarting: false },
      {
        id: "location-b",
        name: "Glass Reef Quay",
        description: "A trading harbor built around luminous shoals.",
        kind: "persistent_sublocation",
        parentLocationId: "region-b",
        tags: ["trade"],
        isStarting: false,
      },
      { id: "location-b-market", name: "Glass Reef Market", description: "A covered exchange behind the quay.", kind: "persistent_sublocation", parentLocationId: "region-b", tags: ["trade"], isStarting: false },
      {
        id: "location-c",
        name: "Bell Island Tower",
        description: "An island settlement that measures storms through bronze bells.",
        kind: "persistent_sublocation",
        parentLocationId: "region-c",
        tags: ["weather"],
        isStarting: false,
      },
      { id: "location-c-archive", name: "Bell Island Archive", description: "A dry room of storm records below the tower.", kind: "persistent_sublocation", parentLocationId: "region-c", tags: ["records"], isStarting: false },
    ],
    routes: [
      {
        id: "route-a",
        fromLocationId: "location-a",
        toLocationId: "location-b",
        travelCost: 2,
      },
      {
        id: "route-b",
        fromLocationId: "location-b",
        toLocationId: "location-c",
        travelCost: 3,
      },
      {
        id: "route-c",
        fromLocationId: "location-c",
        toLocationId: "location-a",
        travelCost: 4,
      },
      { id: "route-a-office", fromLocationId: "location-a", toLocationId: "location-a-office", travelCost: 1 },
      { id: "route-office-a", fromLocationId: "location-a-office", toLocationId: "location-a", travelCost: 1 },
      { id: "route-b-market", fromLocationId: "location-b", toLocationId: "location-b-market", travelCost: 1 },
      { id: "route-market-b", fromLocationId: "location-b-market", toLocationId: "location-b", travelCost: 1 },
      { id: "route-c-archive", fromLocationId: "location-c", toLocationId: "location-c-archive", travelCost: 1 },
      { id: "route-archive-c", fromLocationId: "location-c-archive", toLocationId: "location-c", travelCost: 1 },
    ],
    actors: [
      {
        id: "actor-a",
        kind: "person",
        controller: "agent",
        role: "key",
        name: "Mara Venn",
        summary: "A signal keeper tracking the broken route pattern.",
        traits: ["methodical"],
        tags: ["navigator"],
      },
      {
        id: "actor-b",
        kind: "person",
        controller: "agent",
        role: "support",
        name: "Oren Tide",
        summary: "A courier who knows the reef passages.",
        traits: ["observant"],
        tags: ["courier"],
      },
      {
        id: "actor-c",
        kind: "person",
        controller: "agent",
        role: "support",
        name: "Sel Bell",
        summary: "A bell tender who records impossible storms.",
        traits: ["patient"],
        tags: ["weather"],
      },
      {
        id: "actor-d",
        kind: "person",
        controller: "agent",
        role: "background",
        name: "Ilya Venn",
        summary: "A former harbor clerk who tracks each denied passage.",
        traits: ["precise"],
        tags: ["clerk"],
      },
      {
        id: "actor-e",
        kind: "person",
        controller: "agent",
        role: "background",
        name: "Niko Salt",
        summary: "A dock medic who hears the crews' private fears.",
        traits: ["steady"],
        tags: ["medic"],
      },
      {
        id: "actor-f",
        kind: "person",
        controller: "agent",
        role: "key",
        name: "Rhea Quill",
        summary: "A route assessor who suspects the storms are directed.",
        traits: ["skeptical"],
        tags: ["assessor"],
      },
    ],
    goals: [
      {
        id: "goal-a",
        actorId: "actor-a",
        objective: "Map the next route change.",
        motivation: "Keep North Harbor supplied.",
        horizon: "immediate",
        priority: 5,
        status: "active",
      },
      {
        id: "goal-b",
        actorId: "actor-b",
        objective: "Deliver a sealed route ledger.",
        motivation: "Clear an old family debt.",
        horizon: "immediate",
        priority: 4,
        status: "active",
      },
      {
        id: "goal-c",
        actorId: "actor-c",
        objective: "Explain the false storm signal.",
        motivation: "Protect Bell Island from panic.",
        horizon: "ongoing",
        priority: 3,
        status: "active",
      },
      {
        id: "goal-d",
        actorId: "actor-d",
        objective: "Recover the missing passage register.",
        motivation: "Prove the harbor records were altered.",
        horizon: "ongoing",
        priority: 4,
        status: "active",
      },
      {
        id: "goal-e",
        actorId: "actor-e",
        objective: "Keep the exhausted crews working.",
        motivation: "Prevent another dockside death.",
        horizon: "immediate",
        priority: 3,
        status: "active",
      },
      {
        id: "goal-f",
        actorId: "actor-f",
        objective: "Identify who redirects the storm signals.",
        motivation: "Restore safe crossings before the next eclipse.",
        horizon: "ongoing",
        priority: 5,
        status: "active",
      },
    ],
    relations: [
      {
        id: "relation-a",
        sourceActorId: "actor-a",
        targetActorId: "actor-d",
        relationType: "authority",
        summary: "Ilya controls Mara's access to the altered signal archives.",
        intensity: 4,
      },
      {
        id: "relation-b",
        sourceActorId: "actor-b",
        targetActorId: "actor-a",
        relationType: "dependency",
        summary: "Oren needs Mara to validate the sealed route ledger.",
        intensity: 3,
      },
      {
        id: "relation-c",
        sourceActorId: "actor-c",
        targetActorId: "actor-d",
        relationType: "rivalry",
        summary: "Sel disputes Ilya's record of the storm forecasts.",
        intensity: 2,
      },
      {
        id: "relation-d",
        sourceActorId: "actor-d",
        targetActorId: "actor-e",
        relationType: "association",
        summary: "Ilya trusts Niko with the records he cannot publish.",
        intensity: 3,
      },
      {
        id: "relation-e",
        sourceActorId: "actor-e",
        targetActorId: "actor-f",
        relationType: "dependency",
        summary: "Niko needs Rhea to keep the relief route open.",
        intensity: 4,
      },
    ],
    placements: [
      {
        id: "placement-a",
        actorId: "actor-a",
        locationId: "location-a",
        placementKind: "present",
      },
      {
        id: "placement-b",
        actorId: "actor-b",
        locationId: "location-a-office",
        placementKind: "present",
      },
      {
        id: "placement-c",
        actorId: "actor-c",
        locationId: "location-c",
        placementKind: "present",
      },
      {
        id: "placement-d",
        actorId: "actor-d",
        locationId: "location-a",
        placementKind: "present",
      },
      {
        id: "placement-e",
        actorId: "actor-e",
        locationId: "location-b",
        placementKind: "present",
      },
      {
        id: "placement-f",
        actorId: "actor-f",
        locationId: "location-c",
        placementKind: "present",
      },
    ],
    pressures: [
      {
        id: "pressure-a",
        name: "Failing Routes",
        description: "Safe sea lanes close earlier after every eclipse.",
        trajectory: "North Harbor loses supply access within two route cycles.",
        urgency: 5,
        actorIds: ["actor-b", "actor-a", "actor-f"],
        locationIds: ["location-a-office"],
      },
      {
        id: "pressure-b",
        name: "False Bells",
        description: "Bell Island signals storms that never arrive.",
        trajectory: "Couriers stop trusting Bell Island's warnings.",
        urgency: 3,
        actorIds: ["actor-c", "actor-e"],
        locationIds: ["location-c"],
      },
    ],
  };
}

export function candidateFixture(
  source: CampaignWorldSource,
): CampaignWorldBuildCandidate {
  const draft = worldDraftFixture();
  return {
    draft,
    contentHash: calculateCampaignWorldContentHash(source.sourceDigest, draft),
    stageEvidence: [],
  };
}

export function evidenceFixture(
  stage: CampaignWorldModelStage,
): CampaignWorldStageEvidence {
  return {
    stage,
    requestedMode: "auto",
    primaryStrategy: "native_schema",
    actualStrategy: "native_schema",
    totalAttempts: 1,
    repairUsed: false,
    retryUsed: false,
    textFallbackUsed: false,
    responseModel: "test-model",
    finishReason: "stop",
    errorCode: null,
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
  };
}

export function advanceBuildToPersistence(
  repository: CampaignWorldRepository,
  buildId: string,
): void {
  let createdAt = 1_010;
  for (const stage of [
    "world_frame",
    "world_cast",
    "world_connections",
  ] as const) {
    repository.recordStageStarted({ buildId, stage, createdAt: createdAt++ });
    repository.recordStageCompleted({
      buildId,
      stage,
      evidence: evidenceFixture(stage),
      createdAt: createdAt++,
    });
  }
  repository.recordStageStarted({
    buildId,
    stage: "validation",
    createdAt: createdAt++,
  });
  repository.recordStageCompleted({
    buildId,
    stage: "validation",
    createdAt: createdAt++,
  });
  repository.recordStageStarted({
    buildId,
    stage: "persistence",
    createdAt,
  });
}
