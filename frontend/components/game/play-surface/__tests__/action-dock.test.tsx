import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionDock } from "../action-dock";

describe("ActionDock", () => {
  it("submits trimmed freeform text only when input is non-empty and not busy", () => {
    const onChange = vi.fn();
    const onSubmitAction = vi.fn();

    render(
      <ActionDock
        value="  Scout ahead  "
        onChange={onChange}
        onSubmitAction={onSubmitAction}
        onContinue={vi.fn()}
        isBusy={false}
        quickActions={[]}
      />,
    );

    fireEvent.click(screen.getByLabelText("Send action"));

    expect(onSubmitAction).toHaveBeenCalledWith("Scout ahead");
  });

  it("keeps empty Send invalid while Continue can submit an empty draft", () => {
    const onSubmitAction = vi.fn();
    const onContinue = vi.fn();

    render(
      <ActionDock
        value="   "
        onChange={vi.fn()}
        onSubmitAction={onSubmitAction}
        onContinue={onContinue}
        isBusy={false}
        quickActions={[]}
      />,
    );

    expect(screen.getByLabelText("Send action")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSubmitAction).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("disables Send, Continue, and quick choices while busy", () => {
    render(
      <ActionDock
        value="Move closer"
        onChange={vi.fn()}
        onSubmitAction={vi.fn()}
        onContinue={vi.fn()}
        isBusy
        quickActions={[{ label: "Press forward", action: "Press forward" }]}
      />,
    );

    expect(screen.getByLabelText("Send action")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Press forward" })).toBeDisabled();
  });

  it("fires quick-choice callbacks only for supplied settled choices", () => {
    const onSubmitAction = vi.fn();

    render(
      <ActionDock
        value=""
        onChange={vi.fn()}
        onSubmitAction={onSubmitAction}
        onContinue={vi.fn()}
        isBusy={false}
        quickActions={[{ label: "Ask for details", action: "Ask for details" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ask for details" }));

    expect(onSubmitAction).toHaveBeenCalledWith("Ask for details");
  });

  it("keeps Continue beside the input and Send controls in the bottom action lane", () => {
    render(
      <ActionDock
        value=""
        onChange={vi.fn()}
        onSubmitAction={vi.fn()}
        onContinue={vi.fn()}
        isBusy={false}
        quickActions={[]}
      />,
    );

    const actionLane = screen.getByTestId("action-dock-input-lane");

    expect(actionLane).toContainElement(screen.getByLabelText("Scene action"));
    expect(actionLane).toContainElement(screen.getByLabelText("Send action"));
    expect(actionLane).toContainElement(screen.getByRole("button", { name: "Continue" }));
  });

  it("keeps touch-facing Send and Continue controls at the 44px target", () => {
    render(
      <ActionDock
        value=""
        onChange={vi.fn()}
        onSubmitAction={vi.fn()}
        onContinue={vi.fn()}
        isBusy={false}
        quickActions={[]}
      />,
    );

    expect(screen.getByLabelText("Send action")).toHaveClass("h-11", "w-11");
    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass("min-h-11");
  });

  it("keeps settled quick choices at the 44px touch target", () => {
    render(
      <ActionDock
        value=""
        onChange={vi.fn()}
        onSubmitAction={vi.fn()}
        onContinue={vi.fn()}
        isBusy={false}
        quickActions={[{ label: "Ask for details", action: "Ask for details" }]}
      />,
    );

    expect(screen.getByRole("button", { name: "Ask for details" })).toHaveClass("min-h-11");
  });

  it("allows long quick choices to wrap inside the dock instead of forcing overflow", () => {
    render(
      <ActionDock
        value=""
        onChange={vi.fn()}
        onSubmitAction={vi.fn()}
        onContinue={vi.fn()}
        isBusy={false}
        quickActions={[{
          label: "Follow the unbelievably specific lantern-route through the service corridor without losing sight of the warden",
          action: "Follow the route",
        }]}
      />,
    );

    expect(
      screen.getByRole("button", { name: /unbelievably specific lantern-route/i }),
    ).toHaveClass("max-w-full", "whitespace-normal");
  });

  it("does not expose action-category or transport semantics", () => {
    render(
      <ActionDock
        value=""
        onChange={vi.fn()}
        onSubmitAction={vi.fn()}
        onContinue={vi.fn()}
        isBusy={false}
        quickActions={[]}
      />,
    );

    for (const forbidden of ["Speak", "Act", "Observe", "Ask GM", "intent", "method"]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });

  it("preserves Enter-to-submit and Shift+Enter newline behavior", () => {
    const onSubmitAction = vi.fn();

    render(
      <ActionDock
        value="Check the alley"
        onChange={vi.fn()}
        onSubmitAction={onSubmitAction}
        onContinue={vi.fn()}
        isBusy={false}
        quickActions={[]}
      />,
    );

    const input = screen.getByLabelText("Scene action");

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmitAction).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSubmitAction).toHaveBeenCalledWith("Check the alley");
  });
});
