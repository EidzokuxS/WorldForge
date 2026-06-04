// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CharacterPersonality } from "@worldforge/shared";

import { PersonalitySection } from "../personality-section";

function makePersonality(
  overrides: Partial<CharacterPersonality> = {},
): CharacterPersonality {
  return {
    summary: "A weather-beaten scout from Dunespire Hold, sworn to the dawn watch.",
    voice: "Curt military jargon, hunter metaphors, avoids first-person claims.",
    decisionStyle: "Acts first, justifies later, trusts terrain reads.",
    worldview: "The desert keeps no promises, so people must.",
    internalContradictions: [
      "Preaches loyalty as bedrock, but falsifies patrol counts to shield her unit.",
    ],
    personalMythology: "I am the eyes of the regiment.",
    sampleLines: ["Move out, on me.", "State your business."],
    ...overrides,
  };
}

describe("PersonalitySection", () => {
  it("renders nothing when personality is undefined", () => {
    const { container } = render(<PersonalitySection personality={undefined} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when all fields are empty", () => {
    const { container } = render(
      <PersonalitySection
        personality={makePersonality({
          summary: "",
          voice: "",
          decisionStyle: "",
          worldview: "",
          internalContradictions: [],
          personalMythology: "",
          sampleLines: [],
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the header, summary, voice, and shell region hooks", () => {
    render(<PersonalitySection personality={makePersonality()} />);

    const section = screen.getByRole("region", { name: /personality/i });
    expect(section).toHaveAttribute("data-shell-region", "personality");
    expect(section).toHaveAttribute("data-shell-surface", "panel");
    expect(within(section).getByText("Personality")).toBeInTheDocument();
    expect(
      within(section).getByText(
        "A weather-beaten scout from Dunespire Hold, sworn to the dawn watch.",
      ),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(
        /Voice: Curt military jargon, hunter metaphors, avoids first-person claims\./i,
      ),
    ).toBeInTheDocument();
  });

  it("keeps collapsible details hidden by default", () => {
    render(<PersonalitySection personality={makePersonality()} />);

    const toggle = screen.getByRole("button", {
      name: /personality details/i,
    });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Move out, on me.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Acts first, justifies later, trusts terrain reads."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("The desert keeps no promises, so people must."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Preaches loyalty as bedrock, but falsifies patrol counts to shield her unit.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("I am the eyes of the regiment."),
    ).not.toBeInTheDocument();
  });

  it("reveals detail fields when expanded", async () => {
    const user = userEvent.setup();
    render(<PersonalitySection personality={makePersonality()} />);

    const toggle = screen.getByRole("button", {
      name: /personality details/i,
    });
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const sampleLine = screen.getByText("Move out, on me.");
    expect(sampleLine.closest("blockquote")).not.toBeNull();
    expect(screen.getByText("Decision style:")).toBeInTheDocument();
    expect(
      screen.getByText("Acts first, justifies later, trusts terrain reads."),
    ).toBeInTheDocument();
    expect(screen.getByText("Worldview:")).toBeInTheDocument();
    expect(
      screen.getByText("The desert keeps no promises, so people must."),
    ).toBeInTheDocument();
    expect(screen.getByText("Personal mythology:")).toBeInTheDocument();
    expect(screen.getByText("I am the eyes of the regiment.")).toBeInTheDocument();

    const contradictionsList = screen
      .getByText(
        "Preaches loyalty as bedrock, but falsifies patrol counts to shield her unit.",
      )
      .closest("ul");
    expect(contradictionsList).not.toBeNull();
  });

  it("still renders a header when only sample lines are populated", async () => {
    const user = userEvent.setup();
    render(
      <PersonalitySection
        personality={makePersonality({
          summary: "",
          voice: "",
          decisionStyle: "",
          worldview: "",
          internalContradictions: [],
          personalMythology: "",
          sampleLines: ["Hold the ridge."],
        })}
      />,
    );

    expect(screen.getByRole("region", { name: /personality/i })).toBeInTheDocument();
    expect(screen.queryByText(/^Voice:/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /personality details/i }),
    );

    expect(screen.getByText("Hold the ridge.")).toBeInTheDocument();
  });
});
