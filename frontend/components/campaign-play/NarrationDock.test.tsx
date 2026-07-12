import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { CampaignPlayNarration } from "@worldforge/shared";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NarrationDock } from "./NarrationDock";

const narration: CampaignPlayNarration = {
  narrationId: "narration-1",
  turnId: "turn-1",
  beats: [
    { beatId: "beat-1", text: "The rain finds every rail." },
    { beatId: "beat-2", text: "A green signal wakes beyond the yard." },
  ],
  displayText: "The rain finds every rail. A green signal wakes beyond the yard.",
  suggestedActions: [],
  effects: [],
  createdAt: 100,
};

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

afterEach(() => vi.unstubAllGlobals());

describe("NarrationDock", () => {
  it("reveals authoritative beats in order with local presentation controls", () => {
    stubReducedMotion(false);
    const { container } = render(<NarrationDock narration={narration} />);
    const beats = within(container.querySelector(".campaign-play-narration-beats")!);

    expect(beats.getByText("The rain finds every rail.")).toBeInTheDocument();
    expect(beats.queryByText("A green signal wakes beyond the yard.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(beats.getByText("A green signal wakes beyond the yard.")).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  it("shows all beats immediately and disables Auto under reduced motion", () => {
    stubReducedMotion(true);
    const { container } = render(<NarrationDock narration={narration} />);
    const beats = within(container.querySelector(".campaign-play-narration-beats")!);

    expect(beats.getByText("The rain finds every rail.")).toBeInTheDocument();
    expect(beats.getByText("A green signal wakes beyond the yard.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auto off" })).toBeDisabled();
  });

  it("hydrates deterministic first-beat markup before applying reduced motion", async () => {
    stubReducedMotion(true);
    const container = document.createElement("div");
    container.innerHTML = renderToString(<NarrationDock narration={narration} />);
    expect(container.textContent?.includes("A green signal wakes beyond the yard.")).toBe(false);
    document.body.append(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const root = hydrateRoot(container, <NarrationDock narration={narration} />);
    await act(async () => undefined);

    expect(container.textContent?.includes("A green signal wakes beyond the yard.")).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
    consoleError.mockRestore();
  });
});
