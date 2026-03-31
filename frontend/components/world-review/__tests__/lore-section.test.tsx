import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { LoreSection } from "../lore-section";
import type { LoreCardItem, LoreCardUpdateInput } from "@/lib/api-types";

vi.mock("@/lib/api", () => ({
  searchLore: vi.fn(),
  updateLoreCard: vi.fn(),
  deleteLoreCardById: vi.fn(),
}));

vi.mock("../worldbook-import-dialog", () => ({
  WorldBookImportDialog: () => null,
}));

import { deleteLoreCardById, searchLore, updateLoreCard } from "@/lib/api";

const mockedSearchLore = vi.mocked(searchLore);
const mockedUpdateLoreCard = vi.mocked(updateLoreCard);
const mockedDeleteLoreCardById = vi.mocked(deleteLoreCardById);

const makeCard = (overrides: Partial<LoreCardItem> = {}): LoreCardItem => ({
  id: `card-${Math.random()}`,
  term: "Dragon",
  definition: "A fire-breathing beast",
  category: "concept",
  ...overrides,
});

function LoreSectionHarness({
  initialCards,
  campaignId = "test-campaign",
  onRefresh,
}: {
  initialCards: LoreCardItem[];
  campaignId?: string;
  onRefresh?: (setCards: (cards: LoreCardItem[]) => void) => Promise<void> | void;
}) {
  const [cards, setCards] = useState(initialCards);

  return (
    <LoreSection
      cards={cards}
      campaignId={campaignId}
      onRefresh={onRefresh ? () => onRefresh(setCards) : undefined}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => undefined;
  }
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LoreSection", () => {
  const defaults = {
    initialCards: [
      makeCard({ id: "1", term: "Dragon", category: "concept" }),
      makeCard({ id: "2", term: "Fireball", category: "ability" }),
      makeCard({ id: "3", term: "Tavern", category: "location" }),
    ],
  };

  it("renders lore cards grouped by category", () => {
    render(<LoreSectionHarness {...defaults} />);
    expect(screen.getByText("Dragon")).toBeInTheDocument();
    expect(screen.getByText("Fireball")).toBeInTheDocument();
    expect(screen.getByText("Tavern")).toBeInTheDocument();
  });

  it("renders category headings", () => {
    render(<LoreSectionHarness {...defaults} />);
    expect(screen.getByText("Concepts")).toBeInTheDocument();
    expect(screen.getByText("Abilities")).toBeInTheDocument();
    expect(screen.getByText("Locations")).toBeInTheDocument();
  });

  it("renders card count", () => {
    render(<LoreSectionHarness {...defaults} />);
    expect(screen.getByText("3 cards")).toBeInTheDocument();
  });

  it("shows empty message when no cards", () => {
    render(<LoreSectionHarness initialCards={[]} campaignId="test" />);
    expect(screen.getByText("No lore cards available")).toBeInTheDocument();
  });

  it("edits a lore card and refreshes", async () => {
    const user = userEvent.setup();
    const updatedPayload: LoreCardUpdateInput = {
      term: "The Black Spire",
      definition: "A ruined tower watching the northern pass.",
      category: "location",
    };
    const refreshedCards = [
      makeCard({ id: "1", ...updatedPayload }),
      defaults.initialCards[1],
      defaults.initialCards[2],
    ];
    const onRefresh = vi.fn(async (setCards: (cards: LoreCardItem[]) => void) => {
      setCards(refreshedCards);
    });

    mockedUpdateLoreCard.mockResolvedValue({ id: "1", ...updatedPayload });

    render(<LoreSectionHarness {...defaults} onRefresh={onRefresh} />);

    await user.click(screen.getByRole("button", { name: /edit dragon/i }));
    await user.clear(screen.getByLabelText(/term/i));
    await user.type(screen.getByLabelText(/term/i), updatedPayload.term);
    await user.clear(screen.getByLabelText(/definition/i));
    await user.type(screen.getByLabelText(/definition/i), updatedPayload.definition);
    await user.click(screen.getByRole("combobox", { name: /category/i }));
    await user.click(await screen.findByRole("option", { name: "Locations" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedUpdateLoreCard).toHaveBeenCalledWith("test-campaign", "1", updatedPayload);
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("The Black Spire")).toBeInTheDocument();
    expect(screen.queryByText("Edit Lore Card")).not.toBeInTheDocument();
  });

  it("deletes a lore card and clears search results", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn(async (setCards: (cards: LoreCardItem[]) => void) => {
      setCards([
        defaults.initialCards[1],
        defaults.initialCards[2],
      ]);
    });

    mockedSearchLore.mockResolvedValue([defaults.initialCards[0]]);
    mockedDeleteLoreCardById.mockResolvedValue(undefined);

    render(<LoreSectionHarness {...defaults} onRefresh={onRefresh} />);

    await user.type(screen.getByPlaceholderText("Search lore cards..."), "dragon");

    await waitFor(() => {
      expect(mockedSearchLore).toHaveBeenCalledWith("test-campaign", "dragon", 20);
    });
    expect(screen.queryByText("Fireball")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /delete dragon/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mockedDeleteLoreCardById).toHaveBeenCalledWith("test-campaign", "1");
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Dragon")).not.toBeInTheDocument();
    expect(screen.getByText("Fireball")).toBeInTheDocument();
  });

  it("shows per-card pending state", async () => {
    const user = userEvent.setup();
    let resolveDelete: (() => void) | undefined;
    mockedDeleteLoreCardById.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    render(<LoreSectionHarness {...defaults} />);

    await user.click(screen.getByRole("button", { name: /delete dragon/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(screen.getByRole("button", { name: /deleting dragon/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /edit dragon/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /edit fireball/i })).toBeEnabled();

    resolveDelete?.();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete dragon/i })).toBeEnabled();
    });
  });

  it("surfaces lore mutation failures", async () => {
    const user = userEvent.setup();
    mockedUpdateLoreCard.mockRejectedValue(new Error("Definition is required."));

    render(<LoreSectionHarness {...defaults} />);

    await user.click(screen.getByRole("button", { name: /edit dragon/i }));
    await user.clear(screen.getByLabelText(/definition/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const dialog = screen.getByRole("dialog", { name: "Edit Lore Card" });
    expect(await within(dialog).findByText("Definition is required.")).toBeInTheDocument();
    expect(screen.getByText("Edit Lore Card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
  });
});
