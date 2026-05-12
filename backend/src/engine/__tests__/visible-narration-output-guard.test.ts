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

function invalidGeneratorOutput(value: unknown): NarrationDraft {
  return value as NarrationDraft;
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

  it("allows same-turn committed visible actor creation labels in final narration", () => {
    const packet = createPacket();
    packet.forbiddenActorNames = ["Exchange Validation Clerk"];
    packet.visibleActors.push({
      id: "actor-exchange-clerk",
      label: "Exchange Validation Clerk",
      type: "npc",
    });
    packet.perceivableEffects = [
      {
        id: "action-result:create-clerk",
        actorId: playerId,
        actionId: "create-clerk",
        toolName: "create_scene_extra",
        summary: "Exchange Validation Clerk becomes visibly present in the scene.",
        perceivableByPlayer: true,
        toolResult: {
          success: true,
          result: {
            id: "actor-exchange-clerk",
            name: "Exchange Validation Clerk",
          },
        },
      },
    ];
    packet.canonicalTurnPacket = {
      ...packet.canonicalTurnPacket,
      narratorFacts: {
        ...packet.canonicalTurnPacket.narratorFacts,
        actionIds: ["create-clerk"],
        toolResultRefs: [{ actionId: "create-clerk", toolName: "create_scene_extra" }],
      },
      actionResults: [
        {
          order: 1,
          actionId: "create-clerk",
          actionRef: "tool-call-1",
          actorId: playerId,
          toolName: "create_scene_extra",
          input: { name: "Exchange Validation Clerk" },
          args: { name: "Exchange Validation Clerk" },
          result: {
            success: true,
            result: {
              id: "actor-exchange-clerk",
              name: "Exchange Validation Clerk",
            },
          },
          summary: "Exchange Validation Clerk becomes visibly present in the scene.",
        },
      ],
    };
    const prose = "The Exchange Validation Clerk slides the form back across the counter.";
    const draft = createGroundedDraft({
      prose,
      claims: [{
        id: "claim-visible-clerk",
        kind: "playable_beat",
        summary: "The newly visible clerk returns the form.",
        requiresEvidence: false,
        evidenceRefs: [],
      }],
      claimSpans: [{
        id: "span-visible-clerk",
        spanText: prose,
        claimIds: ["claim-visible-clerk"],
        requiresEvidence: false,
      }],
    });

    expect(
      validateVisibleNarrationAgainstPacket({
        packet,
        text: prose,
        draft,
      }),
    ).toMatchObject({
      ok: true,
      violations: [],
    });

    packet.forbiddenActorNames.push("Hidden Archer");
    expect(
      validateVisibleNarrationAgainstPacket({
        packet,
        text: `${prose} The Hidden Archer waits unseen.`,
      }),
    ).toMatchObject({
      ok: false,
      violations: [{ kind: "forbiddenActorName", term: "Hidden Archer" }],
    });
  });

  it("rejects same-turn committed visible actor creation label substrings", () => {
    const packet = createPacket();
    packet.forbiddenActorNames = ["Validation Clerk"];
    packet.visibleActors.push({
      id: "actor-exchange-clerk",
      label: "Exchange Validation Clerk",
      type: "npc",
    });
    packet.perceivableEffects = [
      {
        id: "action-result:create-clerk",
        actorId: playerId,
        actionId: "create-clerk",
        toolName: "create_scene_extra",
        summary: "Exchange Validation Clerk becomes visibly present in the scene.",
        perceivableByPlayer: true,
        toolResult: {
          success: true,
          result: {
            id: "actor-exchange-clerk",
            name: "Exchange Validation Clerk",
          },
        },
      },
    ];
    packet.canonicalTurnPacket = {
      ...packet.canonicalTurnPacket,
      narratorFacts: {
        ...packet.canonicalTurnPacket.narratorFacts,
        actionIds: ["create-clerk"],
        toolResultRefs: [{ actionId: "create-clerk", toolName: "create_scene_extra" }],
      },
      actionResults: [
        {
          order: 1,
          actionId: "create-clerk",
          actionRef: "tool-call-1",
          actorId: playerId,
          toolName: "create_scene_extra",
          input: { name: "Exchange Validation Clerk" },
          args: { name: "Exchange Validation Clerk" },
          result: {
            success: true,
            result: {
              id: "actor-exchange-clerk",
              name: "Exchange Validation Clerk",
            },
          },
          summary: "Exchange Validation Clerk becomes visibly present in the scene.",
        },
      ],
    };

    expect(
      validateVisibleNarrationAgainstPacket({
        packet,
        text: "The Exchange Validation Clerk slides the form back across the counter.",
      }),
    ).toMatchObject({
      ok: false,
      violations: [{ kind: "forbiddenActorName", term: "Validation Clerk" }],
    });
  });

  it("rejects forbidden private terms embedded in same-turn visible actor labels", () => {
    const packet = createPacket();
    packet.forbiddenActorNames = ["Forest Outpost Clerk"];
    packet.forbiddenPrivateTerms = ["Forest Outpost"];
    packet.visibleActors.push({
      id: "actor-forest-clerk",
      label: "Forest Outpost Clerk",
      type: "npc",
    });
    packet.perceivableEffects = [
      {
        id: "action-result:create-clerk",
        actorId: playerId,
        actionId: "create-clerk",
        toolName: "create_scene_extra",
        summary: "Forest Outpost Clerk becomes visibly present in the scene.",
        perceivableByPlayer: true,
        toolResult: {
          success: true,
          result: {
            id: "actor-forest-clerk",
            name: "Forest Outpost Clerk",
          },
        },
      },
    ];
    packet.canonicalTurnPacket = {
      ...packet.canonicalTurnPacket,
      narratorFacts: {
        ...packet.canonicalTurnPacket.narratorFacts,
        actionIds: ["create-clerk"],
        toolResultRefs: [{ actionId: "create-clerk", toolName: "create_scene_extra" }],
      },
      actionResults: [
        {
          order: 1,
          actionId: "create-clerk",
          actionRef: "tool-call-1",
          actorId: playerId,
          toolName: "create_scene_extra",
          input: { name: "Forest Outpost Clerk" },
          args: { name: "Forest Outpost Clerk" },
          result: {
            success: true,
            result: {
              id: "actor-forest-clerk",
              name: "Forest Outpost Clerk",
            },
          },
          summary: "Forest Outpost Clerk becomes visibly present in the scene.",
        },
      ],
    };

    expect(
      validateVisibleNarrationAgainstPacket({
        packet,
        text: "The Forest Outpost Clerk slides the form back across the counter.",
      }),
    ).toMatchObject({
      ok: false,
      violations: [{ kind: "forbiddenPrivateTerm", term: "Forest Outpost" }],
    });
  });

  it("forbidden Storyteller output fails closed without guard repair", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> =
      [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });
      return createGroundedDraft({
        prose: "The Hidden Archer watches from the parapet.",
        claimSpans: [
          {
            id: "span-hidden-archer",
            spanText: "The Hidden Archer watches from the parapet.",
            claimIds: ["claim-bridge-bell"],
            requiresEvidence: true,
          },
        ],
      });
    });

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toMatchObject({
      attempts: 1,
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "forbiddenActorName", term: "Hidden Archer" }),
      ]),
    });

    expect(VISIBLE_NARRATION_PACKET_GUARD_RETRY_LIMIT).toBe(0);
    expect(generateNarration).toHaveBeenCalledTimes(1);
    expect(attempts).toEqual([{ attempt: 1, guardAddendum: null }]);
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
      return createGroundedDraft({
        prose: "The Hidden Archer names the Forest Outpost and proposal-secret-vault.",
      });
    });

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
      onUnsafeAttempt: ({ validation }) => {
        diagnostics.push(JSON.stringify(validation.diagnostics));
      },
    })).rejects.toBeInstanceOf(VisibleNarrationPacketGuardError);

    expect(generateNarration).toHaveBeenCalledTimes(1);
    expect(attempts).toEqual([{ attempt: 1, guardAddendum: null }]);
    expect(diagnostics[0]).toContain("\"uncommittedProposalCount\":2");
    expect(diagnostics[0]).not.toContain("Hidden Archer");
    expect(diagnostics[0]).not.toContain("Forest Outpost");
    expect(diagnostics[0]).not.toContain(
      `hidden-actor:${hiddenNpcId}`,
    );
    expect(diagnostics[0]).not.toContain(
      "proposal-secret-vault",
    );
  });

  it("empty Storyteller output fails closed without playable narration repair", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> =
      [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });
      return invalidGeneratorOutput("   ");
    });

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toMatchObject({
      attempts: 1,
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "emptyNarration" }),
        expect.objectContaining({ kind: "invalidNarrationDraft" }),
      ]),
    });

    expect(generateNarration).toHaveBeenCalledTimes(1);
    expect(attempts).toEqual([{ attempt: 1, guardAddendum: null }]);
  });

  it("accepts short safe structured narration without soft retry preference", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });
      return createThinGroundedDraft();
    });

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    });

    expect(generateNarration).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      text: "Gate holds.",
      attempts: 1,
      retried: false,
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
    expect(attempts).toEqual([{ attempt: 1, guardAddendum: null }]);
  });

  it("returns accepted draft prose exactly without trimming", async () => {
    const packet = createPacket();
    packet.evidenceLedger = undefined;
    const output = "\n  The captain waits by the gate.  \n";

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration: vi.fn(() => ({
        prose: output,
        claims: [{
          id: "claim-playable",
          kind: "playable_beat",
          summary: "The scene returns control on a playable next moment.",
          requiresEvidence: false,
          evidenceRefs: [],
        }],
        claimSpans: [{
          id: "span-playable",
          spanText: output,
          claimIds: ["claim-playable"],
          requiresEvidence: false,
        }],
      } as NarrationDraft)),
    });

    expect(result.retried).toBe(false);
    expect(result.text).toBe(output);
  });

  it("accepts a native structured NarrationDraft object without prose fallback parsing", async () => {
    const packet = createPacket();
    const draft = createGroundedDraft();

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration: vi.fn(() => draft),
    });

    expect(result.retried).toBe(false);
    expect(result.text).toBe(draft.prose);
    expect(result.draft).toEqual(draft);
  });

  it("runs literal and empty packet checks before grounding diagnostics and fails closed", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });
      return createGroundedDraft({
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
      });
    });

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toMatchObject({
      attempts: 1,
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "forbiddenActorName" }),
        expect.objectContaining({ kind: "forbiddenPrivateTerm" }),
      ]),
    });

    expect(generateNarration).toHaveBeenCalledTimes(1);
    expect(attempts).toEqual([{ attempt: 1, guardAddendum: null }]);
  });

  it("rejects r17-style draft metadata instead of locally assigning evidence", async () => {
    const packet = createPacket();
    const prose = "The Gate Captain lowers his voice: the bridge bell will ring soon.";
    const generateNarration = vi
      .fn()
      .mockReturnValue(createGroundedDraft({
        prose,
        claims: [
          {
            id: "claim-bridge-bell",
            kind: "future_pressure",
            summary: "The bridge bell creates near-future pressure.",
            requiresEvidence: true,
            evidenceRefs: ["unknown-ledger-ref"],
          },
        ],
        claimSpans: [
          {
            id: "span-bridge-bell",
            spanText: "a warning that is not copied from prose",
            claimIds: ["claim-bridge-bell"],
            requiresEvidence: true,
          },
        ],
      }));

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toMatchObject({
      attempts: 1,
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "grounding" }),
      ]),
    });

    expect(generateNarration).toHaveBeenCalledTimes(1);
  });

  it("does not auto-fill evidence refs for unsupported structured grounding", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });
      return createGroundedDraft({
        claims: [
          {
            id: "claim-unsupported",
            kind: "future_pressure",
            summary: "Unsupported pressure near the gate.",
            requiresEvidence: true,
            evidenceRefs: [],
          },
        ],
      });
    });

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toMatchObject({
      attempts: 1,
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "grounding" }),
      ]),
    });

    expect(generateNarration).toHaveBeenCalledTimes(1);
    expect(attempts[0]?.guardAddendum).toBeNull();
  });

  it("rejects omitted evidence-backed claim metadata after retry instead of synthesizing claims", async () => {
    const packet = createPacket();
    const generateNarration = vi
      .fn()
      .mockReturnValue(createGroundedDraft({
        claims: [],
        claimSpans: [
          {
            id: "span-bridge-bell",
            spanText: "the bridge bell will ring soon",
            claimIds: [],
            requiresEvidence: true,
          },
        ],
      }));

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toMatchObject({
      attempts: 1,
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "grounding" }),
      ]),
    });

    expect(generateNarration).toHaveBeenCalledTimes(1);
  });

  it("reports safe grounding subtype diagnostics during direct validation", async () => {
    const packet = createPacket();
    const draft = createGroundedDraft({
      claims: [],
      claimSpans: [
        {
          id: "span-Forest-Outpost-private",
          spanText: "the bridge bell will ring soon",
          claimIds: [],
          requiresEvidence: true,
        },
      ],
    });

    const validation = validateVisibleNarrationAgainstPacket({
      packet,
      text: draft.prose,
      draft,
    });
    const diagnostics = JSON.stringify(validation.diagnostics);

    expect(diagnostics).toContain("\"grounding\"");
    expect(diagnostics).toContain("\"uncovered_claim_span\"");
    expect(diagnostics).toContain("\"unsupported\":1");
    expect(diagnostics).not.toContain("Forest Outpost");
    expect(diagnostics).not.toContain("span-Forest-Outpost-private");
  });

  it("does not repair forbidden private term leaks even when metadata is repairable", async () => {
    const packet = createPacket();
    const leakedDraft = createGroundedDraft({
      prose: "The Gate Captain names the Forest Outpost while the bridge bell will ring soon.",
      claims: [
        {
          id: "claim-bridge-bell",
          kind: "future_pressure",
          summary: "The bridge bell creates near-future pressure.",
          requiresEvidence: true,
          evidenceRefs: ["unknown-ledger-ref"],
        },
      ],
      claimSpans: [
        {
          id: "span-bridge-bell",
          spanText: "a warning that is not copied from prose",
          claimIds: ["claim-bridge-bell"],
          requiresEvidence: true,
        },
      ],
    });
    const generateNarration = vi.fn(() => leakedDraft);

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toMatchObject({
      attempts: 1,
      violations: expect.arrayContaining([
        expect.objectContaining({
          kind: "forbiddenPrivateTerm",
          term: "Forest Outpost",
        }),
      ]),
    });

    expect(generateNarration).toHaveBeenCalledTimes(1);
  });

  it("second forbidden Storyteller output throws before appendChatMessages", async () => {
    const packet = createPacket();

    const appendChatMessages = vi.fn();
    const generateNarration = vi.fn(() => createGroundedDraft({
      prose: "The Hidden Archer stays named.",
      claimSpans: [
        {
          id: "span-hidden-archer",
          spanText: "The Hidden Archer stays named.",
          claimIds: ["claim-bridge-bell"],
          requiresEvidence: true,
        },
      ],
    }));

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
      attempts: 1,
      violations: expect.arrayContaining([
        expect.objectContaining({
          kind: "forbiddenActorName",
          term: "Hidden Archer",
        }),
      ]),
    });
    expect(generateNarration).toHaveBeenCalledTimes(1);
    expect(appendChatMessages).not.toHaveBeenCalled();
  });

  it("rejects non-JSON packet narration instead of accepting plain prose", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });
      return invalidGeneratorOutput("The captain waits, and the wall remains dark.");
    });

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toMatchObject({
      attempts: 1,
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "invalidNarrationDraft" }),
      ]),
    });

    expect(attempts).toEqual([{ attempt: 1, guardAddendum: null }]);
    expect(generateNarration).toHaveBeenCalledTimes(1);
  });

  it("throws immediately when packet narration never returns a grounded structured draft", async () => {
    const packet = createPacket();
    const generateNarration = vi.fn(() =>
      invalidGeneratorOutput("The captain waits, and the wall remains dark."),
    );

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toMatchObject({
      attempts: 1,
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "invalidNarrationDraft" }),
      ]),
    });

    expect(generateNarration).toHaveBeenCalledTimes(1);
  });

  it("does not synthesize fallback prose from packet evidence when drafts are invalid", async () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "oracle_outcome:oracle-outcome",
        category: "oracle_outcome",
        summary: "miss",
        sourceId: "oracle-outcome",
      },
      {
        id: "perceivable_response:station-attendant",
        category: "perceivable_response",
        summary: [
          "Tiamat response: environment.",
          "Station Attendant becomes visibly present in the scene.",
        ].join(" "),
        sourceId: "station-attendant",
      },
      {
        id: "perceivable_response:no-mutation",
        category: "perceivable_response",
        summary: "GM no-mutation direction: The attendant would be confused by cursed-object phrasing.",
        sourceId: "no-mutation",
      },
      {
        id: "perceivable_effect:internal-intent",
        category: "perceivable_effect",
        summary: "e2518725-f973-4b6e-9d57-cf2c91cd2fa4 records an unconfirmed intent or claim about a safe-looking person.",
        sourceId: "internal-intent",
      },
    ];
    const generateNarration = vi.fn(() =>
      invalidGeneratorOutput("The captain waits, and the wall remains dark."),
    );

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toBeInstanceOf(VisibleNarrationPacketGuardError);

    expect(generateNarration).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed draft JSON instead of falling back to raw text", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });
      return invalidGeneratorOutput('{"prose":"The captain waits", "claims": [');
    });

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toMatchObject({
      attempts: 1,
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "invalidNarrationDraft" }),
      ]),
    });

    expect(attempts).toEqual([{ attempt: 1, guardAddendum: null }]);
  });

  it("still requires a grounded structured draft when a packet has no evidenceLedger", async () => {
    const packet = createPacket();
    packet.evidenceLedger = undefined;

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration: vi.fn(() =>
        invalidGeneratorOutput("The captain waits, and the wall remains dark."),
      ),
    })).rejects.toMatchObject({
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "invalidNarrationDraft" }),
      ]),
    });
  });

  it("accepts a valid no-ledger NarrationDraft with non-evidence playable beat", async () => {
    const packet = createPacket();
    packet.evidenceLedger = undefined;

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration: vi.fn(() => ({
        prose: "The gate remains quiet enough for your next move.",
        claims: [{
          id: "claim-playable",
          kind: "playable_beat",
          summary: "The scene returns control on a playable next moment.",
          requiresEvidence: false,
          evidenceRefs: [],
        }],
        claimSpans: [{
          id: "span-playable",
          spanText: "The gate remains quiet enough for your next move.",
          claimIds: ["claim-playable"],
          requiresEvidence: false,
        }],
      } as NarrationDraft)),
    });

    expect(result.retried).toBe(false);
    expect(result.text).toBe("The gate remains quiet enough for your next move.");
    expect(result.draft.prose).toBe(result.text);
  });

  it("does not invent evidence refs when a packet has no evidenceLedger", async () => {
    const packet = createPacket();
    packet.evidenceLedger = undefined;
    const generateNarration = vi.fn(() => createGroundedDraft({
      claims: [
        {
          id: "claim-bridge-bell",
          kind: "future_pressure",
          summary: "The bridge bell creates near-future pressure.",
          requiresEvidence: true,
          evidenceRefs: [],
        },
      ],
      claimSpans: [
        {
          id: "span-bridge-bell",
          spanText: "not copied from prose",
          claimIds: ["claim-bridge-bell"],
          requiresEvidence: true,
        },
      ],
    }));

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toMatchObject({
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "grounding" }),
      ]),
    });

    expect(generateNarration).toHaveBeenCalledTimes(1);
  });

  it("rejects fenced JSON and arbitrary wrapper text for the strict NarrationDraft contract", async () => {
    const packet = createPacket();
    const draft = createGroundedDraft();

    const fenced = [
      "```json",
      JSON.stringify(draft),
      "```",
    ].join("\n");

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration: vi.fn(() => invalidGeneratorOutput(fenced)),
    })).rejects.toMatchObject({
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "invalidNarrationDraft" }),
      ]),
    });

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration: vi.fn(() =>
        invalidGeneratorOutput(`Here is the JSON:\n${JSON.stringify(draft)}`),
      ),
    })).rejects.toMatchObject({
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "invalidNarrationDraft" }),
      ]),
    });
  });

  it("rejects native draft objects with unknown claim kinds at runtime", async () => {
    const packet = createPacket();
    const attempts: Array<{ attempt: number; guardAddendum: string | null }> = [];
    const generateNarration = vi.fn(({ attempt, guardAddendum }) => {
      attempts.push({ attempt, guardAddendum });
      return invalidGeneratorOutput({
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
    });

    await expect(runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration,
    })).rejects.toMatchObject({
      attempts: 1,
      violations: expect.arrayContaining([
        expect.objectContaining({ kind: "invalidNarrationDraft" }),
      ]),
    });

    expect(attempts).toEqual([{ attempt: 1, guardAddendum: null }]);
  });

  it("keeps final narration non-streaming and buffered so no SSE narrative event can emit before validation", async () => {
    const packet = createPacket();
    const emittedEvents: string[] = [];

    const result = await runVisibleNarrationWithPacketGuard({
      packet,
      generateNarration: async () => {
        emittedEvents.push("model-buffer-ready");
        return createGroundedDraft();
      },
    });

    expect(emittedEvents).toEqual(["model-buffer-ready"]);
    expect(emittedEvents).not.toContain("narrative");
    expect(emittedEvents).not.toContain("SSE");
    expect(result.text).toBe("The Gate Captain lowers his voice: the bridge bell will ring soon.");
  });
});
