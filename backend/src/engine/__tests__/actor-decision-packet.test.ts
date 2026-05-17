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
        citedFactIds: ["f1", "f2"],
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

    expect(packet.actorId).toBe("npc-key");
    expect(packet.citedFactIds).toEqual(["self:npc-key", "actor:player-1"]);
    expect(packet.requestedTools[0]?.toolName).toBe("log_event");
  });

  it("accepts contested outcome requests when exposed by the ActorFrame", () => {
    const packet = assertActorDecisionPacket({
      frame: {
        ...frame,
        legalTools: ["request_contested_outcome"] satisfies RuntimeToolName[],
      },
      packet: {
        citedFactIds: ["f1", "f2"],
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
              evidenceRefs: ["f1", "f2"],
            },
          },
        ],
      },
    });

    expect(packet.requestedTools[0]?.toolName).toBe("request_contested_outcome");
    expect(packet.requestedTools[0]?.input).toMatchObject({
      evidenceRefs: ["self:npc-key", "actor:player-1"],
    });
  });

  it("normalizes natural typed belief and plan updates into the actor process contract", () => {
    const packet = assertActorDecisionPacket({
      frame,
      packet: {
        citedFactIds: ["f1"],
        intent: "watch the player and keep the current plan alive",
        requestedTools: [],
        beliefUpdates: [
          {
            category: "suspicion",
            update: "The player may be testing the posted boundary.",
          },
        ],
        planUpdates: [
          {
            category: "blocked",
            update: "Hold the checkpoint posture until the player presents a valid seal.",
            writeScopes: ["npc:other:state"],
          },
          {
            update: "Keep the witness line stable for the next exchange.",
          },
        ],
        noActionReason: "The watcher has no grounded world-facing move yet.",
      },
    });

    expect(packet.beliefUpdates).toEqual([
      "suspicion: The player may be testing the posted boundary.",
    ]);
    expect(packet.planUpdates[0]).toMatchObject({
      summary: "Hold the checkpoint posture until the player presents a valid seal.",
      status: "blocked",
    });
    expect(packet.planUpdates[0]?.writeScopes).toBeUndefined();
    expect(packet.planUpdates[1]).toMatchObject({
      summary: "Keep the witness line stable for the next exchange.",
      status: "continued",
    });
  });

  it("rejects claims cited outside the ActorFrame", () => {
    expect(() =>
      assertActorDecisionPacket({
        frame,
        packet: {
          citedFactIds: ["hidden:offscreen-secret"],
          intent: "react to a secret not in frame",
          requestedTools: [],
          noActionReason: "no grounded move",
        },
      }),
    ).toThrow(ActorDecisionPacketValidationError);
  });

  it("rejects backend fact ids even when the fact is present in the ActorFrame", () => {
    const validation = validateActorDecisionPacket({
      frame,
      packet: {
        citedFactIds: ["self:npc-key"],
        intent: "try to cite a backend fact id directly",
        requestedTools: [],
        beliefUpdates: [{
          category: "suspicion",
          update: "The watcher privately notes the player's posture.",
        }],
        planUpdates: [{
          category: "continued",
          update: "Keep the station watch stable.",
        }],
        noActionReason: "no grounded move",
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_fact_ref",
        path: "citedFactIds.0",
      }),
    );
  });

  it("rejects raw contested-outcome evidence refs before normalizing tool input", () => {
    const validation = validateActorDecisionPacket({
      frame: {
        ...frame,
        legalTools: ["request_contested_outcome"] satisfies RuntimeToolName[],
      },
      packet: {
        citedFactIds: ["f1"],
        intent: "try to send raw evidence to the contest request",
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
              evidenceRefs: ["self:npc-key"],
            },
          },
        ],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_fact_ref",
        path: "requestedTools.0.input.evidenceRefs.0",
      }),
    );
  });

  it("rejects tools not exposed by the actor frame", () => {
    const validation = validateActorDecisionPacket({
      frame,
      packet: {
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

  it("rejects flattened runtime tool args instead of interpreting them as input", () => {
    const validation = validateActorDecisionPacket({
      frame,
      packet: {
        citedFactIds: ["self:npc-key"],
        intent: "log an overheard procedural detail",
        beliefUpdates: [{
          category: "suspicion",
          update: "The watcher privately marks the player's timing.",
        }],
        planUpdates: [{
          category: "continued",
          update: "Hold the current watch posture.",
        }],
        requestedTools: [
          {
            toolName: "log_event",
            purpose: "record a visible witness beat",
            input: "The witness heard wardens discuss courier delays.",
            text: "The witness heard wardens discuss courier delays.",
            importance: 3,
            participants: ["Watcher"],
            durability: "scene_local",
          } as never,
        ],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_shape",
        path: "requestedTools.0.input",
      }),
    );
  });

  it("rejects move_to requests that omit targetLocationName", () => {
    const validation = validateActorDecisionPacket({
      frame,
      packet: {
        citedFactIds: ["self:npc-key", "move:loc-b"],
        intent: "move to the connected station",
        requestedTools: [
          {
            toolName: "move_to",
            purpose: "Watcher leaves for Station B",
            input: { destination: "Station B" },
          },
        ],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_shape",
        path: "requestedTools.0.input.targetLocationName",
      }),
    );
  });

  it("requires a concrete no-action reason when no tools are requested", () => {
    const validation = validateActorDecisionPacket({
      frame,
      packet: {
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

  it("rejects model-supplied actorId because the backend binds the observer", () => {
    const validation = validateActorDecisionPacket({
      frame,
      packet: {
        actorId: "npc-key",
        citedFactIds: ["f1"],
        intent: "try to bind the actor manually",
        requestedTools: [],
        noActionReason: "no grounded move",
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_shape",
        path: "(root)",
      }),
    );
  });
});
