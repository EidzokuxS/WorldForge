import { describe, expect, it } from "vitest";
import type { WorldActor } from "@worldforge/shared";
import {
  CampaignWorldValidationError,
  validateCampaignWorldDraft,
  validateWorldActorControl,
  type CampaignWorldDraft,
} from "./world-validator.js";

function worldDraftFixture(): CampaignWorldDraft {
  const locationEntries = [
    ["region-north", "North Region", "macro", null, true],
    ["region-reef", "Reef Region", "macro", null, false],
    ["region-bell", "Bell Region", "macro", null, false],
    ["north-dock", "North Dock", "persistent_sublocation", "region-north", false],
    ["signal-tower", "Signal Tower", "persistent_sublocation", "region-north", false],
    ["reef-market", "Reef Market", "persistent_sublocation", "region-reef", false],
    ["tide-gate", "Tide Gate", "persistent_sublocation", "region-reef", false],
    ["bell-foundry", "Bell Foundry", "persistent_sublocation", "region-bell", false],
    ["storm-shrine", "Storm Shrine", "persistent_sublocation", "region-bell", false],
  ] as const;
  const people = ["mara", "oren", "sel", "ilya", "niko", "rhea"];
  const sceneIds = ["north-dock", "signal-tower", "reef-market", "tide-gate", "bell-foundry", "storm-shrine"];

  return {
    worldSummary: "Three stormbound regions depend on routes that fail after each eclipse.",
    locations: locationEntries.map(([id, name, kind, parentLocationId, isStarting]) => ({
      id,
      name,
      description: `${name} belongs to the stormbound coast.`,
      kind,
      parentLocationId,
      tags: ["coast"],
      isStarting,
    })),
    routes: sceneIds.map((fromLocationId, index) => ({
      id: `route-${index + 1}`,
      fromLocationId,
      toLocationId: sceneIds[(index + 1) % sceneIds.length]!,
      travelCost: 2,
    })),
    actors: people.map((id, index) => ({
      id: `actor-${id}`,
      kind: "person" as const,
      controller: "agent" as const,
      role: (["key", "support", "support", "background", "background", "key"] as const)[index]!,
      name: id,
      summary: `${id} depends on the route network.`,
      traits: ["watchful"],
      tags: ["coast"],
    })),
    goals: people.map((id, index) => ({
      id: `goal-${id}`,
      actorId: `actor-${id}`,
      objective: "Keep a crossing open.",
      motivation: "Protect people who depend on it.",
      horizon: index % 2 === 0 ? "immediate" as const : "ongoing" as const,
      priority: 3,
      status: "active" as const,
    })),
    relations: [
      ["mara", "ilya"],
      ["oren", "mara"],
      ["sel", "ilya"],
      ["ilya", "niko"],
      ["niko", "rhea"],
    ].map(([source, target], index) => ({
      id: `relation-${index + 1}`,
      sourceActorId: `actor-${source}`,
      targetActorId: `actor-${target}`,
      relationType: "association" as const,
      summary: `${source} relies on ${target}.`,
      intensity: 3,
    })),
    placements: people.map((id, index) => ({
      id: `placement-${id}`,
      actorId: `actor-${id}`,
      locationId: sceneIds[index]!,
      placementKind: "present" as const,
    })),
    pressures: [
      {
        id: "pressure-routes",
        name: "Failing Routes",
        description: "Safe sea lanes close earlier after every eclipse.",
        trajectory: "Dockworkers lose supply access within two route cycles.",
        urgency: 5,
        actorIds: ["actor-mara", "actor-ilya"],
        locationIds: ["north-dock"],
      },
      {
        id: "pressure-bells",
        name: "False Bells",
        description: "Bronze bells signal storms that never arrive.",
        trajectory: "Couriers stop trusting island warnings.",
        urgency: 3,
        actorIds: ["actor-sel", "actor-niko"],
        locationIds: ["bell-foundry"],
      },
    ],
  };
}

function expectInvalid(draft: CampaignWorldDraft): void {
  expect(() => validateCampaignWorldDraft(draft)).toThrow(CampaignWorldValidationError);
}

describe("Campaign World deterministic validator", () => {
  it("accepts concrete scenes, routes, person actors, and exact pressure anchors", () => {
    const draft = worldDraftFixture();

    expect(validateCampaignWorldDraft(draft)).toBe(draft);
    expect(draft.actors.every((actor) => actor.kind === "person")).toBe(true);
  });

  it("accepts only person, human, player at the live human boundary", () => {
    expect(() => validateWorldActorControl({ id: "actor-player", kind: "person", controller: "human", role: "player" })).not.toThrow();
    expect(() => validateWorldActorControl({ id: "actor-agent", kind: "person", controller: "agent", role: "key" })).not.toThrow();
    for (const actor of [
      { id: "human-key", kind: "person", controller: "human", role: "key" },
      { id: "human-background", kind: "person", controller: "human", role: "background" },
      { id: "agent-player", kind: "person", controller: "agent", role: "player" },
      { id: "agent-unknown", kind: "person", controller: "agent", role: "wanderer" },
    ] as const) {
      expect(() => validateWorldActorControl(
        actor as Pick<WorldActor, "id" | "kind" | "controller" | "role">,
      )).toThrow(CampaignWorldValidationError);
    }
  });

  it.each([
    ["a missing macro region", (draft: CampaignWorldDraft) => { draft.locations = draft.locations.filter((location) => location.id !== "region-bell"); }],
    ["too few concrete scenes", (draft: CampaignWorldDraft) => { draft.locations = draft.locations.filter((location) => location.id !== "storm-shrine"); }],
    ["a macro without two direct scenes", (draft: CampaignWorldDraft) => { draft.locations.find((location) => location.id === "signal-tower")!.parentLocationId = "region-reef"; }],
    ["a route to a macro region", (draft: CampaignWorldDraft) => { draft.routes[0]!.toLocationId = "region-north"; }],
    ["a scene graph that cannot return", (draft: CampaignWorldDraft) => { draft.routes = draft.routes.slice(0, 5); }],
    ["a present placement at a macro region", (draft: CampaignWorldDraft) => { draft.placements[0]!.locationId = "region-north"; }],
    ["a home placement at a macro region", (draft: CampaignWorldDraft) => { draft.placements.push({ ...draft.placements[0]!, id: "placement-home", placementKind: "home", locationId: "region-north" }); }],
    ["a pressure anchored at a macro region", (draft: CampaignWorldDraft) => { draft.pressures[0]!.locationIds = ["region-north"]; }],
  ])("rejects %s", (_label, mutate) => {
    const draft = worldDraftFixture();
    mutate(draft);
    expectInvalid(draft);
  });

  it("rejects generated player actors and pressures without person anchors", () => {
    const player = worldDraftFixture();
    player.actors[0] = {
      ...player.actors[0]!,
      controller: "human",
      role: "player",
    } as unknown as typeof player.actors[number];
    expectInvalid(player);

    const pressure = worldDraftFixture();
    pressure.pressures[0]!.actorIds = [];
    expectInvalid(pressure);
  });

  it.each([
    ["unknown route location", (draft: CampaignWorldDraft) => {
      draft.routes[0]!.toLocationId = "location-missing";
    }],
    ["duplicate location id", (draft: CampaignWorldDraft) => {
      draft.locations[1]!.id = draft.locations[0]!.id;
    }],
    ["disconnected concrete graph", (draft: CampaignWorldDraft) => {
      draft.routes = draft.routes.slice(0, 5);
    }],
    ["unplaced person", (draft: CampaignWorldDraft) => {
      draft.placements = draft.placements.filter((placement) => placement.actorId !== "actor-oren");
    }],
    ["self relation", (draft: CampaignWorldDraft) => {
      draft.relations[0]!.targetActorId = draft.relations[0]!.sourceActorId;
    }],
    ["missing required goal", (draft: CampaignWorldDraft) => {
      draft.goals = draft.goals.filter((goal) => goal.actorId !== "actor-mara");
    }],
    ["unbound pressure", (draft: CampaignWorldDraft) => {
      draft.pressures[0]!.actorIds = [];
      draft.pressures[0]!.locationIds = [];
    }],
  ])("rejects %s", (_label, mutate) => {
    const draft = worldDraftFixture();
    mutate(draft);
    expectInvalid(draft);
  });

  it("rejects more than three active goals for a person", () => {
    const draft = worldDraftFixture();
    const person = draft.actors.find((actor) => actor.id === "actor-ilya")!;
    const goal = draft.goals.find((candidate) => candidate.actorId === person.id)!;
    draft.goals.push({ ...goal, id: "goal-ilya-second", objective: "Open a second route compact." });
    draft.goals.push({ ...goal, id: "goal-ilya-third" });
    draft.goals.push({ ...goal, id: "goal-ilya-fourth" });
    expect(() => validateCampaignWorldDraft(draft)).toThrow("actor actor-ilya requires one to three active goals");
  });

  it.each([
    ["locations below minimum", (draft: CampaignWorldDraft) => {
      draft.locations = draft.locations.slice(0, 8);
    }],
    ["locations above maximum", (draft: CampaignWorldDraft) => {
      draft.locations = Array.from({ length: 11 }, (_, index) => ({
        ...draft.locations[3]!,
        id: `location-${index}`,
        isStarting: false,
      }));
    }],
    ["routes below minimum", (draft: CampaignWorldDraft) => {
      draft.routes = draft.routes.slice(0, 1);
    }],
    ["routes above maximum", (draft: CampaignWorldDraft) => {
      draft.routes = Array.from({ length: 31 }, (_, index) => ({ ...draft.routes[0]!, id: `route-${index}` }));
    }],
    ["actors below minimum", (draft: CampaignWorldDraft) => {
      draft.actors = draft.actors.slice(0, 3);
    }],
    ["actors above maximum", (draft: CampaignWorldDraft) => {
      draft.actors = Array.from({ length: 17 }, (_, index) => ({ ...draft.actors[0]!, id: `actor-${index}` }));
    }],
    ["goals below minimum", (draft: CampaignWorldDraft) => {
      draft.goals = draft.goals.slice(0, 3);
    }],
    ["goals above maximum", (draft: CampaignWorldDraft) => {
      draft.goals = Array.from({ length: 49 }, (_, index) => ({ ...draft.goals[0]!, id: `goal-${index}` }));
    }],
    ["relations below minimum", (draft: CampaignWorldDraft) => {
      draft.relations = draft.relations.slice(0, 2);
    }],
    ["relations above maximum", (draft: CampaignWorldDraft) => {
      draft.relations = Array.from({ length: 33 }, (_, index) => ({ ...draft.relations[0]!, id: `relation-${index}` }));
    }],
    ["placements below minimum", (draft: CampaignWorldDraft) => {
      draft.placements = draft.placements.slice(0, 3);
    }],
    ["placements above maximum", (draft: CampaignWorldDraft) => {
      draft.placements = Array.from({ length: 33 }, (_, index) => ({ ...draft.placements[0]!, id: `placement-${index}` }));
    }],
    ["pressures below minimum", (draft: CampaignWorldDraft) => {
      draft.pressures = draft.pressures.slice(0, 1);
    }],
    ["pressures above maximum", (draft: CampaignWorldDraft) => {
      draft.pressures = Array.from({ length: 7 }, (_, index) => ({ ...draft.pressures[0]!, id: `pressure-${index}` }));
    }],
  ])("matches the product envelope for %s", (_label, mutate) => {
    const draft = worldDraftFixture();
    mutate(draft);
    expectInvalid(draft);
  });

  it("rejects missing role minimums and repeated pressure anchor sets", () => {
    const roles = worldDraftFixture();
    roles.actors = roles.actors.map((actor) => ({ ...actor, kind: "person", role: "support" }));
    expectInvalid(roles);

    const anchors = worldDraftFixture();
    anchors.pressures[1]!.actorIds = [...anchors.pressures[0]!.actorIds];
    anchors.pressures[1]!.locationIds = [...anchors.pressures[0]!.locationIds];
    expectInvalid(anchors);
  });

  it("rejects runtime enum drift after packet composition", () => {
    const draft = worldDraftFixture();
    (draft.relations[0] as { relationType: string }).relationType = "unknown";
    expectInvalid(draft);
  });
});
