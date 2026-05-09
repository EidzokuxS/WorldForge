import { describe, expect, it } from "vitest";

import {
  ActorFrameCitationError,
  assertActorDecisionCitations,
  buildActorFrame,
  buildCommandNodeFrame,
  validateActorDecisionCitations,
} from "../actor-frame.js";
import type { SceneFrame } from "../scene-frame.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const keyNpcId = "22222222-2222-4222-8222-222222222222";
const allyNpcId = "33333333-3333-4333-8333-333333333333";
const hiddenNpcId = "44444444-4444-4444-8444-444444444444";
const locationId = "55555555-5555-4555-8555-555555555555";
const sideRoomId = "66666666-6666-4666-8666-666666666666";

function createFrame(): SceneFrame {
  return {
    campaignId: "campaign-1",
    tick: 7,
    playerActorId: playerId,
    currentLocationId: locationId,
    currentSceneScopeId: locationId,
    currentLocationName: "Night Courier Depot",
    currentSceneScopeName: "Night Courier Depot",
    playerAction: "I ask who keeps moving behind the ledger wall.",
    roster: {
      active: [
        {
          id: playerId,
          type: "player",
          label: "Mira",
          locationId,
          sceneScopeId: locationId,
          awareness: "clear",
        },
        {
          id: keyNpcId,
          actorId: keyNpcId,
          type: "npc",
          label: "Depot Clerk",
          locationId,
          sceneScopeId: locationId,
          awareness: "clear",
          tags: ["nervous", "on-duty"],
          summary: "Keeps one hand on the stamp drawer.",
        },
      ],
      support: [
        {
          id: allyNpcId,
          actorId: allyNpcId,
          type: "npc",
          label: "Lamp Runner",
          locationId,
          sceneScopeId: locationId,
          awareness: "clear",
        },
      ],
      background: [
        {
          id: hiddenNpcId,
          actorId: hiddenNpcId,
          type: "npc",
          label: "Hidden Auditor",
          locationId,
          sceneScopeId: sideRoomId,
          awareness: "none",
          awarenessHint: "Paper clicks once behind the ledger wall.",
        },
      ],
    },
    perception: {
      playerAwarenessHints: ["Paper clicks once behind the ledger wall."],
      actorAwareness: {
        [keyNpcId]: {
          [playerId]: "clear",
          [allyNpcId]: "clear",
          [hiddenNpcId]: "hint",
        },
      },
      forbiddenActorIds: [hiddenNpcId],
      forbiddenActorLabels: ["Hidden Auditor"],
    },
    recentEvents: [
      {
        id: "public-event",
        tick: 6,
        summary: "A bell rings above the depot desk.",
        source: "location_recent_event",
        actorIds: [playerId, keyNpcId],
        perceivableByPlayer: true,
      },
      {
        id: "hidden-event",
        tick: 6,
        summary: "Hidden Auditor signs a sealed warrant.",
        source: "committed_event",
        actorIds: [hiddenNpcId],
        perceivableByPlayer: false,
      },
    ],
    targetCandidates: [
      {
        id: "target-ledger",
        type: "item",
        label: "Counter Ledger",
        itemId: "item-ledger",
        awareness: "clear",
        tags: ["paper"],
      },
    ],
    movementCandidates: [
      {
        id: "move-archive",
        locationId: sideRoomId,
        label: "Archive Door",
        connected: true,
      },
    ],
    deferredHooks: [],
    allowedTools: ["log_event", "set_relationship"],
    oracle: null,
  };
}

describe("ActorFrame", () => {
  it("builds a source-routed actor POV without leaking hidden identities", () => {
    const frame = buildActorFrame({
      frame: createFrame(),
      actorId: keyNpcId,
      worldVersion: 14,
      reports: [
        {
          id: "report-night-shift",
          route: "report_message",
          text: "Night shift reported an impatient courier near the south desk.",
          subjectRefs: [playerId],
        },
      ],
      beliefs: [
        {
          id: "belief-false-bribe",
          route: "belief",
          text: "Depot Clerk believes the stamped bribe token may be fake.",
          subjectRefs: [keyNpcId],
        },
      ],
    });

    const factTexts = frame.facts.map((fact) => fact.text).join("\n");
    expect(frame.observer.label).toBe("Depot Clerk");
    expect(frame.facts.map((fact) => fact.route)).toEqual(
      expect.arrayContaining([
        "self_state",
        "direct_observation",
        "local_affordance",
        "memory",
        "report_message",
        "belief",
      ]),
    );
    expect(factTexts).toContain("Paper clicks once behind the ledger wall.");
    expect(factTexts).not.toContain("Hidden Auditor");
    expect(factTexts).not.toContain("sealed warrant");
    expect(frame.hiddenExcludedCount).toBeGreaterThanOrEqual(2);
    expect(frame.contextBudgetTrace.didClipModelOutput).toBe(false);
    expect(frame.contextBudgetTrace.hiddenExcludedCount).toBe(frame.hiddenExcludedCount);
  });

  it("requires actor decisions to cite facts present in the frame", () => {
    const frame = buildActorFrame({
      frame: createFrame(),
      actorId: keyNpcId,
    });
    const knownFactId = frame.facts[0]!.id;

    expect(
      validateActorDecisionCitations(frame, {
        actorId: keyNpcId,
        citedFactIds: [knownFactId],
        intent: "Answer only from known facts.",
      }),
    ).toEqual({ ok: true, missingFactIds: [] });

    const invalidPacket = {
      actorId: keyNpcId,
      citedFactIds: [knownFactId, "hidden:unavailable"],
      intent: "Reveal something outside the frame.",
    };
    expect(validateActorDecisionCitations(frame, invalidPacket)).toEqual({
      ok: false,
      missingFactIds: ["hidden:unavailable"],
    });
    expect(() => assertActorDecisionCitations(frame, invalidPacket)).toThrow(
      ActorFrameCitationError,
    );
  });

  it("builds command-node facts from reports, rumors, beliefs, and public records", () => {
    const commandFrame = buildCommandNodeFrame({
      campaignId: "campaign-1",
      commandNodeId: "faction-couriers",
      label: "Courier Guild Desk",
      worldVersion: 15,
      reports: [
        {
          id: "report-desk",
          route: "report_message",
          text: "A desk runner reports three missing route stamps.",
        },
      ],
      rumors: [
        {
          id: "rumor-smuggler",
          route: "rumor",
          text: "A rumor says the south route was sold twice.",
          confidence: 0.4,
        },
      ],
      publicRecords: [
        {
          id: "record-ledger",
          route: "public_record",
          text: "The public ledger lists the north bridge as open.",
        },
      ],
      beliefs: [
        {
          id: "belief-pressure",
          route: "belief",
          text: "The guild believes the depot clerk is under pressure.",
        },
      ],
      goals: ["Keep the route network moving."],
      legalTools: ["log_event"],
    });

    expect(commandFrame.facts.map((fact) => fact.route)).toEqual([
      "report_message",
      "rumor",
      "public_record",
      "belief",
    ]);
    expect(commandFrame.contextBudgetTrace.sectionCounts).toMatchObject({
      facts: 4,
      goals: 1,
      legalTools: 1,
    });
  });
});
