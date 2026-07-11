import type { CampaignWorldReview } from "@worldforge/shared";

export function campaignWorldReviewFixture(): CampaignWorldReview {
  return {
    campaignId: "campaign-1",
    status: "review",
    version: 2,
    contentHash: "0123456789abcdef0123456789abcdef",
    sourceDigest: "source-digest-1",
    worldSummary: "Guild trains cross a drowned coast where signal bells answer back.",
    locations: [
      {
        id: "location-a",
        name: "Lantern Gate",
        description: "The last dry terminus on the guild line.",
        kind: "macro",
        parentLocationId: null,
        tags: ["rail", "harbor"],
        isStarting: true,
      },
      {
        id: "location-b",
        name: "Bell Platform",
        description: "A signal platform suspended over the tide.",
        kind: "persistent_sublocation",
        parentLocationId: "location-a",
        tags: ["signal"],
        isStarting: false,
      },
    ],
    routes: [
      {
        id: "route-a",
        fromLocationId: "location-a",
        toLocationId: "location-b",
        travelCost: 2,
      },
    ],
    actors: [
      {
        id: "actor-a",
        kind: "person",
        controller: "agent",
        role: "key",
        name: "Mara Venn",
        summary: "A courier carrying the last valid route seal.",
        traits: ["watchful", "stubborn"],
        tags: ["courier"],
      },
      {
        id: "actor-b",
        kind: "collective",
        controller: "agent",
        role: "support",
        name: "The Signal Guild",
        summary: "Dispatchers who keep the drowned rail network legible.",
        traits: ["methodical", "divided"],
        tags: ["guild"],
      },
    ],
    goals: [
      {
        id: "goal-a",
        actorId: "actor-a",
        objective: "Reach Bell Platform before the tide turns.",
        motivation: "The route seal expires at dusk.",
        horizon: "immediate",
        priority: 5,
        status: "active",
      },
      {
        id: "goal-b",
        actorId: "actor-b",
        objective: "Preserve authority over the signal network.",
        motivation: "Without shared signals, the guild fragments.",
        horizon: "ongoing",
        priority: 4,
        status: "active",
      },
    ],
    relations: [
      {
        id: "relation-a",
        sourceActorId: "actor-b",
        targetActorId: "actor-a",
        relationType: "authority",
        summary: "The guild issued Mara's route seal and can revoke it.",
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
        locationId: "location-b",
        placementKind: "base",
      },
    ],
    pressures: [
      {
        id: "pressure-a",
        name: "Closing Route",
        description: "The tide is swallowing the last dry line.",
        trajectory: "Lantern Gate loses access to Bell Platform.",
        urgency: 5,
        actorIds: ["actor-a", "actor-b"],
        locationIds: ["location-a", "location-b"],
      },
    ],
    builtAt: 2000,
    acceptedAt: null,
    source: {
      premise: "A drowned rail kingdom listens for impossible bells.",
      dna: null,
      researchSummary: "Rail guilds organize the coast through signal authority.",
      sourceReferences: [{ id: "source-a", label: "Campaign premise", sourceType: "premise" }],
    },
  };
}
