import { createRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ActionDock } from "./ActionDock";

function Harness({ onFreeform, onSuggested }: {
  onFreeform: () => void;
  onSuggested: (choiceHandle: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return <ActionDock
    draft={draft}
    inputLocked={false}
    journalOpen={false}
    journalTriggerRef={createRef()}
    onDraftChange={setDraft}
    onJournalOpen={vi.fn()}
    onSubmitFreeform={onFreeform}
    onSubmitSuggested={onSuggested}
    pendingAdmission={false}
    suggestedActions={[{ choiceHandle: "choice-opaque", label: "Follow the lantern" }]}
    utilityActions={[]}
    suggestionsHeadingRef={createRef()}
    textareaRef={createRef()}
  />;
}

describe("ActionDock", () => {
  it("binds a suggestion by opaque handle without exposing the handle", async () => {
    const user = userEvent.setup();
    const onSuggested = vi.fn();
    const { container } = render(<Harness onFreeform={vi.fn()} onSuggested={onSuggested} />);
    const button = screen.getByRole("button", { name: "Follow the lantern" });
    expect(button).toHaveAttribute("data-choice-handle", "choice-opaque");
    await user.click(button);
    expect(onSuggested).toHaveBeenCalledWith("choice-opaque");
    expect(container).not.toHaveTextContent("choice-opaque");
  });

  it("submits freeform on Enter and keeps Shift+Enter for a newline", async () => {
    const user = userEvent.setup();
    const onFreeform = vi.fn();
    render(<Harness onFreeform={onFreeform} onSuggested={vi.fn()} />);
    const input = screen.getByLabelText("Your action");
    await user.type(input, "Listen at the door");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onFreeform).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onFreeform).toHaveBeenCalledOnce();
  });

  it("locks choices, draft, and admission together", () => {
    const { container } = render(<ActionDock
      draft="Wait"
      inputLocked
      journalOpen={false}
      journalTriggerRef={createRef()}
      onDraftChange={vi.fn()}
      onJournalOpen={vi.fn()}
      onSubmitFreeform={vi.fn()}
      onSubmitSuggested={vi.fn()}
      pendingAdmission
      suggestedActions={[{ choiceHandle: "choice-1", label: "Wait here" }]}
      utilityActions={[{ choiceHandle: "utility-wait", label: "Wait 10 minutes" }]}
      suggestionsHeadingRef={createRef()}
      textareaRef={createRef()}
    />);
    expect(screen.getByRole("button", { name: "Wait here" })).toBeDisabled();
    expect(screen.getByLabelText("Your action")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sending" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Wait 10 minutes" })).toBeDisabled();
    expect(container.firstElementChild).not.toHaveAttribute("aria-busy");
  });

  it("renders the utility wait outside the lettered story choices and submits its opaque handle", async () => {
    const user = userEvent.setup();
    const onSuggested = vi.fn();
    render(<ActionDock
      draft=""
      inputLocked={false}
      journalOpen={false}
      journalTriggerRef={createRef()}
      onDraftChange={vi.fn()}
      onJournalOpen={vi.fn()}
      onSubmitFreeform={vi.fn()}
      onSubmitSuggested={onSuggested}
      pendingAdmission={false}
      suggestedActions={[
        { choiceHandle: "story-a", label: "Follow the lantern" },
        { choiceHandle: "story-b", label: "Read the map" },
      ]}
      utilityActions={[{ choiceHandle: "utility-wait", label: "Wait 10 minutes" }]}
      suggestionsHeadingRef={createRef()}
      textareaRef={createRef()}
    />);
    const story = screen.getByRole("button", { name: /Follow the lantern/ });
    const utility = screen.getByRole("button", { name: "Wait 10 minutes" });
    expect(utility).toHaveAttribute("data-choice-handle", "utility-wait");
    expect(story.parentElement?.parentElement).toHaveClass("campaign-play-choices");
    expect(utility.parentElement).toHaveClass("campaign-play-utility-actions");
    expect(utility).not.toHaveTextContent("a.");
    await user.click(utility);
    expect(onSuggested).toHaveBeenCalledWith("utility-wait");
  });

  it("preserves a typed commitment binding when a delivery control is selected", async () => {
    const user = userEvent.setup();
    const onSuggested = vi.fn();
    const commitmentBinding = {
      commitmentHandle: "commitment-active",
      action: "deliver" as const,
      counterpartyHandle: "actor-orsa",
      subjectName: "Sealed dispatch",
      destinationHandle: "location-north-cut",
    };
    render(<ActionDock
      draft=""
      inputLocked={false}
      journalOpen={false}
      journalTriggerRef={createRef()}
      onDraftChange={vi.fn()}
      onJournalOpen={vi.fn()}
      onSubmitFreeform={vi.fn()}
      onSubmitSuggested={onSuggested}
      pendingAdmission={false}
      suggestedActions={[{
        choiceHandle: "choice-deliver-dispatch",
        label: "Deliver Sealed dispatch at North Cut",
        commitmentBinding,
      }]}
      utilityActions={[]}
      suggestionsHeadingRef={createRef()}
      textareaRef={createRef()}
    />);

    await user.click(screen.getByRole("button", {
      name: "Deliver Sealed dispatch at North Cut",
    }));
    expect(onSuggested).toHaveBeenCalledWith(
      "choice-deliver-dispatch",
      undefined,
      commitmentBinding,
    );
  });

  it("preserves a typed receivable binding when a collection control is selected", async () => {
    const user = userEvent.setup();
    const onSuggested = vi.fn();
    const obligationBinding = {
      obligationHandle: "obligation-aldous",
      debtorHandle: "actor-aldous",
      creditorHandle: "actor-mara",
      unitKey: "copper" as const,
      amount: 12,
    };
    render(<ActionDock
      draft=""
      inputLocked={false}
      journalOpen={false}
      journalTriggerRef={createRef()}
      onDraftChange={vi.fn()}
      onJournalOpen={vi.fn()}
      onSubmitFreeform={vi.fn()}
      onSubmitSuggested={onSuggested}
      pendingAdmission={false}
      suggestedActions={[{
        choiceHandle: "choice-collect-debt",
        label: "Collect 12 copper from Aldous Crane",
        obligationBinding,
      }]}
      utilityActions={[]}
      suggestionsHeadingRef={createRef()}
      textareaRef={createRef()}
    />);

    await user.click(screen.getByRole("button", {
      name: "Collect 12 copper from Aldous Crane",
    }));
    expect(onSuggested).toHaveBeenCalledWith(
      "choice-collect-debt",
      undefined,
      undefined,
      obligationBinding,
    );
  });
});
