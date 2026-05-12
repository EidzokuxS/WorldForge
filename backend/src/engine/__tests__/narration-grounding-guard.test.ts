import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { NarratorPacket } from "../narrator-packet.js";
import {
  buildGroundedSentenceDraftRepairAddendum,
  compileGroundedSentenceDraftToNarrationDraft,
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
              evidenceRefs: ["perceivable_effect:effect-pressure-clock"],
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
            evidenceRefs: [
              "perceivable_response:response-clerk-warning",
              "perceivable_effect:effect-pressure-clock",
            ],
          },
          {
            text: "The counter goes still around the visible pressure.",
            evidenceRefs: ["perceivable_effect:effect-pressure-clock"],
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

  it("derives claim kind from allowed backend evidence support", () => {
    const noKindDraft = compileGroundedSentenceDraftToNarrationDraft({
      packet: createPacket(),
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "The counter goes still around the visible pressure.",
            evidenceRefs: ["perceivable_effect:effect-pressure-clock"],
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
            evidenceRefs: ["perceivable_response:response-clerk-warning"],
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
              "tool_result:extra-route-note",
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(GROUNDED_SENTENCE_DRAFT_EVIDENCE_REF_MAX).toBe(4);

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet: createPacket(),
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: denseAnswer,
            evidenceRefs: ["perceivable_effect:effect-pressure-clock"],
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
            evidenceRefs: ["perceivable_response:response-clerk-warning"],
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
            evidenceRefs: ["perceivable_effect:effect-observed-wardens"],
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
    expect(addendum).toContain("cite only the strongest 1-4 ids");
    expect(addendum).toContain("perceivable_effect:effect-pressure-clock");
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
            evidenceRefs: ["perceivable_effect:warden-proof-requirements"],
          },
        ],
      },
    });

    expect(draft.claims[0]).toMatchObject({
      kind: "route_status",
      evidenceRefs: ["perceivable_effect:warden-proof-requirements"],
    });
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
          "Worn Leather Satchel is currently equipped by the player as a signature item. Item tags/state: pack.",
        sourceId: "item-satchel",
      },
    ];

    const draft = compileGroundedSentenceDraftToNarrationDraft({
      packet,
      draft: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "Your worn leather satchel is still settled on your shoulder.",
            evidenceRefs: ["current_inventory_status:item-satchel"],
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
              evidenceRefs: ["current_inventory_status:item-satchel"],
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
    expect(result.repairAddendum).toContain("[ALLOWED PACKET EVIDENCE]");
    expect(result.repairAddendum).toContain(
      "perceivable_response:response-clerk-warning [category=perceivable_response]",
    );
    expect(result.repairAddendum).toContain(
      "summary=The clerk warns that the inspector is due before dusk.",
    );
    expect(result.repairAddendum).toContain("[GROUNDING DIAGNOSTICS]");
    expect(result.repairAddendum).toContain("kind=unsupported_claim");
    expect(result.repairAddendum).toContain("an evidence-required claim lacks evidenceRefs");
    expect(result.repairAddendum).not.toContain("claim-inspector-pressure");
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
    expect(result.repairAddendum).toContain("perceivable_effect:private-summary");
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
