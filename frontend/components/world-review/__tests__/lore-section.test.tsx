// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useState } from "react";
import type { LoreCardItem, LoreCardUpdateInput } from "@/lib/api-types";

type MockProps = Record<string, unknown> & { children?: ReactNode };

const apiMocks = vi.hoisted(() => ({
  searchLore: vi.fn(),
  updateLoreCard: vi.fn(),
  deleteLoreCardById: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  searchLore: apiMocks.searchLore,
  updateLoreCard: apiMocks.updateLoreCard,
  deleteLoreCardById: apiMocks.deleteLoreCardById,
}));

vi.mock("@/lib/api-types", () => ({
  LORE_CARD_CATEGORIES: [
    "location",
    "npc",
    "faction",
    "ability",
    "rule",
    "concept",
    "item",
    "event",
  ],
}), { virtual: true });

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: MockProps) => <span {...props}>{children}</span>,
}), { virtual: true });

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: MockProps) => <button {...props}>{children}</button>,
}), { virtual: true });

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: MockProps) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: MockProps) => <div role="dialog" aria-label="Edit Lore Card">{children}</div>,
  DialogDescription: ({ children }: MockProps) => <p>{children}</p>,
  DialogFooter: ({ children }: MockProps) => <div>{children}</div>,
  DialogHeader: ({ children }: MockProps) => <div>{children}</div>,
  DialogTitle: ({ children }: MockProps) => <h2>{children}</h2>,
}), { virtual: true });

vi.mock("@/components/ui/input", () => ({
  Input: (props: MockProps) => <input {...props} />,
}), { virtual: true });

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: MockProps) => <label {...props}>{children}</label>,
}), { virtual: true });

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: MockProps) => <div>{children}</div>,
  SelectContent: ({ children }: MockProps) => <div>{children}</div>,
  SelectItem: ({ children }: MockProps) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: MockProps) => <button type="button" {...props}>{children}</button>,
  SelectValue: ({ placeholder }: MockProps) => <span>{placeholder ?? null}</span>,
}), { virtual: true });

vi.mock("@/components/ui/textarea", () => ({
  Textarea: ({ children, ...props }: MockProps) => <textarea {...props}>{children}</textarea>,
}), { virtual: true });

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: MockProps) => (open ? <div>{children}</div> : null),
  AlertDialogAction: ({ children, ...props }: MockProps) => <button {...props}>{children}</button>,
  AlertDialogCancel: ({ children, ...props }: MockProps) => <button {...props}>{children}</button>,
  AlertDialogContent: ({ children }: MockProps) => <div role="alertdialog" aria-label="Delete Lore Card">{children}</div>,
  AlertDialogDescription: ({ children }: MockProps) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: MockProps) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: MockProps) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: MockProps) => <h2>{children}</h2>,
}), { virtual: true });

vi.mock("../worldbook-import-dialog", () => ({
  WorldBookImportDialog: () => null,
}));

import { LoreSection } from "../lore-section";

const mockedSearchLore = apiMocks.searchLore;
const mockedUpdateLoreCard = apiMocks.updateLoreCard;
const mockedDeleteLoreCardById = apiMocks.deleteLoreCardById;

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
  document.body.innerHTML = "";
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
      category: "concept",
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
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedUpdateLoreCard).toHaveBeenCalledWith("test-campaign", "1", updatedPayload);
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("The Black Spire")).toBeInTheDocument();
    expect(screen.queryByText("Edit Lore Card")).not.toBeInTheDocument();
  });

  it("clears active search results before refreshing after an edit", async () => {
    const user = userEvent.setup();
    const updatedPayload: LoreCardUpdateInput = {
      term: "Phase 27 Smoke Edited Term",
      definition: "A revised lore definition.",
      category: "concept",
    };
    let resolveRefresh: (() => void) | undefined;
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    mockedSearchLore.mockResolvedValue([defaults.initialCards[0]]);
    mockedUpdateLoreCard.mockResolvedValue({ id: "1", ...updatedPayload });

    render(<LoreSectionHarness {...defaults} onRefresh={onRefresh} />);

    await user.type(screen.getByPlaceholderText("Search lore cards..."), "dragon");
    await waitFor(() => {
      expect(mockedSearchLore).toHaveBeenCalledWith("test-campaign", "dragon", 20);
    });
    expect(screen.queryByText("Fireball")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /edit dragon/i }));
    await user.clear(screen.getByLabelText(/term/i));
    await user.type(screen.getByLabelText(/term/i), updatedPayload.term);
    await user.clear(screen.getByLabelText(/definition/i));
    await user.type(screen.getByLabelText(/definition/i), updatedPayload.definition);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedUpdateLoreCard).toHaveBeenCalledWith("test-campaign", "1", updatedPayload);
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Fireball")).toBeInTheDocument();

    resolveRefresh?.();
    await waitFor(() => {
      expect(screen.queryByText("Edit Lore Card")).not.toBeInTheDocument();
    });
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

  it("surfaces delete failures under the targeted card", async () => {
    const user = userEvent.setup();
    mockedDeleteLoreCardById.mockRejectedValue(new Error("Lore card not found."));

    render(<LoreSectionHarness {...defaults} />);

    await user.click(screen.getByRole("button", { name: /delete dragon/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(await screen.findByText("Lore card not found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete dragon/i })).toBeEnabled();
  });
});
