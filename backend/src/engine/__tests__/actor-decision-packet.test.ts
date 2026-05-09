import { describe, expect, it } from "vitest";
import {
  ActorDecisionPacketValidationError,
  assertActorDecisionPacket,
  validateActorDecisionPacket,
  type ActorDecisionPacketFrameLike,
} from "../actor-decision-packet.js";
import type { RuntimeToolName } from "../tool-schemas.js";

const frame: ActorDecisionPacketFrameLike = {
  observer: { actorId: "npc-key", id: "npc-key" },
  facts: [
    { id: "self:npc-key" },
    { id: "actor:player-1" },
    { id: "move:loc-b" },
  ],
  legalTools: ["log_event", "move_to"] satisfies RuntimeToolName[],
};

describe("ActorDecisionPacket", () => {
  it("accepts a cited, legal actor tool request", () => {
    const packet = assertActorDecisionPacket({
      frame,
      packet: {
        actorId: "npc-key",
        citedFactIds: ["self:npc-key", "actor:player-1"],
        selectedGoal: "keep watch",
        intent: "warn the player without taking over the turn",
        requestedTools: [
          {
            toolName: "log_event",
            purpose: "record the visible warning beat",
            input: {
              text: "The watcher warns the player to keep low.",
              importance: 3,
              participants: ["Watcher"],
              durability: "scene_local",
            },
          },
        ],
        beliefUpdates: [],
        planUpdates: [],
        nextDecisionTrigger: {
          reason: "player responds to warning",
          delayWorldTimeMinutes: 5,
        },
        noActionReason: null,
      },
    });

    expect(packet.requestedTools[0]?.toolName).toBe("log_event");
  });

  it("accepts contested outcome requests when exposed by the ActorFrame", () => {
    const packet = assertActorDecisionPacket({
      frame: {
        ...frame,
        legalTools: ["request_contested_outcome"] satisfies RuntimeToolName[],
      },
      packet: {
        actorId: "npc-key",
        citedFactIds: ["self:npc-key", "actor:player-1"],
        intent: "stop the player without deciding the combat result in prose",
        requestedTools: [
          {
            toolName: "request_contested_outcome",
            purpose: "ask backend rules for contest bounds",
            input: {
              actorName: "Watcher",
              targetName: "Player",
              mode: "restrain",
              intent: "Pin the player before they force the door.",
              stakes: "Whether the player can keep moving.",
              evidenceRefs: ["self:npc-key", "actor:player-1"],
            },
          },
        ],
      },
    });

    expect(packet.requestedTools[0]?.toolName).toBe("request_contested_outcome");
  });

  it("rejects claims cited outside the ActorFrame", () => {
    expect(() =>
      assertActorDecisionPacket({
        frame,
        packet: {
          actorId: "npc-key",
          citedFactIds: ["hidden:offscreen-secret"],
          intent: "react to a secret not in frame",
          requestedTools: [],
          noActionReason: "no grounded move",
        },
      }),
    ).toThrow(ActorDecisionPacketValidationError);
  });

  it("rejects tools not exposed by the actor frame", () => {
    const validation = validateActorDecisionPacket({
      frame,
      packet: {
        actorId: "npc-key",
        citedFactIds: ["self:npc-key"],
        intent: "create an unsupported extra NPC",
        requestedTools: [
          {
            toolName: "spawn_npc",
            purpose: "not legal for actor turns",
            input: {
              name: "Extra",
              tags: ["support"],
              locationRef: "current_scene",
            },
          },
        ],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ code: "unsupported_tool" }),
    );
  });

  it("rejects malformed tool input before execution", () => {
    const validation = validateActorDecisionPacket({
      frame,
      packet: {
        actorId: "npc-key",
        citedFactIds: ["self:npc-key"],
        intent: "log an event with missing fields",
        requestedTools: [
          {
            toolName: "log_event",
            purpose: "malformed event",
            input: {},
          },
        ],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ code: "invalid_shape" }),
    );
  });

  it("requires a concrete no-action reason when no tools are requested", () => {
    const validation = validateActorDecisionPacket({
      frame,
      packet: {
        actorId: "npc-key",
        citedFactIds: ["self:npc-key"],
        intent: "do nothing",
        requestedTools: [],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ code: "invalid_shape", path: "noActionReason" }),
    );
  });
});
