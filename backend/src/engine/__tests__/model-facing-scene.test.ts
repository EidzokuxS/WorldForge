import { describe, expect, it } from "vitest";

import {
  buildModelFacingScenePacket,
  buildModelFacingScenePromptView,
  redactModelFacingJson,
  redactModelFacingText,
} from "../model-facing-scene.js";
import type { SceneFrame } from "../scene-frame.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const clerkId = "22222222-2222-4222-8222-222222222222";
const hintedId = "33333333-3333-4333-8333-333333333333";
const outpostCookId = "44444444-4444-4444-8444-444444444444";
const signalDeskClerkId = "55555555-5555-4555-8555-555555555555";

function createForestOutpostLeakFrame(): SceneFrame {
  return {
    campaignId: "campaign-phase-79",
    tick: 79,
    worldVersion: 0,
    playerActorId: playerId,
    currentLocationId: "loc-shibuya-district",
    currentSceneScopeId: "scene-shibuya-cafe",
    currentLocationName: "Shibuya District",
    currentSceneScopeName: "Shibuya Cafe",
    currentLocationDescription:
      "Shibuya CCTV watches the public counter while a rumor about Forest Outpost stays private.",
    currentSceneScopeDescription:
      "The cafe counter has a service curtain and one visible clerk.",
    playerAction: "I ask the cafe clerk for the price.",
    roster: {
      active: [
        {
          id: playerId,
          actorId: playerId,
          type: "player",
          label: "Player",
          locationId: "loc-shibuya-district",
          sceneScopeId: "scene-shibuya-cafe",
          awareness: "clear",
        },
        {
          id: clerkId,
          actorId: clerkId,
          type: "npc",
          label: "Cafe Clerk",
          locationId: "loc-shibuya-district",
          sceneScopeId: "scene-shibuya-cafe",
          awareness: "clear",
        },
      ],
      support: [
        {
          id: hintedId,
          actorId: hintedId,
          type: "npc",
          label: "Back-Room Listener",
          locationId: "loc-shibuya-district",
          sceneScopeId: "scene-shibuya-cafe",
          awareness: "hint",
          awarenessHint: "Someone shifts behind the service curtain.",
        },
      ],
      background: [
        {
          id: outpostCookId,
          actorId: outpostCookId,
          type: "npc",
          label: "Outpost Cook",
          locationId: "loc-okutama-safe-zone",
          sceneScopeId: "scene-forest-outpost",
          awareness: "none",
        },
      ],
    },
    perception: {
      playerAwarenessHints: ["Someone shifts behind the service curtain."],
      actorAwareness: {},
      forbiddenActorIds: [hintedId, outpostCookId],
      forbiddenActorLabels: ["Back-Room Listener", "Outpost Cook"],
    },
    recentEvents: [
      {
        id: "local-cafe-bell",
        tick: 78,
        summary: "The Shibuya cafe bell rings as the clerk waits.",
        source: "location_recent_event",
        actorIds: [playerId, clerkId],
        perceivableByPlayer: true,
      },
      {
        id: "private-outpost-beat",
        tick: 78,
        summary: "Outpost Cook waits at Okutama Safe Zone - Forest Outpost.",
        source: "committed_event",
        actorIds: [outpostCookId],
        perceivableByPlayer: false,
      },
    ],
    targetCandidates: [
      {
        id: `actor:${clerkId}`,
        actorId: clerkId,
        type: "actor",
        label: "Cafe Clerk",
        awareness: "clear",
      },
      {
        id: `actor:${hintedId}`,
        actorId: hintedId,
        type: "actor",
        label: "Someone shifts behind the service curtain.",
        awareness: "hint",
      },
    ],
    movementCandidates: [
      {
        id: "edge-shibuya-station",
        locationId: "loc-shibuya-station",
        label: "Shibuya Station Exit",
        connected: true,
      },
    ],
    deferredHooks: [],
    allowedTools: ["log_event", "spawn_npc"],
    oracle: null,
  };
}

describe("model-facing scene packet", () => {
  it("keeps local Shibuya affordances while excluding offscreen Forest Outpost truth", () => {
    const packet = buildModelFacingScenePacket(createForestOutpostLeakFrame());
    const promptSurface = JSON.stringify(packet.view);

    expect(promptSurface).toContain("Shibuya");
    expect(promptSurface).toContain("Shibuya CCTV watches the public counter");
    expect(promptSurface).toContain("Cafe Clerk");
    expect(promptSurface).toContain("Someone shifts behind the service curtain.");
    expect(promptSurface).toContain("hiddenActorCount");
    expect(promptSurface).not.toContain("Forest Outpost");
    expect(promptSurface).not.toContain("Okutama Safe Zone");
    expect(promptSurface).not.toContain("Outpost Cook");
    expect(promptSurface).not.toContain(outpostCookId);
    expect(promptSurface).not.toContain("Back-Room Listener");
    expect(promptSurface).not.toContain(hintedId);
    expect(promptSurface).not.toContain("forbiddenActorLabels");
    expect(promptSurface).not.toContain("roster.background");
    expect(packet.view.legalTargets.map((candidate) => candidate.label)).toEqual(["Cafe Clerk"]);
  });

  it("keeps player-visible recent events even when a participant is no longer clear-visible", () => {
    const frame = createForestOutpostLeakFrame();
    frame.roster.background.push({
      id: signalDeskClerkId,
      actorId: signalDeskClerkId,
      type: "npc",
      label: "Signal Desk Clerk",
      locationId: "loc-lowwater-bazaar",
      sceneScopeId: "scene-signal-counter",
      awareness: "none",
    });
    frame.perception.forbiddenActorIds?.push(signalDeskClerkId);
    frame.perception.forbiddenActorLabels?.push("Signal Desk Clerk");
    frame.recentEvents = [
      {
        id: "ledger-rumor",
        tick: 80,
        summary:
          "Mira approached a signal desk clerk at Lowwater Bazaar and planted a claim: \"Tower Three's western ledger is missing pages.\"",
        source: "committed_event",
        actorIds: ["Mira Voss", "Signal Desk Clerk"],
        perceivableByPlayer: true,
      },
      {
        id: "private-outpost-beat",
        tick: 80,
        summary: "Outpost Cook waits at Okutama Safe Zone - Forest Outpost.",
        source: "committed_event",
        actorIds: [outpostCookId],
        perceivableByPlayer: false,
      },
    ];

    const packet = buildModelFacingScenePacket(frame);
    const promptSurface = JSON.stringify(packet.view);

    expect(packet.view.localRecentEvents).toHaveLength(1);
    expect(packet.view.localRecentEvents[0]).toMatchObject({
      id: "ledger-rumor",
      actorIds: ["Mira Voss"],
    });
    expect(promptSurface).toContain("Tower Three's western ledger is missing pages");
    expect(promptSurface).not.toContain("Signal Desk Clerk");
    expect(promptSurface).not.toContain("signal desk clerk");
    expect(promptSurface).not.toContain("Outpost Cook");
    expect(promptSurface).not.toContain("Forest Outpost");
  });

  it("redacts repair and conversation text using terms collected from private scene context", () => {
    const packet = buildModelFacingScenePacket(createForestOutpostLeakFrame());

    const text = redactModelFacingText(
      "The invalid candidate referenced Outpost Cook at Forest Outpost.",
      packet.safety,
    );
    const json = JSON.stringify(
      redactModelFacingJson(
        {
          actorRef: "Outpost Cook",
          input: {
            locationName: "Okutama Safe Zone - Forest Outpost",
          },
        },
        packet.safety,
      ),
    );

    expect(text).not.toContain("Outpost Cook");
    expect(text).not.toContain("Forest Outpost");
    expect(json).not.toContain("Outpost Cook");
    expect(json).not.toContain("Forest Outpost");
    expect(json).not.toContain("Okutama Safe Zone");
  });

  it("projects prompt scene view without backend ids or dangerous id keys", () => {
    const frame = createForestOutpostLeakFrame();
    frame.campaignId = "UGLY-CAMPAIGN-ID-95";
    frame.playerActorId = "UGLY-PLAYER-ACTOR-ID-95";
    frame.currentLocationId = "UGLY-CURRENT-LOCATION-ID-95";
    frame.currentSceneScopeId = "UGLY-CURRENT-SCENE-SCOPE-ID-95";
    frame.roster.active[0].id = "UGLY-PLAYER-ID-95";
    frame.roster.active[0].actorId = "UGLY-PLAYER-ACTOR-ID-95";
    frame.roster.active[1].id = "UGLY-CLERK-ID-95";
    frame.roster.active[1].actorId = "UGLY-CLERK-ACTOR-ID-95";
    frame.recentEvents[0].id = "UGLY-EVENT-ID-95";
    frame.recentEvents[0].actorIds = ["UGLY-PLAYER-ID-95", "UGLY-CLERK-ACTOR-ID-95"];
    frame.targetCandidates[0].id = "UGLY-TARGET-ID-95";
    frame.targetCandidates[0].actorId = "UGLY-CLERK-ACTOR-ID-95";
    frame.movementCandidates[0].id = "UGLY-MOVEMENT-ID-95";
    frame.movementCandidates[0].locationId = "UGLY-MOVEMENT-LOCATION-ID-95";

    const packet = buildModelFacingScenePacket(frame);
    const promptView = buildModelFacingScenePromptView(packet.view);
    const promptSurface = JSON.stringify(promptView);

    expect(promptSurface).toContain("current_location");
    expect(promptSurface).toContain("current_scene");
    expect(promptSurface).toContain("Shibuya District");
    expect(promptSurface).toContain("Shibuya Cafe");
    expect(promptSurface).toContain("Cafe Clerk");
    expect(promptSurface).toContain("Shibuya Station Exit");
    expect(promptSurface).not.toContain("UGLY-");
    expect(promptSurface).not.toContain("actor:");
    expect(promptSurface).not.toContain("location:");
    expect(promptSurface).not.toContain("movement:");
    expect(promptSurface).not.toMatch(
      /"(?:id|actorId|locationId|campaignId|playerActorId|currentLocationId|currentSceneScopeId)"\s*:/,
    );
  });

  it("sanitizes backend refs embedded in persistent prompt strings", () => {
    const frame = createForestOutpostLeakFrame();
    frame.currentLocationDescription =
      "Public counter near loc-secret-vault and route_hidden_path.";
    frame.currentSceneScopeDescription =
      "Scene scope says source:event-1 should stay backend-only.";
    frame.roster.active[1].summary =
      "Cafe Clerk remembers actor_hidden and tool_result_8.";
    frame.perception.playerAwarenessHints = [
      "A player-facing source-linked hint mentions route-tea-lane.",
    ];
    frame.recentEvents[0]!.summary =
      "The clerk points at location:loc-pier after tool-result-7.";
    frame.targetCandidates[0]!.label = "Cafe Clerk actor_hidden";
    frame.movementCandidates[0]!.label = "Shibuya route_hidden_path";

    const packet = buildModelFacingScenePacket(frame);
    const promptView = buildModelFacingScenePromptView(packet.view);
    const promptSurface = JSON.stringify(promptView);

    expect(promptSurface).toContain("player-facing");
    expect(promptSurface).toContain("source-linked");
    for (const leaked of [
      "loc-secret-vault",
      "route_hidden_path",
      "source:event-1",
      "actor_hidden",
      "tool_result_8",
      "location:loc-pier",
      "tool-result-7",
      "route-tea-lane",
    ]) {
      expect(promptSurface).not.toContain(leaked);
    }
    expect(promptSurface).toContain("[backend ref hidden]");
  });

  it("does not surface unknown non-pattern backend ids from recent event actor refs", () => {
    const frame = createForestOutpostLeakFrame();
    frame.roster.active[1].id = "clerkInternal44";
    frame.roster.active[1].actorId = "clerkInternal44";
    frame.recentEvents[0]!.actorIds = ["clerkInternal44", "orphanInternal55"];

    const packet = buildModelFacingScenePacket(frame);
    const promptView = buildModelFacingScenePromptView(packet.view);
    const promptSurface = JSON.stringify(promptView.localRecentEvents);

    expect(promptSurface).toContain("Cafe Clerk");
    expect(promptSurface).not.toContain("clerkInternal44");
    expect(promptSurface).not.toContain("orphanInternal55");
  });
});
