import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RichTextMessage } from "../rich-text-message";
import { SpecialMessageBlock } from "../special-message-block";
import {
  deriveGameMessageKind,
  isDialogueParagraph,
  splitGameplayParagraphs,
  stripLookupPrefix,
} from "@/lib/gameplay-text";

describe("gameplay text helpers", () => {
  it("classifies narration, player, system, lookup, compare, and progress messages", () => {
    expect(deriveGameMessageKind("assistant", "The torchlight trembles.")).toBe(
      "narration"
    );
    expect(deriveGameMessageKind("user", '"Hold the line."')).toBe("player");
    expect(deriveGameMessageKind("system", "Autosave complete.")).toBe("system");
    expect(
      deriveGameMessageKind(
        "assistant",
        "[Lookup: power_profile] Speed: Hypersonic"
      )
    ).toBe("compare");
    expect(
      deriveGameMessageKind("assistant", "[Lookup: faction] The wardens...")
    ).toBe("lookup");
    expect(
      deriveGameMessageKind(
        "assistant",
        "Mechanical Resolution: Defensive strike succeeds."
      )
    ).toBe("mechanical");
    expect(
      deriveGameMessageKind(
        "assistant",
        "The storyteller is weaving the scene..."
      )
    ).toBe("progress");
  });

  it("strips persisted lookup prefixes and keeps paragraph/dialogue helpers stable", () => {
    expect(
      stripLookupPrefix("[Lookup: power_profile] Attack: city block")
    ).toBe("Attack: city block");
    expect(splitGameplayParagraphs('The rain hisses.\n\n"Stay behind me."')).toEqual([
      "The rain hisses.",
      '"Stay behind me."',
    ]);
    expect(isDialogueParagraph('"Stay behind me."')).toBe(true);
    expect(isDialogueParagraph("The rain hisses.")).toBe(false);
  });
});

describe("RichTextMessage", () => {
  it("renders the locked RP subset only", () => {
    const { container } = render(
      <RichTextMessage content={'The rain hisses.\n\n"Stay behind me."\n\n*She draws steel.*\n\n**Now.**'} />
    );

    expect(screen.getByText("The rain hisses.")).toBeInTheDocument();
    expect(screen.getByText('"Stay behind me."')).toBeInTheDocument();

    const emphasis = container.querySelector("em");
    expect(emphasis).not.toBeNull();
    expect(emphasis).toHaveTextContent("She draws steel.");

    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong).toHaveTextContent("Now.");

    expect(container.querySelectorAll("p")).toHaveLength(4);
  });

  it("does not upgrade unsupported markdown or GFM constructs into richer UI", () => {
    const { container } = render(
      <RichTextMessage
        content={`[link](https://example.com)
- list
1. numbered
| head | value |
| --- | --- |
| hp | 5 |
- [ ] task
# Heading
> Quote
\`code\`
<span>raw html</span>`}
      />
    );

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("ol")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("blockquote")).toBeNull();
    expect(container.querySelector("code")).toBeNull();
    expect(container.querySelector("pre")).toBeNull();

    expect(container).toHaveTextContent("link");
    expect(container).toHaveTextContent("list");
    expect(container).toHaveTextContent("numbered");
    expect(container).toHaveTextContent("Heading");
    expect(container).toHaveTextContent("Quote");
  });

  it("keeps unfinished streaming markers as plain text until they close", () => {
    const { container } = render(<RichTextMessage content={"*unclosed"} />);

    expect(container.querySelector("em")).toBeNull();
    expect(container).toHaveTextContent("*unclosed");
  });
});

describe("SpecialMessageBlock", () => {
  it("gives compare output a dedicated label instead of a generic lookup badge", () => {
    const { container } = render(
      <SpecialMessageBlock kind="compare" content="Speed: Hypersonic" />
    );

    expect(screen.getByText(/power profile|compare/i)).toBeInTheDocument();
    expect(screen.queryByText(/^lookup$/i)).not.toBeInTheDocument();
    expect(container).toHaveTextContent("Speed: Hypersonic");
  });
});
