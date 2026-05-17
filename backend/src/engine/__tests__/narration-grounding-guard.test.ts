import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { NarratorPacket } from "../narrator-packet.js";
import {
  buildGroundedSentenceDraftRepairAddendum,
  compileGroundedSentenceDraftToNarrationDraft,
  formatAllowedCitationEvidenceRef,
  getAllowedNarrationCitationEvidenceRefs,
  GROUNDED_SENTENCE_DRAFT_EVIDENCE_REF_MAX,
  GROUNDED_SENTENCE_DRAFT_TEXT_MAX_LENGTH,
  groundedSentenceDraftSchema,
  isNarrationDraftCitationEvidence,
  validateNarrationDraftGrounding,
  type NarrationDraft,
} from "../narration-grounding-guard.js";

function createPacket(): NarratorPacket {
  return {
    campaignId: "campaign-1",
    tick: 14,
    playerAction: "I wait at the ledger counter.",
    oracleOutcome: "weak_hit",
    anchorEvent: {
      id: "event-player-waits",
      actorId: "player-1",
      kind: "player_action",
      summary: "Iria waits at the ledger counter.",
      perceivableByPlayer: true,
    },
    perceivableEvents: [],
    perceivableResponses: [
      {
        id: "response-clerk-warning",
        actorId: "npc-clerk",
        responseKind: "spoken",
        eventId: "event-player-waits",
        summary: "The clerk warns that the inspector is due before dusk.",
        visibleToPlayer: true,
      },
    ],
    perceivableEffects: [
      {
        id: "effect-pressure-clock",
        actionId: "action-log-pressure",
        actorId: "npc-clerk",
        toolName: "log_event",
        summary:
          "The inspection pressure and proof requirement are logged as future-relevant counter procedure.",
        perceivableByPlayer: true,
        toolResult: { success: true, result: { eventId: "event-pressure-clock" } },
      },
    ],
    visibleActors: [
      { id: "player-1", label: "Iria", type: "player" },
      { id: "npc-clerk", label: "Ledger Clerk", type: "npc" },
    ],
    hintSignals: [],
    evidenceLedger: [
      {
        id: "perceivable_response:response-clerk-warning",
        category: "perceivable_response",
        summary: "The clerk warns that the inspector is due before dusk.",
        sourceId: "response-clerk-warning",
      },
      {
        id: "perceivable_effect:effect-pressure-clock",
        category: "perceivable_effect",
        summary:
          "The inspection pressure and proof requirement are logged as future-relevant counter procedure.",
        sourceId: "effect-pressure-clock",
        claimSupport: ["future_pressure", "playable_beat"],
      },
      {
        id: "tool_result:action-log-pressure:log_event",
        category: "tool_result",
        summary: "log_event result is player-perceivable through effect effect-pressure-clock.",
        sourceId: "action-log-pressure:log_event",
      },
    ],
    guardrails: ["Stay within packet evidence."],
    controlReturnReason: "Return control at the counter.",
    allowedVisibleActorNames: ["Iria", "Ledger Clerk"],
    forbiddenActorNames: [],
    forbiddenFactMarkers: [],
    forbiddenPrivateTerms: [],
    canonicalTurnPacket: {
      campaignId: "campaign-1",
      tick: 14,
      playerAction: "I wait at the ledger counter.",
      oracleOutcome: "weak_hit",
      narratorFacts: {
        anchorEventId: "event-player-waits",
        eventIds: [],
        responseIds: ["response-clerk-warning"],
        actionIds: ["action-log-pressure"],
        toolResultRefs: [{ actionId: "action-log-pressure", toolName: "log_event" }],
      },
      anchorEvent: {
        id: "event-player-waits",
        actorId: "player-1",
        kind: "player_action",
        summary: "Iria waits at the ledger counter.",
        perceivableByPlayer: true,
      },
      events: [],
      responses: [],
      effects: [],
      actionResults: [],
      guardrails: ["Stay within packet evidence."],
      controlReturnReason: "Return control at the counter.",
    },
  };
}

function supportedFuturePressureDraft(): NarrationDraft {
  return {
    prose: "The clerk lowers his voice: the inspector is due before dusk, and the counter goes still.",
    claims: [
      {
        id: "claim-inspector-pressure",
        kind: "future_pressure",
        summary: "The inspector's due arrival creates immediate visible pressure.",
        requiresEvidence: true,
        evidenceRefs: [
          "perceivable_response:response-clerk-warning",
          "perceivable_effect:effect-pressure-clock",
        ],
      },
    ],
    claimSpans: [
      {
        id: "span-inspector-pressure",
        spanText: "the inspector is due before dusk",
        claimIds: ["claim-inspector-pressure"],
        requiresEvidence: true,
      },
      {
        id: "span-atmosphere",
        spanText: "the counter goes still",
        claimIds: [],
        requiresEvidence: false,
      },
    ],
  };
}

describe("grounded sentence draft compiler", () => {
  it("rejects backend metadata and runtime tool names in visible sentence text", () => {
    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet: createPacket(),
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The find_location_candidates sweep returns nothing at the counter.",
              evidenceRefs: ["e2"],
            },
          ],
        },
      }),
    ).toThrow(/backend metadata/);
  });

  it("compiles grounded sentences into exact NarrationDraft claims and spans", () => {
    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet: createPacket(),
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
            {
              text: "The clerk lowers his voice: the inspector is due before dusk.",
            evidenceRefs: ["e1", "e2"],
            },
            {
              text: "The counter goes still around the visible pressure.",
            evidenceRefs: ["e2"],
            },
        ],
      },
    });

    expect(draft.prose).toBe(
      "The clerk lowers his voice: the inspector is due before dusk. The counter goes still around the visible pressure.",
    );
    expect(draft.claims).toEqual([
      expect.objectContaining({
        id: "c1",
        kind: "future_pressure",
        summary: "The clerk lowers his voice: the inspector is due before dusk.",
        requiresEvidence: true,
        evidenceRefs: [
          "perceivable_response:response-clerk-warning",
          "perceivable_effect:effect-pressure-clock",
        ],
      }),
      expect.objectContaining({
        id: "c2",
        kind: "future_pressure",
        summary: "The counter goes still around the visible pressure.",
        requiresEvidence: true,
        evidenceRefs: ["perceivable_effect:effect-pressure-clock"],
      }),
    ]);
    expect(draft.claimSpans).toEqual([
      {
        id: "s1",
        spanText: "The clerk lowers his voice: the inspector is due before dusk.",
        claimIds: ["c1"],
        requiresEvidence: true,
      },
      {
        id: "s2",
        spanText: "The counter goes still around the visible pressure.",
        claimIds: ["c2"],
        requiresEvidence: true,
      },
    ]);
  });

  it("rejects raw evidence ids from model-facing grounded sentence drafts", () => {
    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet: createPacket(),
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The clerk lowers his voice as the counter pressure tightens.",
              evidenceRefs: ["perceivable_effect:effect-pressure-clock"],
            },
          ],
        },
      }),
    ).toThrow(/unknown or disallowed evidence ref/u);
  });

  it("accepts short packet evidence refs and canonicalizes them before validation", () => {
    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet: createPacket(),
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "The clerk lowers his voice: the inspector is due before dusk.",
            evidenceRefs: ["e1", "e2"],
          },
        ],
      },
    });

    expect(draft.claims[0]).toMatchObject({
      kind: "future_pressure",
      evidenceRefs: [
        "perceivable_response:response-clerk-warning",
        "perceivable_effect:effect-pressure-clock",
      ],
    });
  });

  it("rejects overflowed valid short packet evidence refs at schema validation", () => {
    const packet = createPacket();
    packet.evidenceLedger = Array.from({ length: 6 }, (_, index) => ({
      id: `perceivable_effect:effect-${index + 1}`,
      category: "perceivable_effect" as const,
      summary: `Visible settled effect ${index + 1}.`,
      sourceId: `effect-${index + 1}`,
      claimSupport: ["playable_beat"],
    }));

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The visible effects stack into one playable beat.",
              evidenceRefs: ["e1", "e2", "e2", "e3", "e4", "e5", "e6"],
            },
          ],
        },
      }),
    ).toThrow();

    expect(groundedSentenceDraftSchema.safeParse({
      version: "grounded-sentence-draft.v2",
      sentences: [
        {
          text: "The visible effects stack into one playable beat.",
          evidenceRefs: ["e1", "e2", "e3", "e4", "e5"],
        },
      ],
    }).success).toBe(false);

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "The visible effects stack into one playable beat.",
            evidenceRefs: ["e1", "e2", "e3", "e4"],
          },
        ],
      },
    });

    expect(draft.claims[0]?.evidenceRefs).toEqual([
      "perceivable_effect:effect-1",
      "perceivable_effect:effect-2",
      "perceivable_effect:effect-3",
      "perceivable_effect:effect-4",
    ]);
    expect(draft.claims[0]?.evidenceRefs).toHaveLength(
      GROUNDED_SENTENCE_DRAFT_EVIDENCE_REF_MAX,
    );
  });

  it("rejects raw uuid-like evidence typos instead of making the model copy database ids", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "visible_actor:c9a49759-0041-4f3f-9c32-57f19cd4279e",
        category: "visible_actor",
        summary: "Ilyra Vale is present in the market.",
        sourceId: "c9a49759-0041-4f3f-9c32-57f19cd4279e",
        summaryBackendFact: true,
      },
    ];

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "Ilyra is the only visible person taking stock of the market.",
              evidenceRefs: ["visible_actor:c9a49759-0041-4f3f-9c32-57d19cd4279e"],
            },
          ],
        },
      }),
    ).toThrow(/unknown or disallowed evidence ref/u);

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "Ilyra is the only visible person taking stock of the market.",
            evidenceRefs: ["e1"],
          },
        ],
      },
    });

    expect(draft.claims[0]?.evidenceRefs).toEqual([
      "visible_actor:c9a49759-0041-4f3f-9c32-57f19cd4279e",
    ]);
  });

  it("derives claim kind from allowed backend evidence support", () => {
    const noKindDraft = compileGroundedSentenceDraftToNarrationDraft({
      packet: createPacket(),
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "The counter goes still around the visible pressure.",
            evidenceRefs: ["e2"],
          },
        ],
      },
    });

    expect(noKindDraft.claims[0]).toMatchObject({
      kind: "future_pressure",
      evidenceRefs: ["perceivable_effect:effect-pressure-clock"],
    });

    const genericResponseDraft = compileGroundedSentenceDraftToNarrationDraft({
      packet: createPacket(),
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "The clerk points you back to the route desk.",
            evidenceRefs: ["e1"],
          },
        ],
      },
    });

    expect(genericResponseDraft.claims[0]).toMatchObject({
      kind: "playable_beat",
      evidenceRefs: ["perceivable_response:response-clerk-warning"],
    });

    expect(
      groundedSentenceDraftSchema.safeParse({
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "The clerk points you back to the route desk.",
            kind: "status_answer",
            evidenceRefs: ["perceivable_response:response-clerk-warning"],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts dense but grounded NPC answers without forcing a fallback path", () => {
    const denseAnswer = [
      "The clerk answers in a low voice that the wardens want the sealed lacquer message matched against the rainproof ledger,",
      "the courier route logbook opened to the last authorized canal mark,",
      "and the satchel kept visible on the counter while they check whether Mira's name, seal, and lantern tally line up with the night dispatch list.",
      "He adds that a missing mark will not prove guilt, but it will keep the boat tied until a route officer signs the exception.",
    ].join(" ");

    expect(denseAnswer.length).toBeGreaterThan(360);
    expect(denseAnswer.length).toBeLessThan(GROUNDED_SENTENCE_DRAFT_TEXT_MAX_LENGTH);
    expect(
      groundedSentenceDraftSchema.safeParse({
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: denseAnswer,
            evidenceRefs: ["perceivable_effect:effect-pressure-clock"],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      groundedSentenceDraftSchema.safeParse({
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "x".repeat(GROUNDED_SENTENCE_DRAFT_TEXT_MAX_LENGTH + 1),
            evidenceRefs: ["perceivable_effect:effect-pressure-clock"],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      groundedSentenceDraftSchema.safeParse({
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "The clerk points to every posted proof at once.",
            evidenceRefs: [
              "perceivable_effect:effect-pressure-clock",
              "perceivable_response:response-clerk-warning",
              "current_inventory_status:item-satchel",
              "committed_event:event-player-waits",
            ],
          },
        ],
      }).success,
    ).toBe(true);
    expect(GROUNDED_SENTENCE_DRAFT_EVIDENCE_REF_MAX).toBe(4);

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet: createPacket(),
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: denseAnswer,
            evidenceRefs: ["e2"],
          },
        ],
      },
    });

    expect(draft.prose).toBe(denseAnswer);
    expect(draft.claims[0]).toMatchObject({
      kind: "future_pressure",
      summary: denseAnswer,
      evidenceRefs: ["perceivable_effect:effect-pressure-clock"],
    });
  });

  it("derives only generic playable beats from no-mutation NPC response evidence", () => {
    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet: createPacket(),
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text:
              "The authority requires a seal-verified transit chit, guild waiver, or signal-house dispatch authorisation.",
            evidenceRefs: ["e1"],
          },
        ],
      },
    });

    expect(draft.claims[0]).toMatchObject({
      kind: "playable_beat",
      evidenceRefs: ["perceivable_response:response-clerk-warning"],
    });
  });

  it("rejects kind in the live v2 schema instead of trusting model-authored classification", () => {
    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet: createPacket(),
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text:
                "The authority requires a seal-verified transit chit, guild waiver, or signal-house dispatch authorisation.",
              kind: "future_pressure",
              evidenceRefs: ["perceivable_response:response-clerk-warning"],
            },
          ],
        },
      }),
    ).toThrow();
  });

  it("rejects unknown or empty evidence refs before packet guard", () => {
    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet: createPacket(),
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The clerk points to an unsupported registry seal.",
              evidenceRefs: ["unknown-ledger-ref"],
            },
          ],
        },
      }),
    ).toThrow(/unknown or disallowed evidence ref/u);

    expect(
      groundedSentenceDraftSchema.safeParse({
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "The clerk says nothing.",
            evidenceRefs: [],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects overflowed drafts when no evidence ref is allowed", () => {
    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet: createPacket(),
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The counter claims unsupported facts anyway.",
              evidenceRefs: ["missing-1", "missing-2", "missing-3", "missing-4"],
            },
          ],
        },
      }),
    ).toThrow("unknown or disallowed evidence ref");
  });

  it("rejects player_action_request as sole support for durable world claims", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "player_action_request:event-player-waits",
        category: "player_action_request",
        summary: "The player claims they pass the sealed gate.",
      },
    ];

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The sealed gate opens for you.",
              evidenceRefs: ["player_action_request:event-player-waits"],
            },
          ],
        },
      }),
    ).toThrow(/unknown or disallowed evidence ref/u);
  });

  it("rejects the anchor player action committed_event as proof of future pressure", () => {
    const packet = createPacket();
    packet.anchorEvent = {
      ...packet.anchorEvent,
      id: "event-player-waits",
      summary: "Player action request: I watch whether the wardens change procedure.",
    };
    packet.evidenceLedger = [
      {
        id: "committed_event:event-player-waits",
        category: "committed_event",
        summary: "Player action request: I watch whether the wardens change procedure.",
        sourceId: "event-player-waits",
      },
      {
        id: "perceivable_effect:effect-observed-wardens",
        category: "perceivable_effect",
        summary: "The wardens continue holding the same line and make no public announcement.",
        sourceId: "effect-observed-wardens",
        claimSupport: ["future_pressure"],
      },
    ];

    expect(isNarrationDraftCitationEvidence(packet.evidenceLedger[0]!, packet)).toBe(false);
    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The wardens' public procedure does not shift yet.",
              evidenceRefs: ["committed_event:event-player-waits"],
            },
          ],
        },
      }),
    ).toThrow(/unknown or disallowed evidence ref/u);

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "The wardens' public procedure does not shift yet.",
            evidenceRefs: ["e1"],
          },
        ],
      },
    });

    expect(draft.claims[0]).toMatchObject({
      kind: "future_pressure",
      evidenceRefs: ["perceivable_effect:effect-observed-wardens"],
    });
  });

  it("builds grounded sentence repair addenda with only citation evidence", () => {
    const packet = createPacket();
    packet.anchorEvent = {
      ...packet.anchorEvent,
      id: "event-player-waits",
      summary: "Player action request: I wait.",
    };
    packet.evidenceLedger = [
      {
        id: "player_action_request:player-action",
        category: "player_action_request",
        summary: "I wait.",
        sourceId: "player-action",
      },
      {
        id: "anchor_event:event-player-waits",
        category: "anchor_event",
        summary: "Player action request: I wait.",
        sourceId: "event-player-waits",
      },
      {
        id: "committed_event:event-player-waits",
        category: "committed_event",
        summary: "Player action request: I wait.",
        sourceId: "event-player-waits",
      },
      {
        id: "perceivable_effect:effect-pressure-clock",
        category: "perceivable_effect",
        summary: "The visible pressure clock remains active.",
        sourceId: "effect-pressure-clock",
      },
      {
        id: "control_return:current",
        category: "control_return",
        summary: "Return control.",
        sourceId: "current",
      },
    ];

    const addendum = buildGroundedSentenceDraftRepairAddendum({
      packet,
      failureReason:
        "GroundedSentenceDraft sentence 4 lacks future_pressure support beyond player_action_request.",
    });

    expect(addendum).toContain("Previous validation failure");
    expect(addendum).toContain("Return 1-5 sentence objects total; never return 6 or more.");
    expect(addendum).toContain("HARD CAP: evidenceRefs.length MUST be <= 4");
    expect(addendum).toContain("cite only the strongest 1-4 short refs");
    expect(addendum).toContain("- e1 [category=perceivable_effect]");
    expect(addendum).not.toContain("perceivable_effect:effect-pressure-clock");
    expect(addendum).not.toContain("player_action_request:player-action");
    expect(addendum).not.toContain("anchor_event:event-player-waits");
    expect(addendum).not.toContain("committed_event:event-player-waits");
    expect(addendum).not.toContain("control_return:current");
  });

  it("requires the settled NPC answer evidence for procedural route or access status", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "player_action_request:player-action",
        category: "player_action_request",
        summary: "The player asks which proof is required for passage.",
        sourceId: "player-action",
      },
      {
        id: "perceivable_effect:warden-proof-requirements",
        category: "perceivable_effect",
        summary:
          "The Lead Warden states a Warden-issued transit permit or a Guild Warden patron reference will satisfy the checkpoint requirement.",
        sourceId: "warden-proof-requirements",
        claimSupport: ["route_status"],
      },
    ];

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text:
                "The Lead Warden gives you two legal ways through the checkpoint: a transit permit or a patron reference.",
              evidenceRefs: ["player_action_request:player-action"],
            },
          ],
        },
      }),
    ).toThrow(/unknown or disallowed evidence ref/u);

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text:
              "The Lead Warden gives you two legal ways through the checkpoint: a transit permit or a patron reference.",
            evidenceRefs: ["e1"],
          },
        ],
      },
    });

    expect(draft.claims[0]).toMatchObject({
      kind: "route_status",
      evidenceRefs: ["perceivable_effect:warden-proof-requirements"],
    });
  });

  it("rejects quoted procedural details that are not supported by the cited settled evidence", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "committed_event:procedure-answer",
        category: "committed_event",
        summary:
          "Watchmaster Brasswick says the Concord clerk is at the Outer Registry in the tribunal east wing. Quote: \"East wing, Outer Registry — that's where the Concord clerk takes standing petitions. Head the phrasing 'Petition for Standing Before the Tripoint Border Concord' or the desk will hand it straight back. It needs a seal — bond-witness or station officer, either suffices. Desk shuts at the second bell.\"",
        sourceId: "procedure-answer",
        claimSupport: ["route_status", "playable_beat"],
      },
    ];

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text:
                "Brasswick says, 'The phrasing must open with \"In matter of standing, petitioner requests\" and the desk closes at the tenth bell.'",
              evidenceRefs: ["e1"],
            },
          ],
        },
      }),
    ).toThrow("quoted precision text not supported");

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text:
                "Brasswick says the standing petition desk closes at the tenth bell.",
              evidenceRefs: ["e1"],
            },
          ],
        },
      }),
    ).toThrow("precision tokens not supported");
  });

  it("accepts quoted procedural details copied from the cited settled evidence", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "committed_event:procedure-answer",
        category: "committed_event",
        summary:
          "Watchmaster Brasswick says the Concord clerk is at the Outer Registry in the tribunal east wing. Quote: \"East wing, Outer Registry — that's where the Concord clerk takes standing petitions. Head the phrasing 'Petition for Standing Before the Tripoint Border Concord' or the desk will hand it straight back. It needs a seal — bond-witness or station officer, either suffices. Desk shuts at the second bell.\"",
        sourceId: "procedure-answer",
        claimSupport: ["route_status", "playable_beat"],
      },
    ];

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text:
              "Brasswick names the filing line as 'Petition for Standing Before the Tripoint Border Concord' and warns that the desk shuts at the second bell.",
            evidenceRefs: ["e1"],
          },
        ],
      },
    });

    expect(draft.prose).toContain("Petition for Standing Before the Tripoint Border Concord");
    expect(draft.prose).toContain("second bell");
  });

  it("rejects final NarrationDraft precision fact drift before visible narration can return", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "perceivable_effect:dialogue-outcome-1",
        category: "perceivable_effect",
        summary:
          "Watchmaster Brasswick gives route timing and tribunal approach guidance.",
        sourceId: "dialogue-outcome-1",
        claimSupport: ["route_status", "playable_beat"],
        precisionFacts: [
          {
            kind: "claim",
            value:
              "Second bell has not yet passed; it is still early-to-mid afternoon, giving Iri time to reach the tribunal today.",
            sourcePath: "claims.0.summary",
            claimKind: "route_status",
            polarity: "states",
            exhaustive: true,
          },
          {
            kind: "claim",
            value:
              "The safest route is the east aqueduct maintenance catwalk south along the channel, then the stone causeway approach to the tribunal east wing, avoiding the central channel where treaty-leaf discharge concentrates.",
            sourcePath: "claims.1.summary",
            claimKind: "route_status",
            polarity: "allows",
            exhaustive: true,
          },
        ],
      },
    ];
    const draft: NarrationDraft = {
      prose:
        "Brasswick says second bell passed an hour ago, and the aqueduct service walk under the southern arch past the cistern grates stays clear of the worst treaty-leaf drift.",
      claims: [
        {
          id: "c1",
          kind: "route_status",
          summary: "Brasswick gives route timing and tribunal approach guidance.",
          requiresEvidence: true,
          evidenceRefs: ["perceivable_effect:dialogue-outcome-1"],
        },
      ],
      claimSpans: [
        {
          id: "s1",
          spanText:
            "Brasswick says second bell passed an hour ago, and the aqueduct service walk under the southern arch past the cistern grates stays clear of the worst treaty-leaf drift.",
          claimIds: ["c1"],
          requiresEvidence: true,
        },
      ],
    };

    const result = validateNarrationDraftGrounding({ packet, draft });

    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        kind: "precision_fact_drift",
        spanId: "s1",
      }),
    );
  });

  it("allows generic paraphrase while rejecting changed precision fact values", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "perceivable_effect:procedure-answer",
        category: "perceivable_effect",
        summary: "Watchmaster Brasswick gives filing requirements for the Concord clerk.",
        sourceId: "procedure-answer",
        claimSupport: ["route_status", "playable_beat"],
        precisionFacts: [
          {
            kind: "claim",
            value:
              "Standing petitions must open with the formal phrase 'Petition for Standing Before the Tripoint Border Concord' to be accepted at the desk.",
            sourcePath: "claims.0.summary",
            claimKind: "requirement",
            polarity: "requires",
            exhaustive: true,
          },
          {
            kind: "claim",
            value:
              "The petition must carry a seal from a bond-witness or station officer to pass desk review.",
            sourcePath: "claims.1.summary",
            claimKind: "requirement",
            polarity: "requires",
            exhaustive: true,
          },
          {
            kind: "claim",
            value:
              "The standing petition desk closes at the second bell each day, and queues form early.",
            sourcePath: "claims.2.summary",
            claimKind: "requirement",
            polarity: "states",
            exhaustive: true,
          },
        ],
      },
    ];

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text:
                "The clerk says the phrase is In matter of standing petitioner requests, requiring a provincial seal or bond-witness before the tenth bell.",
              evidenceRefs: ["e1"],
            },
          ],
        },
      }),
    ).toThrow("precision_fact_drift");

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text:
              "Brasswick gives Iri the exact petition title, proof requirement, and closing deadline, leaving her with a concrete filing errand.",
            evidenceRefs: ["e1"],
          },
        ],
      },
    });

    expect(draft.prose).toContain("concrete filing errand");
  });

  it("expands backend-owned precision placeholders before compiling visible prose", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "perceivable_effect:procedure-answer",
        category: "perceivable_effect",
        summary: "Watchmaster Brasswick gives filing requirements for the Concord clerk.",
        sourceId: "procedure-answer",
        claimSupport: ["route_status", "playable_beat"],
        precisionFacts: [
          {
            kind: "claim",
            value:
              "Standing petitions must open with the formal phrase 'Petition for Standing Before the Tripoint Border Concord' to be accepted at the desk.",
            sourcePath: "claims.0.summary",
            claimKind: "requirement",
            polarity: "requires",
            exhaustive: true,
          },
        ],
      },
    ];

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "Brasswick locks the filing rule down: [[fact:e1.p1]]",
            evidenceRefs: ["e1"],
          },
        ],
      },
    });

    expect(draft.prose).toBe(
      "Brasswick locks the filing rule down: Standing petitions must open with the formal phrase 'Petition for Standing Before the Tripoint Border Concord' to be accepted at the desk.",
    );
    expect(draft.prose).not.toContain("[[fact:");
  });

  it("keeps support-only subject precision facts out of backend placeholder expansion", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "perceivable_effect:dialogue-answer",
        category: "perceivable_effect",
        summary:
          "Dialogue outcome: outcome=answered; topic=proof; Claims: route_status/states subject=canal approach | requirement/requires subject=tariff stamp",
        sourceId: "dialogue-answer",
        summaryBackendFact: false,
        precisionFacts: [
          {
            kind: "quote",
            value: "\"Take the canal north and show the tariff stamp at Tower Bridge.\"",
            sourcePath: "quote",
            exhaustive: true,
          },
          {
            kind: "subject",
            value: "canal approach to Tower Bridge Concourse",
            sourcePath: "claims.0.subjectText",
            claimKind: "route_status",
            polarity: "states",
            exhaustive: false,
          },
          {
            kind: "subject",
            value: "Warden transit permit with current tariff stamp",
            sourcePath: "claims.1.subjectText",
            claimKind: "requirement",
            polarity: "requires",
            exhaustive: false,
          },
        ],
      },
    ];

    const formatted = formatAllowedCitationEvidenceRef({
      refId: "e1",
      evidence: packet.evidenceLedger[0]!,
    }, []);

    expect(formatted).toContain("e1.p1 quote");
    expect(formatted).toContain("supportOnly subject/states");
    expect(formatted).toContain("supportOnly subject/requires");
    expect(formatted).not.toContain("e1.p2 supportOnly");
    expect(formatted).not.toContain("e1.p3 supportOnly");
    expect(formatted).toContain("backendFacts=e1.p1 quote");
    expect(formatted).not.toContain("backendFacts=e1.p1 quote: \"Take the canal north and show the tariff stamp at Tower Bridge.\" | e1.p2");

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      requireBackendOwnedFactText: true,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "[[fact:e1.p1]]",
            evidenceRefs: ["e1"],
          },
        ],
      },
    });

    expect(draft.prose).toBe("\"Take the canal north and show the tariff stamp at Tower Bridge.\"");

    const factRefDraft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      requireBackendOwnedFactText: true,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            factRefs: ["e1.p1"],
            evidenceRefs: ["e1"],
          },
        ],
      },
    });

    expect(factRefDraft.prose).toBe("\"Take the canal north and show the tariff stamp at Tower Bridge.\"");

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        requireBackendOwnedFactText: true,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              factRefs: ["e1.p1"],
              evidenceRefs: [],
            },
          ],
        },
      }),
    ).toThrow();

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        requireBackendOwnedFactText: true,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "[[fact:e1.p1]]",
              factRefs: ["e1.p1"],
              evidenceRefs: ["e1"],
            },
          ],
        },
      }),
    ).toThrow("exactly one of text or factRefs");

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        requireBackendOwnedFactText: true,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              factRefs: ["e1.p1"],
              evidenceRefs: ["e1"],
            },
            {
              factRefs: ["e1.p1"],
              evidenceRefs: ["e1"],
            },
          ],
        },
      }),
    ).toThrow("repeats backend fact ref");

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        requireBackendOwnedFactText: true,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "[[fact:e1.p2]] and [[fact:e1.p3]].",
              evidenceRefs: ["e1"],
            },
          ],
        },
      }),
    ).toThrow("unknown backend fact placeholder");
  });

  it("keeps support-only evidence summaries out of backend placeholder expansion", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "visible_actor:npc-warden",
        category: "visible_actor",
        summary: "Lead Warden",
        sourceId: "npc-warden",
      },
      {
        id: "tool_result:action-move:move_to",
        category: "tool_result",
        summary: "The accepted action result supports this player-perceivable effect: You arrive at Night Courier Depot.",
        sourceId: "action-move:move_to",
      },
      {
        id: "perceivable_effect:effect-move",
        category: "perceivable_effect",
        summary: "Player moves to Night Courier Depot.",
        sourceId: "effect-move",
        summaryBackendFact: false,
        precisionFacts: [
          {
            kind: "summary",
            value: "You arrive at Night Courier Depot.",
            sourcePath: "toolResult.result.locationName",
            claimKind: "location_change",
            exhaustive: true,
          },
        ],
      },
    ];

    const visibleActorLine = formatAllowedCitationEvidenceRef({
      refId: "e1",
      evidence: packet.evidenceLedger[0]!,
    }, []);
    const toolResultLine = formatAllowedCitationEvidenceRef({
      refId: "e2",
      evidence: packet.evidenceLedger[1]!,
    }, []);
    const effectLine = formatAllowedCitationEvidenceRef({
      refId: "e3",
      evidence: packet.evidenceLedger[2]!,
    }, []);

    expect(visibleActorLine).not.toContain("backendFacts=");
    expect(toolResultLine).not.toContain("backendFacts=");
    expect(effectLine).toContain("summary=Player moves to Night Courier Depot.");
    expect(effectLine).not.toContain("e3.s1");
    expect(effectLine).toContain("backendFacts=e3.p1 summary: You arrive at Night Courier Depot.");

    expect(getAllowedNarrationCitationEvidenceRefs(packet).map((entry) => ({
      refId: entry.refId,
      category: entry.evidence.category,
      summary: entry.evidence.summary,
    }))).toEqual([
      {
        refId: "e1",
        category: "perceivable_effect",
        summary: "Player moves to Night Courier Depot.",
      },
    ]);

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        requireBackendOwnedFactText: true,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "[[fact:e1.s1]]",
              evidenceRefs: ["e1"],
            },
          ],
        },
      }),
    ).toThrow("unknown backend fact placeholder");

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        requireBackendOwnedFactText: true,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "[[fact:e1.s1]]",
              evidenceRefs: ["visible_actor:npc-warden"],
            },
          ],
        },
      }),
    ).toThrow("unknown or disallowed evidence ref");

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        requireBackendOwnedFactText: true,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "[[fact:e2.s1]]",
              evidenceRefs: ["tool_result:action-move:move_to"],
            },
          ],
        },
      }),
    ).toThrow("unknown or disallowed evidence ref");

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      requireBackendOwnedFactText: true,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "[[fact:e1.p1]]",
            evidenceRefs: ["e1"],
          },
        ],
      },
    });

    expect(draft.prose).toBe("You arrive at Night Courier Depot.");
  });

  it("rejects backend fact placeholders that are unknown or not backed by cited evidence", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "perceivable_effect:procedure-answer",
        category: "perceivable_effect",
        summary: "Watchmaster Brasswick gives filing requirements for the Concord clerk.",
        sourceId: "procedure-answer",
        claimSupport: ["route_status", "playable_beat"],
        precisionFacts: [
          {
            kind: "claim",
            value: "The standing petition desk closes at the second bell each day.",
            sourcePath: "claims.0.summary",
            claimKind: "requirement",
            polarity: "states",
            exhaustive: true,
          },
        ],
      },
      {
        id: "perceivable_effect:route-answer",
        category: "perceivable_effect",
        summary: "Watchmaster Brasswick gives route guidance.",
        sourceId: "route-answer",
        claimSupport: ["route_status", "playable_beat"],
        precisionFacts: [
          {
            kind: "claim",
            value: "The safest route is the east maintenance catwalk south along the channel.",
            sourcePath: "claims.0.summary",
            claimKind: "route_status",
            polarity: "allows",
            exhaustive: true,
          },
        ],
      },
    ];

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The desk rule is [[fact:e9.p1]]",
              evidenceRefs: ["e1"],
            },
          ],
        },
      }),
    ).toThrow("unknown backend fact placeholder");

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The route is [[fact:e2.p1]]",
              evidenceRefs: ["e1"],
            },
          ],
        },
      }),
    ).toThrow("without citing its packet evidence ref");
  });

  it("enforces backend-owned fact placeholders in runtime final narration mode", () => {
    const packet = createPacket();

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      requireBackendOwnedFactText: true,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "[[fact:e1.s1]]",
            evidenceRefs: ["e1"],
          },
          {
            text: "[[fact:e2.s1]]",
            evidenceRefs: ["e2"],
          },
        ],
      },
    });

    expect(draft.prose).toBe(
      "The clerk warns that the inspector is due before dusk. The inspection pressure and proof requirement are logged as future-relevant counter procedure.",
    );

    const joinedDraft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      requireBackendOwnedFactText: true,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "[[fact:e1.s1]] and [[fact:e2.s1]].",
            evidenceRefs: ["e1", "e2"],
          },
        ],
      },
    });

    expect(joinedDraft.prose).toBe(
      "The clerk warns that the inspector is due before dusk. The inspection pressure and proof requirement are logged as future-relevant counter procedure.",
    );
  });

  it("rejects free factual prose in runtime final narration mode", () => {
    const packet = createPacket();

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        requireBackendOwnedFactText: true,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The clerk approves a sealed bridge pass.",
              evidenceRefs: ["e1"],
            },
          ],
        },
      }),
    ).toThrow("must include at least one backend-owned fact placeholder");

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        requireBackendOwnedFactText: true,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "[[fact:e1.s1]] A sealed bridge pass appears.",
              evidenceRefs: ["e1"],
            },
          ],
        },
      }),
    ).toThrow("factual text outside backend-owned fact placeholders");
  });

  it("rejects control-return-only support for grounded gameplay prose", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "control_return:current",
        category: "control_return",
        summary: "Return control on the next playable beat.",
      },
    ];

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The sealed gate opens for you.",
              evidenceRefs: ["control_return:current"],
            },
          ],
        },
      }),
    ).toThrow(/unknown or disallowed evidence ref/u);
  });

  it("rejects context refs even when mixed with valid citation evidence", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "control_return:current",
        category: "control_return",
        summary: "Return control on the next playable beat.",
      },
      {
        id: "perceivable_effect:effect-pressure-clock",
        category: "perceivable_effect",
        summary: "The visible pressure clock remains active.",
        sourceId: "effect-pressure-clock",
      },
    ];

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The visible pressure clock remains active.",
              evidenceRefs: [
                "control_return:current",
                "perceivable_effect:effect-pressure-clock",
              ],
            },
          ],
        },
      }),
    ).toThrow(/unknown or disallowed evidence ref/u);
  });

  it("supports static current inventory facts without treating them as inventory changes", () => {
    const packet = createPacket();
    packet.currentInventory = [
      {
        id: "current-inventory:item-satchel",
        itemId: "item-satchel",
        label: "Worn Leather Satchel",
        tags: ["pack"],
        equipState: "equipped",
        equippedSlot: "shoulder",
        isSignature: true,
      },
    ];
    packet.evidenceLedger = [
      {
        id: "current_inventory_status:item-satchel",
        category: "current_inventory_status",
        summary:
          "Worn Leather Satchel is equipped at the player's shoulder as a signature item. Visible marks/status: pack.",
        sourceId: "item-satchel",
        summaryBackendFact: true,
      },
    ];

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "Your worn leather satchel is still settled on your shoulder.",
            evidenceRefs: ["e1"],
          },
        ],
      },
    });

    expect(draft.claims[0]?.kind).toBe("inventory_status");
    expect(draft.claims[0]?.evidenceRefs).toEqual(["current_inventory_status:item-satchel"]);

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "You newly acquire the worn leather satchel.",
              kind: "inventory_status_change",
              evidenceRefs: ["e1"],
            },
          ],
        },
      }),
    ).toThrow();
  });

  it("rejects static inventory status backed only by the player's request", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "player_action_request:player-action",
        category: "player_action_request",
        summary: "The player asks what they are carrying.",
        sourceId: "player-action",
      },
    ];

    expect(() =>
      compileGroundedSentenceDraftToNarrationDraft({
        packet,
        draft: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "Your courier satchel hangs from your shoulder.",
              evidenceRefs: ["player_action_request:player-action"],
            },
          ],
        },
      }),
    ).toThrow(/unknown or disallowed evidence ref/u);
  });
});

describe("narration grounding guard", () => {
  it("passes supported future pressure claims with packet evidence refs", () => {
    const result = validateNarrationDraftGrounding({
      packet: createPacket(),
      draft: supportedFuturePressureDraft(),
    });

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.coverage).toContainEqual({
      spanId: "span-inspector-pressure",
      claimIds: ["claim-inspector-pressure"],
      covered: true,
      requiresEvidence: true,
    });
  });

  it("reports thin prose as a warning without failing grounding", () => {
    const draft = supportedFuturePressureDraft();
    draft.prose = "Clock waits.";
    draft.claims = [
      {
        id: "claim-clock-waits",
        kind: "playable_beat",
        summary: "The counter clock waits as a visible playable beat.",
        requiresEvidence: false,
        evidenceRefs: [],
      },
    ];
    draft.claimSpans = [
      {
        id: "span-clock-waits",
        spanText: "Clock waits.",
        claimIds: ["claim-clock-waits"],
        requiresEvidence: false,
      },
    ];

    const result = validateNarrationDraftGrounding({
      packet: createPacket(),
      draft,
    });

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.warnings).toContainEqual({ kind: "thin_prose" });
    expect(result.repairAddendum).toBeNull();
  });

  it("fails unsupported declared future pressure with structured repair instructions", () => {
    const draft = supportedFuturePressureDraft();
    draft.claims[0] = {
      ...draft.claims[0]!,
      evidenceRefs: [],
    };

    const result = validateNarrationDraftGrounding({
      packet: createPacket(),
      draft,
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        kind: "unsupported_claim",
        claimId: "claim-inspector-pressure",
        claimKind: "future_pressure",
      }),
    );
    expect(result.repairAddendum).toContain("[ALLOWED NARRATABLE PACKET EVIDENCE REFS]");
    expect(result.repairAddendum).toContain(
      "[category=perceivable_response]",
    );
    expect(result.repairAddendum).toContain(
      "summary=The clerk warns that the inspector is due before dusk.",
    );
    expect(result.repairAddendum).toContain("[GROUNDING DIAGNOSTICS]");
    expect(result.repairAddendum).toContain("kind=unsupported_claim");
    expect(result.repairAddendum).toContain("an evidence-required claim lacks evidenceRefs");
    expect(result.repairAddendum).not.toContain("claim-inspector-pressure");
  });

  it("requires observation evidence for observation-grounded status claims", () => {
    const packet = createPacket();
    packet.canonicalTurnPacket.turnResolution = {
      kind: "status_read",
      resolutionState: "observation_grounded",
      combatIntent: false,
      evidenceIds: ["action-result:scan-1"],
      consequenceIds: [],
      explicitNoCombatEvidenceIds: ["action-result:scan-1"],
      toolNames: ["list_visible_affordances"],
    };
    packet.evidenceLedger = [
      ...(packet.evidenceLedger ?? []),
      {
        id: "visible_actor:npc-clerk",
        category: "visible_actor",
        summary: "Ledger Clerk is present in the scene.",
        sourceId: "npc-clerk",
        summaryBackendFact: true,
      },
      {
        id: "observation_result:scan-1:a1",
        category: "observation_result",
        summary: "Ledger Clerk",
        sourceId: "scan-1",
        claimSupport: ["actor_presence", "playable_beat"],
      },
      {
        id: "observation_result:scan-1:a2",
        category: "observation_result",
        summary: "Counter Door",
        sourceId: "scan-1",
        claimSupport: ["route_status", "playable_beat"],
      },
    ];

    const withoutObservationRef: NarrationDraft = {
      prose: "The clerk remains the only clear official at the counter.",
      claims: [
        {
          id: "claim-status",
          kind: "actor_presence",
          summary: "The clerk is the visible official.",
          requiresEvidence: true,
          evidenceRefs: ["visible_actor:npc-clerk"],
        },
      ],
      claimSpans: [
        {
          id: "span-status",
          spanText: "The clerk remains the only clear official at the counter.",
          claimIds: ["claim-status"],
          requiresEvidence: true,
        },
      ],
    };

    expect(validateNarrationDraftGrounding({
      packet,
      draft: withoutObservationRef,
    })).toMatchObject({
      ok: false,
      violations: [expect.objectContaining({ kind: "missing_observation_ref" })],
    });

    const withObservationRef: NarrationDraft = {
      ...withoutObservationRef,
      claims: [
        {
          ...withoutObservationRef.claims[0]!,
          evidenceRefs: ["visible_actor:npc-clerk", "observation_result:scan-1:a1"],
        },
      ],
    };

    expect(validateNarrationDraftGrounding({
      packet,
      draft: withObservationRef,
    })).toMatchObject({
      ok: true,
    });

    const actorClaimWithRouteObservation: NarrationDraft = {
      ...withoutObservationRef,
      claims: [
        {
          ...withoutObservationRef.claims[0]!,
          evidenceRefs: ["visible_actor:npc-clerk", "observation_result:scan-1:a2"],
        },
      ],
    };

    expect(validateNarrationDraftGrounding({
      packet,
      draft: actorClaimWithRouteObservation,
    })).toMatchObject({
      ok: false,
      violations: [expect.objectContaining({ kind: "observation_claim_mismatch" })],
    });

    const routeClaimWithActorObservation: NarrationDraft = {
      prose: "The counter door remains the only clear route out of the room.",
      claims: [
        {
          id: "claim-route",
          kind: "route_status",
          summary: "The counter door is the visible route.",
          requiresEvidence: true,
          evidenceRefs: ["observation_result:scan-1:a1"],
        },
      ],
      claimSpans: [
        {
          id: "span-route",
          spanText: "The counter door remains the only clear route out of the room.",
          claimIds: ["claim-route"],
          requiresEvidence: true,
        },
      ],
    };

    expect(validateNarrationDraftGrounding({
      packet,
      draft: routeClaimWithActorObservation,
    })).toMatchObject({
      ok: false,
      violations: [expect.objectContaining({ kind: "observation_claim_mismatch" })],
    });
  });

  it("rejects legacy internal NarrationDraft claims that cite context-only refs", () => {
    const packet = createPacket();
    packet.evidenceLedger = [
      {
        id: "control_return:current",
        category: "control_return",
        summary: "Return control on the next playable beat.",
      },
      {
        id: "perceivable_effect:effect-pressure-clock",
        category: "perceivable_effect",
        summary: "The visible pressure clock remains active.",
        sourceId: "effect-pressure-clock",
      },
    ];

    const draft: NarrationDraft = {
      prose: "The visible pressure clock remains active.",
      claims: [
        {
          id: "claim-pressure-clock",
          kind: "playable_beat",
          summary: "The visible pressure clock remains active.",
          requiresEvidence: true,
          evidenceRefs: [
            "control_return:current",
            "perceivable_effect:effect-pressure-clock",
          ],
        },
      ],
      claimSpans: [
        {
          id: "span-pressure-clock",
          spanText: "The visible pressure clock remains active.",
          claimIds: ["claim-pressure-clock"],
          requiresEvidence: true,
        },
      ],
    };

    const result = validateNarrationDraftGrounding({ packet, draft });

    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        kind: "disallowed_evidence_ref",
        missingEvidenceRefs: ["control_return:current"],
      }),
    );
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: "unsupported_claim_span" }),
    );
  });

  it("redacts forbidden packet terms from grounding repair evidence summaries", () => {
    const packet = createPacket();
    packet.forbiddenPrivateTerms = ["Forest Outpost"];
    packet.evidenceLedger = [
      {
        id: "perceivable_effect:private-summary",
        category: "perceivable_effect",
        summary: "Forest Outpost pressure is visible at the counter.",
        sourceId: "private-summary",
      },
    ];
    const draft = supportedFuturePressureDraft();
    draft.claims[0] = {
      ...draft.claims[0]!,
      evidenceRefs: [],
    };

    const result = validateNarrationDraftGrounding({
      packet,
      draft,
    });

    expect(result.ok).toBe(false);
    expect(result.repairAddendum).toContain("- e1 [category=perceivable_effect]");
    expect(result.repairAddendum).not.toContain("perceivable_effect:private-summary");
    expect(result.repairAddendum).toContain("[private term omitted] pressure is visible");
    expect(result.repairAddendum).not.toContain("Forest Outpost");
    expect(result.repairAddendum).not.toContain("claim-inspector-pressure");
  });

  it("fails concrete claimSpan coverage when the span is omitted from evidence-backed claims", () => {
    const draft = supportedFuturePressureDraft();
    draft.claims = [];
    draft.claimSpans[0] = {
      ...draft.claimSpans[0]!,
      claimIds: [],
    };

    const result = validateNarrationDraftGrounding({
      packet: createPacket(),
      draft,
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        kind: "uncovered_claim_span",
        spanId: "span-inspector-pressure",
      }),
    );
    expect(result.coverage).toContainEqual({
      spanId: "span-inspector-pressure",
      claimIds: [],
      covered: false,
      requiresEvidence: true,
    });
  });

  it("fails claimSpans whose text is empty or absent from draft prose", () => {
    const draft = supportedFuturePressureDraft();
    draft.claimSpans = [
      {
        id: "span-absent",
        spanText: "the inspector unlocks the side door",
        claimIds: ["claim-inspector-pressure"],
        requiresEvidence: true,
      },
      {
        id: "span-empty",
        spanText: "   ",
        claimIds: ["claim-inspector-pressure"],
        requiresEvidence: true,
      },
    ];

    const result = validateNarrationDraftGrounding({
      packet: createPacket(),
      draft,
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "claim_span_not_in_prose",
          spanId: "span-absent",
        }),
        expect.objectContaining({
          kind: "claim_span_not_in_prose",
          spanId: "span-empty",
        }),
      ]),
    );
  });

  it("fails claimSpans that normalize to prose but are not exact substrings", () => {
    const draft = supportedFuturePressureDraft();
    draft.claimSpans[0] = {
      ...draft.claimSpans[0]!,
      spanText: "The Inspector Is Due Before Dusk",
    };

    const result = validateNarrationDraftGrounding({
      packet: createPacket(),
      draft,
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        kind: "claim_span_not_in_prose",
        spanId: "span-inspector-pressure",
      }),
    );
  });

  it("fails drafts that span only a small harmless part of broader prose", () => {
    const draft = supportedFuturePressureDraft();
    draft.prose =
      "The clerk lowers his voice: the inspector is due before dusk. A sealed black warrant appears under the counter, and the side door unlocks.";
    draft.claims = [
      {
        id: "claim-clerk",
        kind: "actor_presence",
        summary: "The clerk is visible.",
        requiresEvidence: false,
        evidenceRefs: [],
      },
    ];
    draft.claimSpans = [
      {
        id: "span-clerk",
        spanText: "The clerk",
        claimIds: ["claim-clerk"],
        requiresEvidence: false,
      },
    ];

    const result = validateNarrationDraftGrounding({
      packet: createPacket(),
      draft,
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        kind: "insufficient_claim_span_coverage",
        coveredWordCount: 2,
        proseWordCount: expect.any(Number),
      }),
    );
    expect(result.repairAddendum).toContain("kind=insufficient_claim_span_coverage");
  });

  it("does not let non-evidence claims cover evidence-required spans", () => {
    const draft = supportedFuturePressureDraft();
    draft.claims = [
      {
        id: "claim-atmosphere-only",
        kind: "playable_beat",
        summary: "The counter goes still as a playable beat.",
        requiresEvidence: false,
        evidenceRefs: [],
      },
    ];
    draft.claimSpans[0] = {
      ...draft.claimSpans[0]!,
      claimIds: ["claim-atmosphere-only"],
      requiresEvidence: true,
    };

    const result = validateNarrationDraftGrounding({
      packet: createPacket(),
      draft,
    });

    expect(result.ok).toBe(false);
    expect(result.coverage).toContainEqual({
      spanId: "span-inspector-pressure",
      claimIds: ["claim-atmosphere-only"],
      covered: false,
      requiresEvidence: true,
    });
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        kind: "unsupported_claim_span",
        spanId: "span-inspector-pressure",
      }),
    );
  });

  it("does not echo model-controlled claim or span ids in repair addenda", () => {
    const draft = supportedFuturePressureDraft();
    draft.claims[0] = {
      ...draft.claims[0]!,
      id: "claim-Forest-Outpost-hidden-actor",
      evidenceRefs: [],
    };
    draft.claimSpans[0] = {
      ...draft.claimSpans[0]!,
      id: "span-Hidden-Archer-private",
      claimIds: ["claim-Forest-Outpost-hidden-actor"],
    };

    const result = validateNarrationDraftGrounding({
      packet: createPacket(),
      draft,
    });

    expect(result.ok).toBe(false);
    expect(result.repairAddendum).not.toContain("Forest-Outpost");
    expect(result.repairAddendum).not.toContain("Hidden-Archer");
    expect(result.repairAddendum).not.toContain("claim-Forest-Outpost-hidden-actor");
    expect(result.repairAddendum).not.toContain("span-Hidden-Archer-private");
  });

  it("fails non-empty prose with empty claimSpans so claims cannot bypass grounding", () => {
    const draft = supportedFuturePressureDraft();
    draft.claims = [];
    draft.claimSpans = [];

    const result = validateNarrationDraftGrounding({
      packet: createPacket(),
      draft,
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: "missing_claim_spans" }),
    );
  });

  it("keeps the guard free of semantic keyword classifier patterns", () => {
    const sourcePath = fileURLToPath(
      new URL("../narration-grounding-guard.ts", import.meta.url),
    );
    const source = readFileSync(sourcePath, "utf8");

    expect(source).not.toMatch(/pressure\w*\s*=\s*\[/i);
    expect(source).not.toMatch(/keyword\w*\s*=\s*\[/i);
    expect(source).not.toMatch(/classifier/i);
    expect(source).not.toMatch(/new RegExp/i);
    expect(source).not.toMatch(/\/[^/\n]*(?:pressure|threat|attack)[^/\n]*\//i);
  });
});
