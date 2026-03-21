import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionBar } from "../action-bar";

describe("ActionBar", () => {
  const defaultProps = {
    value: "",
    isLoading: false,
    onChange: vi.fn(),
    onSubmit: vi.fn(),
  };

  it("renders textarea with placeholder", () => {
    render(<ActionBar {...defaultProps} />);
    expect(
      screen.getByPlaceholderText("Describe your action...")
    ).toBeInTheDocument();
  });

  it("calls onChange when user types", async () => {
    const onChange = vi.fn();
    render(<ActionBar {...defaultProps} onChange={onChange} />);
    const textarea = screen.getByPlaceholderText("Describe your action...");
    fireEvent.change(textarea, { target: { value: "attack" } });
    expect(onChange).toHaveBeenCalledWith("attack");
  });

  it("disables submit button when value is empty", () => {
    render(<ActionBar {...defaultProps} value="" />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("enables submit button when value is non-empty", () => {
    render(<ActionBar {...defaultProps} value="do something" />);
    const button = screen.getByRole("button");
    expect(button).not.toBeDisabled();
  });

  it("calls onSubmit when button is clicked", async () => {
    const onSubmit = vi.fn();
    render(
      <ActionBar {...defaultProps} value="attack the dragon" onSubmit={onSubmit} />
    );
    const button = screen.getByRole("button");
    await userEvent.click(button);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("calls onSubmit on Enter key (without Shift)", () => {
    const onSubmit = vi.fn();
    render(
      <ActionBar {...defaultProps} value="attack" onSubmit={onSubmit} />
    );
    const textarea = screen.getByPlaceholderText("Describe your action...");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("does NOT call onSubmit on Shift+Enter", () => {
    const onSubmit = vi.fn();
    render(
      <ActionBar {...defaultProps} value="attack" onSubmit={onSubmit} />
    );
    const textarea = screen.getByPlaceholderText("Describe your action...");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows character counter when value is non-empty", () => {
    render(<ActionBar {...defaultProps} value="hello" />);
    expect(screen.getByText("5/1000")).toBeInTheDocument();
  });

  it("disables textarea and button when isLoading is true", () => {
    render(<ActionBar {...defaultProps} value="attack" isLoading={true} />);
    const textarea = screen.getByPlaceholderText("Describe your action...");
    expect(textarea).toBeDisabled();
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("disables textarea and button when disabled prop is true", () => {
    render(<ActionBar {...defaultProps} value="attack" disabled={true} />);
    const textarea = screen.getByPlaceholderText("Describe your action...");
    expect(textarea).toBeDisabled();
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });
});
