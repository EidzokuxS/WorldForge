import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NpcsSection } from "../npcs-section";
import type { ScaffoldNpc } from "@/lib/api-types";

vi.mock("../regenerate-dialog", () => ({
  RegenerateDialog: () => <button data-testid="regenerate">Regenerate</button>,
}));

vi.mock("../tag-editor", () => ({
  TagEditor: () => <div data-testid="tag-editor" />,
}));

vi.mock("../string-list-editor", () => ({
  StringListEditor: () => <div data-testid="string-list-editor" />,
}));

vi.mock("@/lib/v2-card-parser", () => ({
  parseV2CardFile: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  parseCharacter: vi.fn(),
  importV2Card: vi.fn(),
  researchCharacter: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const makeNpc = (overrides: Partial<ScaffoldNpc> = {}): ScaffoldNpc => ({
  _uid: `npc-test-${Math.random()}`,
  name: "Gandalf",
  persona: "A wise wizard",
  tags: ["wizard"],
  goals: { shortTerm: ["Find the ring"], longTerm: ["Defeat Sauron"] },
  locationName: "Tavern",
  factionName: null,
  ...overrides,
});

describe("NpcsSection", () => {
  const defaults = {
    npcs: [makeNpc(), makeNpc({ _uid: "npc-2", name: "Frodo", persona: "A hobbit" })],
    campaignId: "test-campaign",
    locationNames: ["Tavern", "Forest"],
    factionNames: ["The Order"],
    onChange: vi.fn(),
    onRegenerate: vi.fn(),
    regenerating: false,
  };

  it("renders NPC cards with names", () => {
    render(<NpcsSection {...defaults} />);
    expect(screen.getByDisplayValue("Gandalf")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Frodo")).toBeInTheDocument();
  });

  it("renders the NPCs heading and Add NPC button", () => {
    render(<NpcsSection {...defaults} />);
    expect(screen.getByText("NPCs")).toBeInTheDocument();
    expect(screen.getByText("Add NPC")).toBeInTheDocument();
  });

  it("shows duplicate name warning for NPCs with the same name", () => {
    const npcs = [
      makeNpc({ _uid: "a", name: "Gandalf" }),
      makeNpc({ _uid: "b", name: "Gandalf" }),
    ];
    render(<NpcsSection {...defaults} npcs={npcs} />);
    const warnings = screen.getAllByText("Duplicate name");
    expect(warnings).toHaveLength(2);
  });

  it("calls onChange with a new NPC when Add NPC is clicked", () => {
    const onChange = vi.fn();
    render(<NpcsSection {...defaults} onChange={onChange} />);
    fireEvent.click(screen.getByText("Add NPC"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const newNpcs = onChange.mock.calls[0][0];
    expect(newNpcs).toHaveLength(3);
    expect(newNpcs[2].name).toBe("");
  });
});
