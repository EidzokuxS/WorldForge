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
    suggestionsHeadingRef={createRef()}
    textareaRef={createRef()}
  />;
}

describe("ActionDock", () => {
  it("binds a suggestion by opaque handle without exposing the handle", async () => {
    const user = userEvent.setup();
    const onSuggested = vi.fn();
    const { container } = render(<Harness onFreeform={vi.fn()} onSuggested={onSuggested} />);
    await user.click(screen.getByRole("button", { name: "Follow the lantern" }));
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
      suggestionsHeadingRef={createRef()}
      textareaRef={createRef()}
    />);
    expect(screen.getByRole("button", { name: "Wait here" })).toBeDisabled();
    expect(screen.getByLabelText("Your action")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sending" })).toBeDisabled();
    expect(container.firstElementChild).not.toHaveAttribute("aria-busy");
  });
});
