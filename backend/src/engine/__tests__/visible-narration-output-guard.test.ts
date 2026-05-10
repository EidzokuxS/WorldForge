import { describe, expect, it, vi } from "vitest";

import type { NarratorPacket } from "../narrator-packet.js";
import type { NarrationDraft } from "../narration-grounding-guard.js";
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
    evidenceLedger: [
      {
        id: "perceivable_response:response-pressure",
        category: "perceivable_response",
        summary: "The Gate Captain warns that the bridge bell will ring soon.",
        sourceId: "response-pressure",
      },
    ],
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

function createGroundedDraft(overrides: Partial<NarrationDraft> = {}): NarrationDraft {
  return {
    prose: "The Gate Captain lowers his voice: the bridge bell will ring soon.",
    claims: [
      {
        id: "claim-bridge-bell",
        kind: "future_pressure",
        summary: "The bridge bell creates near-future pressure.",
        requiresEvidence: true,
        evidenceRefs: ["perceivable_response:response-pressure"],
      },
    ],
    claimSpans: [
      {
        id: "span-bridge-bell",
        spanText: "the bridge bell will ring soon",
        claimIds: ["claim-bridge-bell"],
        requiresEvidence: true,
      },
    ],
    ...overrides,
  };
}

function createThinGroundedDraft(overrides: Partial<NarrationDraft> = {}): NarrationDraft {
  return {
    prose: "Gate holds.",
    claims: [
      {
        id: "claim-gate-holds",
        kind: "playable_beat",
        summary: "The gate holds as the visible playable beat.",
        requiresEvidence: false,
        evidenceRefs: [],
      },
    ],
    claimSpans: [
      {
        id: "span-gate-holds",
        spanText: "Gate holds.",
        claimIds: ["claim-gate-holds"],
        requiresEvidence: false,
      },
    ],
    ...overrides,
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

      return JSON.stringify(createGroundedDraft());
    });

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    });

    expect(VISIBLE_NARRATION_PACKET_GUARD_RETRY_LIMIT).toBe(1);
    expect(generateNarration).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      text: "The Gate Captain lowers his voice: the bridge bell will ring soon.",
      attempts: 2,
      retried: true,
    });
    expect(attempts[1]?.guardAddendum).toContain("visible packet");
    expect(attempts[1]?.guardAddendum).not.toContain("Hidden Archer");
    expect(attempts[1]?.guardAddendum).not.toContain(
      `hidden-actor:${hiddenNpcId}`,
    );
  });

  it("reports safe redaction audit diagnostics without hidden terms or proposal text", async () => {
    const packet = createPacket();
    packet.redactionAudit = {
      hiddenEventCount: 1,
      hiddenResponseCount: 1,
      failedEffectCount: 1,
      unreferencedEffectCount: 1,
      hiddenEffectCount: 1,
      privateActorNameCount: 1,
      forbiddenFactMarkerCount: 1,
      forbiddenPrivateTermCount: 1,
      uncommittedProposalCount: 2,
      retainedSourceRefCount: 3,
      retainedEvidenceCount: 3,
      excludedReasons: {
        hidden_event: 1,
        hidden_response: 1,
        failed_effect: 1,
        unreferenced_effect: 1,
        hidden_effect: 1,
        private_actor_name: 1,
        forbidden_fact_marker: 1,
        forbidden_private_term: 1,
        uncommitted_proposal: 2,
      },
    };
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const diagnostics: string[] = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });
      return attempt === 1
        ? JSON.stringify(createGroundedDraft({
            prose: "The Hidden Archer names the Forest Outpost and proposal-secret-vault.",
          }))
        : JSON.stringify(createGroundedDraft());
    });

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
      onUnsafeAttempt: ({ validation }) => {
        diagnostics.push(JSON.stringify(validation.diagnostics));
      },
    });

    expect(result.retried).toBe(true);
    expect(attempts[1]?.guardAddendum).toContain("Safe redaction audit categories");
    expect(attempts[1]?.guardAddendum).toContain("forbiddenActorName");
    expect(attempts[1]?.guardAddendum).toContain("uncommittedProposalCount=2");
    expect(diagnostics[0]).toContain("\"uncommittedProposalCount\":2");
    expect(`${attempts[1]?.guardAddendum}\n${diagnostics[0]}`).not.toContain("Hidden Archer");
    expect(`${attempts[1]?.guardAddendum}\n${diagnostics[0]}`).not.toContain("Forest Outpost");
    expect(`${attempts[1]?.guardAddendum}\n${diagnostics[0]}`).not.toContain(
      `hidden-actor:${hiddenNpcId}`,
    );
    expect(`${attempts[1]?.guardAddendum}\n${diagnostics[0]}`).not.toContain(
      "proposal-secret-vault",
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

      return JSON.stringify(createGroundedDraft());
    });

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    });

    expect(generateNarration).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      text: "The Gate Captain lowers his voice: the bridge bell will ring soon.",
      attempts: 2,
      retried: true,
    });
    expect(attempts[1]?.guardAddendum).toContain("previous output was empty");
    expect(attempts[1]?.guardAddendum).toContain("playable next moment");
  });

  it("accepts short safe structured narration after one soft retry preference", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });
      return JSON.stringify(createThinGroundedDraft());
    });

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    });

    expect(generateNarration).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      text: "Gate holds.",
      attempts: 2,
      retried: true,
      validation: {
        ok: true,
        violations: [],
        warnings: [{ kind: "thinNarration", term: "thin visible narration" }],
      },
    });
    expect(result.validation.grounding).toMatchObject({
      ok: true,
      violations: [],
      warnings: [{ kind: "thin_prose" }],
    });
    expect(attempts[1]?.guardAddendum).toContain("previous output was too thin");
  });

  it("returns accepted plain prose exactly without trimming", async () => {
    const packet = createPacket();
    packet.evidenceLedger = undefined;
    const output = "\n  The captain waits by the gate.  \n";

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration: vi.fn(() => output),
    });

    expect(result.retried).toBe(false);
    expect(result.text).toBe(output);
  });

  it("runs literal and empty packet checks before structured grounding repair", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });

      if (attempt === 1) {
        return JSON.stringify(createGroundedDraft({
          prose: "The Hidden Archer names the Forest Outpost.",
          claims: [
            {
              id: "claim-unsupported",
              kind: "future_pressure",
              summary: "Unsupported pressure.",
              requiresEvidence: true,
              evidenceRefs: [],
            },
          ],
        }));
      }

      return JSON.stringify(createGroundedDraft());
    });

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    });

    expect(result.text).toBe("The Gate Captain lowers his voice: the bridge bell will ring soon.");
    expect(attempts[1]?.guardAddendum).toContain("visible packet");
    expect(attempts[1]?.guardAddendum).not.toContain("claim-unsupported");
    expect(attempts[1]?.guardAddendum).not.toContain("Hidden Archer");
    expect(attempts[1]?.guardAddendum).not.toContain("Forest Outpost");
  });

  it("repairs unsupported structured grounding without leaking private terms", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });

      if (attempt === 1) {
        return JSON.stringify(createGroundedDraft({
          claims: [
            {
              id: "claim-unsupported",
              kind: "future_pressure",
              summary: "Unsupported pressure near the gate.",
              requiresEvidence: true,
              evidenceRefs: [],
            },
          ],
        }));
      }

      return JSON.stringify(createGroundedDraft());
    });

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    });

    expect(result.retried).toBe(true);
    expect(result.text).toBe("The Gate Captain lowers his voice: the bridge bell will ring soon.");
    expect(attempts[1]?.guardAddendum).toContain("an evidence-required claim lacks evidenceRefs");
    expect(attempts[1]?.guardAddendum).not.toContain("claim-unsupported");
    expect(attempts[1]?.guardAddendum).not.toContain("Forest Outpost");
    expect(attempts[1]?.guardAddendum).not.toContain("Hidden Archer");
    expect(attempts[1]?.guardAddendum).not.toContain(`hidden-actor:${hiddenNpcId}`);
  });

  it("repairs unsupported claimSpan coverage omitted from claims", async () => {
    const packet = createPacket();
    const generateNarration = vi
      .fn()
      .mockReturnValueOnce(JSON.stringify(createGroundedDraft({
        claims: [],
        claimSpans: [
          {
            id: "span-bridge-bell",
            spanText: "the bridge bell will ring soon",
            claimIds: [],
            requiresEvidence: true,
          },
        ],
      })))
      .mockReturnValueOnce(JSON.stringify(createGroundedDraft()));

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    });

    expect(result.retried).toBe(true);
    expect(result.validation.grounding?.ok).toBe(true);
    expect(generateNarration).toHaveBeenCalledTimes(2);
  });

  it("second forbidden Storyteller output throws before appendChatMessages", async () => {
    const packet = createPacket();

    const appendChatMessages = vi.fn();
    const generateNarration = vi.fn(() => "The Hidden Archer stays named.");

    let thrown: unknown;
    try {
      await runVisibleNarrationWithPacketGuard({
        packet,
        generateNarration,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(VisibleNarrationPacketGuardError);
    expect(thrown).toMatchObject({
      attempts: 2,
      violations: expect.arrayContaining([
        expect.objectContaining({
          kind: "forbiddenActorName",
          term: "Hidden Archer",
        }),
      ]),
    });
    expect(generateNarration).toHaveBeenCalledTimes(2);
    expect(appendChatMessages).not.toHaveBeenCalled();
  });

  it("repairs non-JSON packet narration instead of accepting plain prose", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });
      return attempt === 1
        ? "The captain waits, and the wall remains dark."
        : JSON.stringify(createGroundedDraft());
    });

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    });

    expect(result.retried).toBe(true);
    expect(result.text).toBe("The Gate Captain lowers his voice: the bridge bell will ring soon.");
    expect(attempts[1]?.guardAddendum).toContain("valid NarrationDraft JSON object");
    expect(generateNarration).toHaveBeenCalledTimes(2);
  });

  it("repairs malformed draft JSON instead of falling back to raw text", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });
      return attempt === 1
        ? '{"prose":"The captain waits", "claims": ['
        : JSON.stringify(createGroundedDraft());
    });

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    });

    expect(result.retried).toBe(true);
    expect(result.text).toBe("The Gate Captain lowers his voice: the bridge bell will ring soon.");
    expect(attempts[1]?.guardAddendum).toContain("valid NarrationDraft JSON object");
  });

  it("preserves legacy plain prose behavior when no evidence ledger contract is present", async () => {
    const packet = createPacket();
    packet.evidenceLedger = undefined;

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration: vi.fn(() => "The captain waits, and the wall remains dark."),
    });

    expect(result.retried).toBe(false);
    expect(result.text).toBe("The captain waits, and the wall remains dark.");
  });

  it("rejects malformed draft JSON and unknown claim kinds at runtime", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });

      if (attempt === 1) {
        return JSON.stringify({
          ...createGroundedDraft(),
          claims: [
            {
              id: "claim-bad-kind",
              kind: "private_lore_dump",
              summary: "Invalid claim kind.",
              requiresEvidence: false,
              evidenceRefs: [],
            },
          ],
        });
      }

      return JSON.stringify(createGroundedDraft());
    });

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    });

    expect(result.retried).toBe(true);
    expect(attempts[1]?.guardAddendum).toContain("valid NarrationDraft JSON object");
    expect(attempts[1]?.guardAddendum).not.toContain("claim-bad-kind");
  });

  it("keeps final narration non-streaming and buffered so no SSE narrative event can emit before validation", async () => {
    const packet = createPacket();
    const emittedEvents: string[] = [];

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration: async () => {
        emittedEvents.push("model-buffer-ready");
        return JSON.stringify(createGroundedDraft());
      },
    });

    expect(emittedEvents).toEqual(["model-buffer-ready"]);
    expect(emittedEvents).not.toContain("narrative");
    expect(emittedEvents).not.toContain("SSE");
    expect(result.text).toBe("The Gate Captain lowers his voice: the bridge bell will ring soon.");
  });
});
