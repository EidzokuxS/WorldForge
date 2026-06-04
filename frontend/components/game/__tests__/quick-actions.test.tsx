import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickActions, type QuickAction } from "../quick-actions";

const sampleActions: QuickAction[] = [
  {
    label: "Look around",
    action: "look around",
    handle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  {
    label: "Check inventory",
    action: "check inventory",
    handle: "qac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
  {
    label: "Rest",
    action: "rest",
    handle: "qac_cccccccccccccccccccccccccccccccc",
  },
];

describe("QuickActions", () => {
  it("renders nothing when actions array is empty", () => {
    const { container } = render(
      <QuickActions actions={[]} onAction={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders all action buttons", () => {
    render(<QuickActions actions={sampleActions} onAction={vi.fn()} />);
    expect(screen.getByText("Look around")).toBeInTheDocument();
    expect(screen.getByText("Check inventory")).toBeInTheDocument();
    expect(screen.getByText("Rest")).toBeInTheDocument();
  });

  it("calls onAction with the action string when clicked", async () => {
    const onAction = vi.fn();
    render(<QuickActions actions={sampleActions} onAction={onAction} />);
    await userEvent.click(screen.getByText("Look around"));
    expect(onAction).toHaveBeenCalledWith("look around", {
      quickActionHandle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });

  it("disables all buttons when disabled is true", () => {
    render(
      <QuickActions actions={sampleActions} onAction={vi.fn()} disabled={true} />
    );
    const buttons = screen.getAllByRole("button");
    for (const button of buttons) {
      expect(button).toBeDisabled();
    }
  });

  it("does not call onAction when button is disabled", async () => {
    const onAction = vi.fn();
    render(
      <QuickActions
        actions={sampleActions}
        onAction={onAction}
        disabled={true}
      />
    );
    await userEvent.click(screen.getByText("Rest"));
    expect(onAction).not.toHaveBeenCalled();
  });
});
