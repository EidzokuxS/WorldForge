import { createRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { JournalDrawer } from "./JournalDrawer";

const version = { acceptedWorldVersion: 2, worldVersion: 3, runtimeRevision: 4 };

describe("JournalDrawer", () => {
  it("loads earned pages through nextCursor and renders only public observation fields", async () => {
    const loadPage = vi.fn()
      .mockResolvedValueOnce({
        ...version,
        campaignId: "campaign-1",
        entries: [{
          observationHandle: "observation-hidden",
          title: "A sealed road",
          text: "The eastern gate closed before dawn.",
          whereOrRoute: "Eastern gate",
          worldTimeLabel: "Before dawn",
          consequence: null,
        }],
        nextCursor: 1,
      })
      .mockResolvedValueOnce({
        ...version,
        campaignId: "campaign-1",
        entries: [{
          observationHandle: "observation-two",
          title: "A witness returns",
          text: "A courier brings word from the ridge.",
          whereOrRoute: null,
          worldTimeLabel: "Morning",
          consequence: null,
        }],
        nextCursor: null,
      });
    const { container } = render(<JournalDrawer loadPage={loadPage} onClose={vi.fn()} open returnFocusRef={createRef()} />);

    expect(await screen.findByText("A sealed road")).toBeInTheDocument();
    const loadMore = screen.getByRole("button", { name: "Earlier observations" });
    loadMore.focus();
    fireEvent.click(loadMore);
    expect(await screen.findByText("A witness returns")).toBeInTheDocument();
    expect(loadPage).toHaveBeenNthCalledWith(1, 0);
    expect(loadPage).toHaveBeenNthCalledWith(2, 1);
    expect(container).not.toHaveTextContent("observation-hidden");
    await waitFor(() => expect(screen.getByRole("button", { name: "Close journal" })).toHaveFocus());
  });

  it("traps focus, closes on Escape, and restores the trigger", async () => {
    const user = userEvent.setup();
    const triggerRef = createRef<HTMLButtonElement>();
    const onClose = vi.fn();
    render(<>
      <button ref={triggerRef}>Journal trigger</button>
      <JournalDrawer
        loadPage={vi.fn().mockResolvedValue({ ...version, campaignId: "campaign-1", entries: [], nextCursor: null })}
        onClose={onClose}
        open
        returnFocusRef={triggerRef}
      />
    </>);

    const close = screen.getByRole("button", { name: "Close journal" });
    await waitFor(() => expect(close).toHaveFocus());
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(triggerRef.current).toHaveFocus());
  });

  it("distinguishes an empty journal from a failed load", async () => {
    const empty = render(<JournalDrawer
      loadPage={vi.fn().mockResolvedValue({ ...version, campaignId: "campaign-1", entries: [], nextCursor: null })}
      onClose={vi.fn()}
      open
      returnFocusRef={createRef()}
    />);
    expect(await screen.findByText("Nothing has reached your journal yet.")).toBeInTheDocument();
    empty.unmount();

    let finishRetry: ((page: {
      acceptedWorldVersion: number;
      campaignId: string;
      entries: never[];
      nextCursor: null;
      runtimeRevision: number;
      worldVersion: number;
    }) => void) | undefined;
    const retryPage = new Promise<{
      acceptedWorldVersion: number;
      campaignId: string;
      entries: never[];
      nextCursor: null;
      runtimeRevision: number;
      worldVersion: number;
    }>((resolve) => {
      finishRetry = resolve;
    });
    const retryLoad = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockReturnValueOnce(retryPage);
    render(<JournalDrawer loadPage={retryLoad} onClose={vi.fn()} open returnFocusRef={createRef()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The journal could not be opened.");
    const retry = screen.getByRole("button", { name: "Try again" });
    retry.focus();
    fireEvent.click(retry);
    const close = screen.getByRole("button", { name: "Close journal" });
    expect(close).toHaveFocus();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    finishRetry?.({ ...version, campaignId: "campaign-1", entries: [], nextCursor: null });
    expect(await screen.findByText("Nothing has reached your journal yet.")).toBeInTheDocument();
    await waitFor(() => expect(close).toHaveFocus());
  });
});
