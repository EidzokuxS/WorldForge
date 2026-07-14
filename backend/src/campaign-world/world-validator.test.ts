import { describe, expect, it } from "vitest";
import type { WorldActor } from "@worldforge/shared";
import {
  CampaignWorldValidationError,
  validateCampaignWorldDraft,
  validateWorldActorControl,
  type CampaignWorldDraft,
} from "./world-validator.js";

function worldDraftFixture(): CampaignWorldDraft {
  return {
    worldSummary: "Three stormbound harbors depend on routes that fail after each eclipse.",
    locations: [
      {
        id: "location-a",
        name: "North Harbor",
        description: "A fortified harbor governed by signal keepers.",
        kind: "macro",
        parentLocationId: null,
        tags: ["fortified"],
        isStarting: true,
      },
      {
        id: "location-b",
        name: "Glass Reef",
        description: "A trading harbor built around luminous shoals.",
        kind: "macro",
        parentLocationId: null,
        tags: ["trade"],
        isStarting: false,
      },
      {
        id: "location-c",
        name: "Bell Island",
        description: "An island settlement that measures storms through bronze bells.",
        kind: "macro",
        parentLocationId: null,
        tags: ["weather"],
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
        summary: "A harbor clerk who tracks each denied passage.",
        traits: ["precise"],
        tags: ["clerk"],
      },
      { id: "actor-e", kind: "person", controller: "agent", role: "background", name: "Niko Salt", summary: "A dock medic who hears the crews' private fears.", traits: ["steady"], tags: ["medic"] },
      { id: "actor-f", kind: "person", controller: "agent", role: "key", name: "Rhea Quill", summary: "A route assessor who suspects the storms are directed.", traits: ["skeptical"], tags: ["assessor"] },
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
      { id: "goal-e", actorId: "actor-e", objective: "Keep exhausted crews working.", motivation: "Prevent another dockside death.", horizon: "immediate", priority: 3, status: "active" },
      { id: "goal-f", actorId: "actor-f", objective: "Identify who redirects storm signals.", motivation: "Restore safe crossings before eclipse.", horizon: "ongoing", priority: 5, status: "active" },
    ],
    relations: [
      {
        id: "relation-a",
        sourceActorId: "actor-a",
        targetActorId: "actor-d",
        relationType: "authority",
        summary: "Ilya controls Mara's access to signal archives.",
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
        summary: "Sel disputes Ilya's storm records.",
        intensity: 2,
      },
      { id: "relation-d", sourceActorId: "actor-d", targetActorId: "actor-e", relationType: "association", summary: "Ilya trusts Niko with copied records.", intensity: 3 },
      { id: "relation-e", sourceActorId: "actor-e", targetActorId: "actor-f", relationType: "dependency", summary: "Niko needs Rhea to keep relief routes open.", intensity: 4 },
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
      { id: "placement-e", actorId: "actor-e", locationId: "location-b", placementKind: "present" },
      { id: "placement-f", actorId: "actor-f", locationId: "location-c", placementKind: "present" },
    ],
    pressures: [
      {
        id: "pressure-a",
        name: "Failing Routes",
        description: "Safe sea lanes close earlier after every eclipse.",
        trajectory: "North Harbor loses supply access within two route cycles.",
        urgency: 5,
        actorIds: ["actor-a", "actor-d", "actor-f"],
        locationIds: ["location-a"],
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

function expectInvalid(draft: CampaignWorldDraft): void {
  expect(() => validateCampaignWorldDraft(draft)).toThrow(
    CampaignWorldValidationError,
  );
}

describe("Campaign World deterministic validator", () => {
  it("accepts only person, human, player at the live human boundary", () => {
    expect(() => validateWorldActorControl({
      id: "actor-player",
      kind: "person",
      controller: "human",
      role: "player",
    })).not.toThrow();
    expect(() => validateWorldActorControl({
      id: "actor-agent",
      kind: "person",
      controller: "agent",
      role: "key",
    })).not.toThrow();

    for (const actor of [
      { id: "human-key", kind: "person", controller: "human", role: "key" },
      { id: "human-background", kind: "person", controller: "human", role: "background" },
      { id: "agent-player", kind: "person", controller: "agent", role: "player" },
      { id: "agent-unknown", kind: "person", controller: "agent", role: "wanderer" },
    ] as const) {
      expect(() => validateWorldActorControl(
        actor as Pick<WorldActor, "id" | "kind" | "controller" | "role">,
      )).toThrow(
        CampaignWorldValidationError,
      );
    }
  });

  it("accepts a distributed world with person actors", () => {
    const draft = worldDraftFixture();

    expect(validateCampaignWorldDraft(draft)).toBe(draft);
    expect(draft.actors.every((actor) => actor.kind === "person")).toBe(true);
  });

  it("rejects a player actor from the generated world draft", () => {
    const draft = worldDraftFixture();
    const actor = draft.actors[0] as WorldActor;
    actor.controller = "human";
    actor.role = "player";

    expectInvalid(draft);
  });

  it.each([
    ["unknown route location", (draft: CampaignWorldDraft) => {
      draft.routes[0].toLocationId = "location-missing";
    }],
    ["duplicate location id", (draft: CampaignWorldDraft) => {
      draft.locations[1].id = draft.locations[0].id;
    }],
    ["disconnected graph", (draft: CampaignWorldDraft) => {
      draft.routes = draft.routes.filter((route) => route.id !== "route-b");
    }],
    ["unplaced person", (draft: CampaignWorldDraft) => {
      draft.placements = draft.placements.filter((placement) =>
        placement.actorId !== "actor-b"
      );
    }],
    ["self relation", (draft: CampaignWorldDraft) => {
      draft.relations[0].targetActorId = draft.relations[0].sourceActorId;
    }],
    ["missing required goal", (draft: CampaignWorldDraft) => {
      draft.goals = draft.goals.filter((goal) => goal.actorId !== "actor-a");
    }],
    ["unbound pressure", (draft: CampaignWorldDraft) => {
      draft.pressures[0].actorIds = [];
      draft.pressures[0].locationIds = [];
    }],
  ])("rejects %s", (_label, mutate) => {
    const draft = worldDraftFixture();
    mutate(draft);
    expectInvalid(draft);
  });

  it("rejects more than three active goals for a person", () => {
    const draft = worldDraftFixture();
    const person = draft.actors.find((actor) => actor.id === "actor-d")!;
    draft.goals.push({
      ...draft.goals.find((goal) => goal.actorId === person.id)!,
      id: "goal-d-second",
      objective: "Open a second route compact.",
    });

    draft.goals.push({ ...draft.goals.find((goal) => goal.actorId === person.id)!, id: "goal-d-third" });
    draft.goals.push({ ...draft.goals.find((goal) => goal.actorId === person.id)!, id: "goal-d-fourth" });
    expect(() => validateCampaignWorldDraft(draft)).toThrow("actor actor-d requires one to three active goals");
  });

  it.each([
    ["locations below minimum", (draft: CampaignWorldDraft) => {
      draft.locations = draft.locations.slice(0, 2);
    }],
    ["locations above maximum", (draft: CampaignWorldDraft) => {
      draft.locations = Array.from({ length: 11 }, (_, index) => ({
        ...draft.locations[0],
        id: `location-${index}`,
        isStarting: index === 0,
      }));
    }],
    ["routes below minimum", (draft: CampaignWorldDraft) => {
      draft.routes = draft.routes.slice(0, 1);
    }],
    ["routes above maximum", (draft: CampaignWorldDraft) => {
      draft.routes = Array.from({ length: 31 }, (_, index) => ({
        ...draft.routes[0],
        id: `route-${index}`,
      }));
    }],
    ["actors below minimum", (draft: CampaignWorldDraft) => {
      draft.actors = draft.actors.slice(0, 3);
    }],
    ["actors above maximum", (draft: CampaignWorldDraft) => {
      draft.actors = Array.from({ length: 17 }, (_, index) => ({
        ...draft.actors[0],
        id: `actor-${index}`,
      }));
    }],
    ["goals below minimum", (draft: CampaignWorldDraft) => {
      draft.goals = draft.goals.slice(0, 3);
    }],
    ["goals above maximum", (draft: CampaignWorldDraft) => {
      draft.goals = Array.from({ length: 33 }, (_, index) => ({
        ...draft.goals[0],
        id: `goal-${index}`,
      }));
    }],
    ["relations below minimum", (draft: CampaignWorldDraft) => {
      draft.relations = draft.relations.slice(0, 2);
    }],
    ["relations above maximum", (draft: CampaignWorldDraft) => {
      draft.relations = Array.from({ length: 33 }, (_, index) => ({
        ...draft.relations[0],
        id: `relation-${index}`,
      }));
    }],
    ["placements below minimum", (draft: CampaignWorldDraft) => {
      draft.placements = draft.placements.slice(0, 3);
    }],
    ["placements above maximum", (draft: CampaignWorldDraft) => {
      draft.placements = Array.from({ length: 33 }, (_, index) => ({
        ...draft.placements[0],
        id: `placement-${index}`,
      }));
    }],
    ["pressures below minimum", (draft: CampaignWorldDraft) => {
      draft.pressures = draft.pressures.slice(0, 1);
    }],
    ["pressures above maximum", (draft: CampaignWorldDraft) => {
      draft.pressures = Array.from({ length: 7 }, (_, index) => ({
        ...draft.pressures[0],
        id: `pressure-${index}`,
      }));
    }],
  ])("matches the product envelope for %s", (_label, mutate) => {
    const draft = worldDraftFixture();
    mutate(draft);
    expectInvalid(draft);
  });

  it("rejects missing role minimums and repeated pressure anchor sets", () => {
    const roles = worldDraftFixture();
    roles.actors = roles.actors.map((actor) => ({
      ...actor,
      kind: "person",
      role: "support",
    }));
    expectInvalid(roles);

    const anchors = worldDraftFixture();
    anchors.pressures[1].actorIds = [...anchors.pressures[0].actorIds];
    anchors.pressures[1].locationIds = [...anchors.pressures[0].locationIds];
    expectInvalid(anchors);
  });

  it("rejects runtime enum drift after packet composition", () => {
    const draft = worldDraftFixture();
    (draft.relations[0] as { relationType: string }).relationType = "unknown";

    expectInvalid(draft);
  });
});
