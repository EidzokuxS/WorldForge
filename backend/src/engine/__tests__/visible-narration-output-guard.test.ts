import { describe, expect, it, vi } from "vitest";

import type { NarratorPacket } from "../narrator-packet.js";
import {
  validateVisibleNarrationAgainstPacket,
  runVisibleNarrationWithPacketGuard,
  VISIBLE_NARRATION_PACKET_GUARD_RETRY_LIMIT,
  VisibleNarrationPacketGuardError,
} from "../visible-narration-output-guard.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const activeNpcId = "22222222-2222-4222-8222-222222222222";
const hiddenNpcId = "44444444-4444-4444-8444-444444444444";
const eventId = "55555555-5555-4555-8555-555555555555";

function createPacket(): NarratorPacket {
  return {
    campaignId: "campaign-1",
    tick: 9,
    playerAction: "I wait by the gate.",
    oracleOutcome: "weak_hit",
    anchorEvent: {
      id: eventId,
      actorId: playerId,
      kind: "player_action",
      summary: "The player waits by the gate.",
      perceivableByPlayer: true,
    },
    perceivableEvents: [
      {
        id: eventId,
        actorId: playerId,
        kind: "player_action",
        summary: "The player waits by the gate.",
        perceivableByPlayer: true,
      },
    ],
    perceivableResponses: [],
    perceivableEffects: [],
    visibleActors: [
      {
        id: playerId,
        label: "Player",
        type: "player",
      },
      {
        id: activeNpcId,
        label: "Gate Captain",
        type: "npc",
      },
    ],
    hintSignals: ["A bowstring creaks somewhere out of sight."],
    guardrails: ["Do not reveal identities behind hint signals."],
    controlReturnReason: "Return control after the immediate response.",
    allowedVisibleActorNames: ["Player", "Gate Captain"],
    forbiddenActorNames: ["Hidden Archer"],
    forbiddenFactMarkers: [`hidden-actor:${hiddenNpcId}`],
    forbiddenPrivateTerms: ["Forest Outpost"],
    canonicalTurnPacket: {
      campaignId: "campaign-1",
      tick: 9,
      playerAction: "I wait by the gate.",
      oracleOutcome: "weak_hit",
      narratorFacts: {
        anchorEventId: eventId,
        eventIds: [eventId],
        responseIds: [],
        actionIds: [],
        toolResultRefs: [],
      },
      anchorEvent: {
        id: eventId,
        actorId: playerId,
        kind: "player_action",
        summary: "The player waits by the gate.",
        perceivableByPlayer: true,
      },
      events: [],
      responses: [],
      effects: [],
      actionResults: [],
      guardrails: ["Do not reveal identities behind hint signals."],
      controlReturnReason: "Return control after the immediate response.",
    },
  };
}

describe("visible narration output guard", () => {
  it("detects forbidden actor names and forbidden fact markers in buffered narration", () => {
    const packet = createPacket();

    expect(
      validateVisibleNarrationAgainstPacket({
        packet,
        text: "The Hidden Archer shifts behind the wall.",
      }),
    ).toMatchObject({
      ok: false,
      violations: [{ kind: "forbiddenActorName", term: "Hidden Archer" }],
    });

    expect(
      validateVisibleNarrationAgainstPacket({
        packet,
        text: `A backend marker leaked: hidden-actor:${hiddenNpcId}`,
      }),
    ).toMatchObject({
      ok: false,
      violations: [
        { kind: "forbiddenFactMarker", term: `hidden-actor:${hiddenNpcId}` },
      ],
    });

    expect(
      validateVisibleNarrationAgainstPacket({
        packet,
        text: "Forest Outpost sends a private signal into the scene.",
      }),
    ).toMatchObject({
      ok: false,
      violations: [{ kind: "forbiddenPrivateTerm", term: "Forest Outpost" }],
    });
  });

  it("forbidden Storyteller output retries once with generic guard addendum", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> =
      [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });

      if (attempt === 1) {
        return "The Hidden Archer watches from the parapet.";
      }

      return "The captain's gaze flicks to the dark parapet.";
    });

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    });

    expect(VISIBLE_NARRATION_PACKET_GUARD_RETRY_LIMIT).toBe(1);
    expect(generateNarration).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      text: "The captain's gaze flicks to the dark parapet.",
      attempts: 2,
      retried: true,
    });
    expect(attempts[1]?.guardAddendum).toContain("visible packet");
    expect(attempts[1]?.guardAddendum).not.toContain("Hidden Archer");
    expect(attempts[1]?.guardAddendum).not.toContain(
      `hidden-actor:${hiddenNpcId}`,
    );
  });

  it("empty Storyteller output retries with playable narration addendum", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> =
      [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });

      if (attempt === 1) {
        return "   ";
      }

      return "The captain waits by the gate, palm resting near the latch.";
    });

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    });

    expect(generateNarration).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      text: "The captain waits by the gate, palm resting near the latch.",
      attempts: 2,
      retried: true,
    });
    expect(attempts[1]?.guardAddendum).toContain("previous output was empty");
    expect(attempts[1]?.guardAddendum).toContain("playable next moment");
  });

  it("second forbidden Storyteller output throws before appendChatMessages", async () => {
    const packet = createPacket();

    const appendChatMessages = vi.fn();

    await expect(
      runVisibleNarrationWithPacketGuard({
        packet,
        generateNarration: vi.fn(() => "The Hidden Archer stays named."),
      }),
    ).rejects.toBeInstanceOf(VisibleNarrationPacketGuardError);
    expect(appendChatMessages).not.toHaveBeenCalled();
  });

  it("keeps final narration non-streaming and buffered so no SSE narrative event can emit before validation", async () => {
    const packet = createPacket();
    const emittedEvents: string[] = [];

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration: async () => {
        emittedEvents.push("model-buffer-ready");
        return "The captain waits, and the wall remains dark.";
      },
    });

    expect(emittedEvents).toEqual(["model-buffer-ready"]);
    expect(emittedEvents).not.toContain("narrative");
    expect(emittedEvents).not.toContain("SSE");
    expect(result.text).toBe("The captain waits, and the wall remains dark.");
  });
});
