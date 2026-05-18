import { describe, expect, it } from "vitest";

import {
  sanitizePlayerFacingText,
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
          },
        ],
      },
    });

    expect(projected).toEqual({
      actions: [
        {
          label: "Ask [hidden]",
          action: "Ask [hidden] about [hidden] via [hidden], [hidden], [hidden], [hidden], [hidden], and [hidden].",
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
