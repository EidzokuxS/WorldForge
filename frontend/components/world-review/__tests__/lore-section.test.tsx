import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoreSection } from "../lore-section";
import type { LoreCardItem } from "@/lib/api-types";

vi.mock("@/lib/api", () => ({
  searchLore: vi.fn(),
}));

vi.mock("../worldbook-import-dialog", () => ({
  WorldBookImportDialog: () => null,
}));

const makeCard = (overrides: Partial<LoreCardItem> = {}): LoreCardItem => ({
  id: `card-${Math.random()}`,
  term: "Dragon",
  definition: "A fire-breathing beast",
  category: "concept",
  ...overrides,
});

describe("LoreSection", () => {
  const defaults = {
    cards: [
      makeCard({ id: "1", term: "Dragon", category: "concept" }),
      makeCard({ id: "2", term: "Fireball", category: "ability" }),
      makeCard({ id: "3", term: "Tavern", category: "location" }),
    ],
    campaignId: "test-campaign",
  };

  it("renders lore cards grouped by category", () => {
    render(<LoreSection {...defaults} />);
    expect(screen.getByText("Dragon")).toBeInTheDocument();
    expect(screen.getByText("Fireball")).toBeInTheDocument();
    expect(screen.getByText("Tavern")).toBeInTheDocument();
  });

  it("renders category headings", () => {
    render(<LoreSection {...defaults} />);
    expect(screen.getByText("Concepts")).toBeInTheDocument();
    expect(screen.getByText("Abilities")).toBeInTheDocument();
    expect(screen.getByText("Locations")).toBeInTheDocument();
  });

  it("renders card count", () => {
    render(<LoreSection {...defaults} />);
    expect(screen.getByText("3 cards")).toBeInTheDocument();
  });

  it("shows empty message when no cards", () => {
    render(<LoreSection cards={[]} campaignId="test" />);
    expect(screen.getByText("No lore cards available")).toBeInTheDocument();
  });
});
