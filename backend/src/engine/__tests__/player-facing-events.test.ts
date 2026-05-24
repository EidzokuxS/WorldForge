import { describe, expect, it } from "vitest";

import {
  sanitizePlayerFacingText,
  toPlayerFacingLookupResult,
  toPlayerFacingQuickActions,
} from "../player-facing-events.js";

describe("player-facing event projection", () => {
  it("redacts backend refs and internal tool names in quick actions", () => {
    const projected = toPlayerFacingQuickActions({
      result: {
        actions: [
          {
            label: "Ask actor_hidden",
            action:
              "Ask actor_hidden about route_hidden_path via tool_result_8, 01890f9a-20f3-7cc2-9b7c-1a2b3c4d5e6f, spawn_npc, record_world_fact, transfer_item, and add_tag.",
            handle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        ],
      },
    });

    expect(projected).toEqual({
      actions: [
        {
          label: "Ask [hidden]",
          action: "Ask [hidden] about [hidden] via [hidden], [hidden], [hidden], [hidden], [hidden], and [hidden].",
          handle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    });
    expect(JSON.stringify(projected)).not.toContain("actor_hidden");
    expect(JSON.stringify(projected)).not.toContain("route_hidden_path");
    expect(JSON.stringify(projected)).not.toContain("tool_result_8");
    expect(JSON.stringify(projected)).not.toContain("01890f9a");
    expect(JSON.stringify(projected)).not.toContain("spawn_npc");
    expect(JSON.stringify(projected)).not.toContain("record_world_fact");
    expect(JSON.stringify(projected)).not.toContain("transfer_item");
    expect(JSON.stringify(projected)).not.toContain("add_tag");
  });

  it("drops quick actions without backend-owned capability handles", () => {
    expect(toPlayerFacingQuickActions({
      result: {
        actions: [
          { label: "Ask", action: "Ask the clerk." },
          { label: "Move", action: "Move closer.", handle: "not-a-capability" },
        ],
      },
    })).toBeNull();
  });

  it("projects lookup results through an allowlisted player-facing DTO", () => {
    const projected = toPlayerFacingLookupResult({
      lookupKind: "character_canon_fact",
      subject: "actor_hidden",
      answer:
        "actor_hidden used record_world_fact near tool-result-7 and 01890f9a-20f3-7cc2-9b7c-1a2b3c4d5e6f.",
      citations: [
        {
          kind: "research",
          label: "campaign:source",
          excerpt: "npc_secret saw location:private.",
          extra: "dropped",
        },
      ],
      uncertaintyNotes: ["forecast-secret remains hidden."],
      sceneImpact: "loc-secret is not public.",
      extra: "dropped",
    });

    expect(projected).toEqual({
      lookupKind: "character_canon_fact",
      subject: "[hidden]",
      answer: "[hidden] used [hidden] near [hidden] and [hidden].",
      citations: [
        {
          kind: "research",
          label: "[hidden]",
          excerpt: "[hidden] saw [hidden].",
        },
      ],
      uncertaintyNotes: ["[hidden] remains hidden."],
      sceneImpact: "[hidden] is not public.",
    });
    expect(JSON.stringify(projected)).not.toContain("actor_hidden");
    expect(JSON.stringify(projected)).not.toContain("record_world_fact");
    expect(JSON.stringify(projected)).not.toContain("tool-result-7");
    expect(JSON.stringify(projected)).not.toContain("01890f9a");
    expect(JSON.stringify(projected)).not.toContain("campaign:source");
    expect(JSON.stringify(projected)).not.toContain("npc_secret");
    expect(JSON.stringify(projected)).not.toContain("location:private");
    expect(JSON.stringify(projected)).not.toContain("forecast-secret");
    expect(JSON.stringify(projected)).not.toContain("loc-secret");
  });

  it("can preserve player-visible narrative whitespace while redacting handles", () => {
    expect(
      sanitizePlayerFacingText("Line one: actor_hidden\nLine two: route:hidden.", {
        preserveWhitespace: true,
      }),
    ).toBe("Line one: [hidden]\nLine two: [hidden].");
  });

  it("preserves ordinary player-facing hyphenated prose", () => {
    expect(
      sanitizePlayerFacingText(
        "The bridge-wardens will read you as a route-hazard at the route-confirmation desk, but tool-result-7, action-result-1, route_hidden_path, route-hidden-path, route-raw, route-secret, and actor:raw stay private.",
      ),
    ).toBe(
      "The bridge-wardens will read you as a route-hazard at the route-confirmation desk, but [hidden], [hidden], [hidden], [hidden], [hidden], [hidden], and [hidden] stay private.",
    );
  });
});
