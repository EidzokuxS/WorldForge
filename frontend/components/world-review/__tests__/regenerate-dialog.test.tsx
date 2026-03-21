import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RegenerateDialog } from "../regenerate-dialog";

describe("RegenerateDialog", () => {
  const defaults = {
    sectionName: "Locations",
    onConfirm: vi.fn(),
    regenerating: false,
  };

  it("renders the Regenerate trigger button", () => {
    render(<RegenerateDialog {...defaults} />);
    expect(screen.getByText("Regenerate")).toBeInTheDocument();
  });

  it("disables the trigger button when regenerating", () => {
    render(<RegenerateDialog {...defaults} regenerating={true} />);
    const button = screen.getByRole("button", { name: /regenerate/i });
    expect(button).toBeDisabled();
  });

  it("opens dialog and shows section name, instruction field, and confirm button", () => {
    render(<RegenerateDialog {...defaults} />);
    fireEvent.click(screen.getByText("Regenerate"));
    expect(screen.getByText("Regenerate Locations")).toBeInTheDocument();
    expect(screen.getByLabelText(/additional instruction/i)).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onConfirm with undefined when no instruction is provided", () => {
    const onConfirm = vi.fn();
    render(<RegenerateDialog {...defaults} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Regenerate"));
    fireEvent.click(screen.getByText("Confirm"));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });
});
