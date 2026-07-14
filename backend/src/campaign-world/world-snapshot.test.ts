import { describe, expect, it } from "vitest";
import type { CampaignWorldReview } from "@worldforge/shared";
import {
  calculateCampaignWorldContentHash,
  parseAcceptedCampaignWorldReview,
  serializeAcceptedCampaignWorldReview,
  serializeCampaignWorldContent,
} from "./world-snapshot.js";
import { calculateCampaignWorldSourceDigest } from "./world-source.js";
import type { CampaignWorldDraft } from "./world-validator.js";

function snapshotDraft(): CampaignWorldDraft {
  return {
    worldSummary: "A compact world summary.",
    locations: [
      {
        id: "location-b",
        name: "B",
        description: "Second location.",
        kind: "macro",
        parentLocationId: null,
        tags: ["trade", "coast"],
        isStarting: false,
      },
      {
        id: "location-a",
        name: "A",
        description: "Starting location.",
        kind: "macro",
        parentLocationId: null,
        tags: ["start"],
        isStarting: true,
      },
      {
        id: "location-c",
        name: "C",
        description: "Third location.",
        kind: "macro",
        parentLocationId: null,
        tags: [],
        isStarting: false,
      },
    ],
    routes: [
      { id: "route-b", fromLocationId: "location-b", toLocationId: "location-c", travelCost: 2 },
      { id: "route-a", fromLocationId: "location-a", toLocationId: "location-b", travelCost: 1 },
    ],
    actors: [
      {
        id: "actor-b",
        kind: "person",
        controller: "agent",
        role: "background",
        name: "Clerk",
        summary: "A key person.",
        traits: ["formal", "cautious"],
        tags: ["civic"],
      },
      {
        id: "actor-a",
        kind: "person",
        controller: "agent",
        role: "key",
        name: "Keeper",
        summary: "A key person.",
        traits: ["alert"],
        tags: ["signal"],
      },
      {
        id: "actor-c",
        kind: "person",
        controller: "agent",
        role: "support",
        name: "Courier",
        summary: "A support person.",
        traits: [],
        tags: [],
      },
      {
        id: "actor-d",
        kind: "person",
        controller: "agent",
        role: "background",
        name: "Tender",
        summary: "Another support person.",
        traits: [],
        tags: [],
      },
      { id: "actor-e", kind: "person", controller: "agent", role: "support", name: "Medic", summary: "A dock medic.", traits: [], tags: [] },
      { id: "actor-f", kind: "person", controller: "agent", role: "key", name: "Assessor", summary: "A route assessor.", traits: [], tags: [] },
    ],
    goals: [
      { id: "goal-b", actorId: "actor-b", objective: "Control routes.", motivation: "Keep authority.", horizon: "ongoing", priority: 4, status: "active" },
      { id: "goal-a", actorId: "actor-a", objective: "Read signals.", motivation: "Protect harbor.", horizon: "immediate", priority: 5, status: "active" },
      { id: "goal-c", actorId: "actor-c", objective: "Deliver ledger.", motivation: "Finish work.", horizon: "immediate", priority: 3, status: "active" },
      { id: "goal-d", actorId: "actor-d", objective: "Repair bells.", motivation: "Restore trust.", horizon: "ongoing", priority: 3, status: "active" },
      { id: "goal-e", actorId: "actor-e", objective: "Treat crews.", motivation: "Prevent loss.", horizon: "immediate", priority: 3, status: "active" },
      { id: "goal-f", actorId: "actor-f", objective: "Check charts.", motivation: "Keep routes open.", horizon: "ongoing", priority: 5, status: "active" },
    ],
    relations: [
      { id: "relation-c", sourceActorId: "actor-d", targetActorId: "actor-b", relationType: "rivalry", summary: "They dispute forecasts.", intensity: 2 },
      { id: "relation-a", sourceActorId: "actor-a", targetActorId: "actor-b", relationType: "authority", summary: "The council controls access.", intensity: 4 },
      { id: "relation-b", sourceActorId: "actor-c", targetActorId: "actor-a", relationType: "dependency", summary: "The courier needs validation.", intensity: 3 },
      { id: "relation-d", sourceActorId: "actor-d", targetActorId: "actor-e", relationType: "association", summary: "They share dock reports.", intensity: 3 },
      { id: "relation-e", sourceActorId: "actor-e", targetActorId: "actor-f", relationType: "dependency", summary: "The medic needs a safe route.", intensity: 4 },
    ],
    placements: [
      { id: "placement-d", actorId: "actor-d", locationId: "location-c", placementKind: "present" },
      { id: "placement-a", actorId: "actor-a", locationId: "location-a", placementKind: "present" },
      { id: "placement-b", actorId: "actor-b", locationId: "location-a", placementKind: "present" },
      { id: "placement-c", actorId: "actor-c", locationId: "location-b", placementKind: "present" },
      { id: "placement-e", actorId: "actor-e", locationId: "location-b", placementKind: "present" },
      { id: "placement-f", actorId: "actor-f", locationId: "location-c", placementKind: "present" },
    ],
    pressures: [
      { id: "pressure-b", name: "Bells", description: "Signals fail.", trajectory: "Trust declines.", urgency: 3, actorIds: ["actor-d", "actor-e"], locationIds: ["location-c"] },
      { id: "pressure-a", name: "Routes", description: "Routes close.", trajectory: "Supply fails.", urgency: 5, actorIds: ["actor-b", "actor-a"], locationIds: ["location-a"] },
    ],
  };
}

function reverseWorldArrays(draft: CampaignWorldDraft): CampaignWorldDraft {
  return {
    ...draft,
    locations: [...draft.locations].reverse().map((location) => ({
      ...location,
      tags: [...location.tags].reverse(),
    })),
    routes: [...draft.routes].reverse(),
    actors: [...draft.actors].reverse().map((actor) => ({
      ...actor,
      traits: [...actor.traits].reverse(),
      tags: [...actor.tags].reverse(),
    })),
    goals: [...draft.goals].reverse(),
    relations: [...draft.relations].reverse(),
    placements: [...draft.placements].reverse(),
    pressures: [...draft.pressures].reverse().map((pressure) => ({
      ...pressure,
      actorIds: [...pressure.actorIds].reverse(),
      locationIds: [...pressure.locationIds].reverse(),
    })),
  };
}

function acceptedReview(): CampaignWorldReview {
  const draft = snapshotDraft();
  const source = {
    premise: "A compact test world.",
    dna: null,
    researchSummary: null,
    sourceReferences: [],
  };
  const sourceDigest = calculateCampaignWorldSourceDigest(source);
  return {
    campaignId: "11111111-1111-4111-8111-111111111111",
    status: "accepted",
    version: 1,
    contentHash: calculateCampaignWorldContentHash(sourceDigest, draft),
    sourceDigest,
    ...draft,
    builtAt: 1_000,
    acceptedAt: 1_100,
    source,
  };
}

describe("Campaign World canonical snapshot", () => {
  it("serializes identical content identically across array order", () => {
    const draft = snapshotDraft();
    const reordered = reverseWorldArrays(snapshotDraft());

    expect(serializeCampaignWorldContent("source-digest", reordered)).toBe(
      serializeCampaignWorldContent("source-digest", draft),
    );
    expect(calculateCampaignWorldContentHash("source-digest", reordered)).toBe(
      calculateCampaignWorldContentHash("source-digest", draft),
    );
  });

  it("changes the hash for source or canonical content changes", () => {
    const draft = snapshotDraft();
    const changed = snapshotDraft();
    changed.actors[0].summary = "A changed person summary.";

    expect(calculateCampaignWorldContentHash("source-a", changed)).not.toBe(
      calculateCampaignWorldContentHash("source-a", draft),
    );
    expect(calculateCampaignWorldContentHash("source-b", draft)).not.toBe(
      calculateCampaignWorldContentHash("source-a", draft),
    );
  });

  it("round-trips one canonical accepted Review with bound provenance", () => {
    const review = acceptedReview();
    const serialized = serializeAcceptedCampaignWorldReview(review);
    const expected = {
      campaignId: review.campaignId,
      acceptedWorldVersion: review.version,
      acceptedContentHash: review.contentHash,
      acceptedAt: review.acceptedAt as number,
    };

    expect(parseAcceptedCampaignWorldReview(serialized, expected)).toEqual(review);
    expect(() => parseAcceptedCampaignWorldReview(` ${serialized}`, expected)).toThrow(
      "not canonical JSON",
    );

    const changedHashReview = {
      ...review,
      contentHash: "0".repeat(64),
    };
    expect(() => parseAcceptedCampaignWorldReview(
      serializeAcceptedCampaignWorldReview(changedHashReview),
      expected,
    )).toThrow("metadata does not match");

    const changedSourceReview = {
      ...review,
      source: {
        ...review.source,
        premise: "A different accepted premise.",
      },
    };
    expect(() => parseAcceptedCampaignWorldReview(
      serializeAcceptedCampaignWorldReview(changedSourceReview),
      expected,
    )).toThrow("source digest does not match");

    const playerSnapshot = JSON.parse(serialized) as {
      actors: Array<{ role: string }>;
    };
    playerSnapshot.actors[0].role = "player";
    expect(() => parseAcceptedCampaignWorldReview(
      JSON.stringify(playerSnapshot),
      expected,
    )).toThrow();
  });
});
