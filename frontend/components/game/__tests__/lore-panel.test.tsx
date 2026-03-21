import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LorePanel } from "../lore-panel";
import type { LoreCardItem } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getLoreCards: vi.fn().mockResolvedValue([
    { id: "1", term: "Shadowkeep", definition: "A dark fortress", category: "location" },
    { id: "2", term: "Iron Fist", definition: "Warrior guild", category: "faction" },
    { id: "3", term: "Elara", definition: "Elven ranger", category: "npc" },
    { id: "4", term: "Moonblade", definition: "Legendary sword", category: "item" },
  ] satisfies LoreCardItem[]),
  searchLore: vi.fn().mockResolvedValue([]),
}));

describe("LorePanel", () => {
  it("shows 'No campaign loaded' when campaignId is null", () => {
    render(<LorePanel campaignId={null} />);

    expect(screen.getByText("No campaign loaded")).toBeInTheDocument();
    expect(screen.getByText("World Lore")).toBeInTheDocument();
  });

  it("renders lore cards grouped by category", async () => {
    render(<LorePanel campaignId="test-campaign" />);

    expect(await screen.findByText("Shadowkeep")).toBeInTheDocument();
    expect(screen.getByText("A dark fortress")).toBeInTheDocument();
    expect(screen.getByText("Elara")).toBeInTheDocument();
    expect(screen.getByText("Iron Fist")).toBeInTheDocument();
    expect(screen.getByText("Moonblade")).toBeInTheDocument();
  });

  it("renders category group labels", async () => {
    render(<LorePanel campaignId="test-campaign" />);

    await screen.findByText("Shadowkeep");
    expect(screen.getByText("Locations")).toBeInTheDocument();
    expect(screen.getByText("Factions")).toBeInTheDocument();
    expect(screen.getByText("Characters")).toBeInTheDocument();
    expect(screen.getByText("Items")).toBeInTheDocument();
  });

  it("renders search input when campaign is loaded", async () => {
    render(<LorePanel campaignId="test-campaign" />);

    await screen.findByText("Shadowkeep");
    expect(screen.getByPlaceholderText("Search lore...")).toBeInTheDocument();
  });
});
