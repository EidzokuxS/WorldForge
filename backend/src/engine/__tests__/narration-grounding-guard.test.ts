import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { NarratorPacket } from "../narrator-packet.js";
import {
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
        summary: "The inspection pressure is now visible at the counter.",
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
        summary: "The inspection pressure is now visible at the counter.",
        sourceId: "effect-pressure-clock",
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
    expect(result.repairAddendum).toContain("an evidence-required claim lacks evidenceRefs");
    expect(result.repairAddendum).not.toContain("claim-inspector-pressure");
    expect(result.repairAddendum).not.toContain("The clerk warns");
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
