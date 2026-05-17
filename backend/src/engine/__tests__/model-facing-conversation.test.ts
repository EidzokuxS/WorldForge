import { describe, expect, it } from "vitest";

import {
  formatModelFacingConversationEntry,
  formatModelFacingRecentConversation,
  redactModelFacingBackendRefs,
  sanitizeModelFacingConversationText,
  formatModelFacingPlayerActionText,
  sanitizeModelFacingJson,
} from "../model-facing-conversation.js";

describe("model-facing conversation formatting", () => {
  it("redacts backend refs while preserving ordinary player-facing labels", () => {
    const text = redactModelFacingBackendRefs(
      "Use actor:actor-player, actor_hidden, location:loc-pier, route-tea-lane, route_hidden_path, tool-result-7, tool_result_8, knowledge:fact-9, authority:gm, campaign-main, candidate_secret, source:event-1, effect_hidden, response-visible-1, action-result-1, 550e8400-e29b-41d4-a716-446655440000, and 01890f9a-20f3-7cc2-9b7c-1a2b3c4d5e6f. Ask Road Warden in a player-facing source-linked scene.",
    );

    expect(text).toContain("Road Warden");
    expect(text).toContain("player-facing");
    expect(text).toContain("source-linked");
    expect(text).not.toContain("actor:actor-player");
    expect(text).not.toContain("actor_hidden");
    expect(text).not.toContain("location:loc-pier");
    expect(text).not.toContain("route-tea-lane");
    expect(text).not.toContain("route_hidden_path");
    expect(text).not.toContain("tool-result-7");
    expect(text).not.toContain("tool_result_8");
    expect(text).not.toContain("knowledge:fact-9");
    expect(text).not.toContain("authority:gm");
    expect(text).not.toContain("campaign-main");
    expect(text).not.toContain("candidate_secret");
    expect(text).not.toContain("source:event-1");
    expect(text).not.toContain("effect_hidden");
    expect(text).not.toContain("response-visible-1");
    expect(text).not.toContain("action-result-1");
    expect(text).not.toContain("550e8400");
    expect(text).not.toContain("01890f9a");
  });

  it("drops hidden/private entries and sanitizes remaining recent conversation", () => {
    const formatted = formatModelFacingRecentConversation(
      [
        {
          role: "assistant",
          content: "Hidden Auditor said the secret thing.",
        },
        {
          role: "user",
          content: "I ask Road Warden about actor:actor-player near location:loc-pier.",
        },
      ],
      {
        safety: { forbiddenTerms: ["Hidden Auditor"] },
        extraForbiddenTerms: ["secret thing"],
      },
    );

    expect(formatted).toContain("Road Warden");
    expect(formatted).toContain("player_claim");
    expect(formatted).not.toContain("Hidden Auditor");
    expect(formatted).not.toContain("actor:actor-player");
    expect(formatted).not.toContain("location:loc-pier");
  });

  it("marks prior assistant prose as non-authoritative without replaying its claims", () => {
    const formatted = formatModelFacingRecentConversation([
      {
        role: "assistant",
        content: "The prior GM prose mentioned a side door.",
      },
      {
        role: "user",
        content: "I point at it.",
      },
    ]);

    expect(formatted).toContain("prior_gm_visible_prose_non_authority");
    expect(formatted).toContain("player_claim");
    expect(formatted).not.toContain("side door");
    expect(formatted).toContain("presentation only, not legal evidence");
  });

  it("formats one continuity entry through the same assistant-prose boundary", () => {
    const assistant = formatModelFacingConversationEntry({
      role: "assistant",
      content: "The prior GM prose granted a pass through actor:raw.",
    });
    const player = formatModelFacingConversationEntry({
      role: "user",
      content: "I ask Road Warden about actor:raw.",
    });

    expect(assistant).toContain("prior_gm_visible_prose_non_authority");
    expect(assistant).toContain("presentation only, not legal evidence");
    expect(assistant).not.toContain("granted a pass");
    expect(player).toContain("player_claim");
    expect(player).toContain("Road Warden");
    expect(player).not.toContain("actor:raw");
  });

  it("can omit assistant prose markers when a prompt wants only player-authored claims", () => {
    const formatted = formatModelFacingRecentConversation(
      [
        {
          role: "assistant",
          content: "The prior GM prose granted a forged permit.",
        },
        {
          role: "user",
          content: "I present it.",
        },
      ],
      { assistantMode: "omit" },
    );

    expect(formatted).not.toContain("prior_gm_visible_prose_non_authority");
    expect(formatted).not.toContain("forged permit");
    expect(formatted).toContain("player_claim");
    expect(formatted).toContain("I present it.");
  });

  it("sanitizes JSON repair payloads without preserving backend refs or private terms", () => {
    const sanitized = sanitizeModelFacingJson(
      {
        input: {
          actorRef: "actor:11111111-1111-4111-8111-111111111111",
          text: "Hidden Auditor mentioned the Forest Outpost.",
        },
      },
      {
        safety: { forbiddenTerms: ["Hidden Auditor"] },
        extraForbiddenTerms: ["Forest Outpost"],
      },
    );
    const json = JSON.stringify(sanitized);

    expect(json).not.toContain("actor:11111111");
    expect(json).not.toContain("Hidden Auditor");
    expect(json).not.toContain("Forest Outpost");
    expect(json).toContain("[backend ref hidden]");
    expect(sanitizeModelFacingConversationText("Forest Outpost", {
      extraForbiddenTerms: ["Forest Outpost"],
    })).toContain("[private term hidden]");
  });

  it("sanitizes player-authored action text before model prompts can quote it", () => {
    const formatted = formatModelFacingPlayerActionText(
      "I paste actor:actor-player, route-secret-1, tool-result-9, and Hidden Auditor.",
      {
        safety: { forbiddenTerms: ["Hidden Auditor"] },
      },
    );

    expect(formatted).not.toContain("actor:actor-player");
    expect(formatted).not.toContain("route-secret-1");
    expect(formatted).not.toContain("tool-result-9");
    expect(formatted).not.toContain("Hidden Auditor");
    expect(formatted).toContain("[backend ref hidden]");
  });

  it("redacts exact frame backend ids that do not match backend-ref patterns", () => {
    const safety = {
      forbiddenTerms: [],
      backendOnlyTerms: [
        "miraInternal42",
        "pierInternal77",
        "backRoomInternal99",
      ],
    };

    const action = formatModelFacingPlayerActionText(
      "I paste miraInternal42 near pierInternal77 and ask about Back Room.",
      { safety },
    );
    const recent = formatModelFacingRecentConversation(
      [
        {
          role: "assistant",
          content: "Earlier debug text mentioned backRoomInternal99.",
        },
      ],
      { safety },
    );

    expect(action).toContain("Back Room");
    expect(action).not.toContain("miraInternal42");
    expect(action).not.toContain("pierInternal77");
    expect(recent).not.toContain("backRoomInternal99");
    expect(`${action}\n${recent}`).toContain("[backend ref hidden]");
  });
});
