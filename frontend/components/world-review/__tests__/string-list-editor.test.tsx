import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StringListEditor } from "../string-list-editor";

describe("StringListEditor", () => {
  it("renders existing items", () => {
    render(
      <StringListEditor items={["Goal A", "Goal B"]} onChange={vi.fn()} placeholder="Add goal..." />
    );
    expect(screen.getByText("Goal A")).toBeInTheDocument();
    expect(screen.getByText("Goal B")).toBeInTheDocument();
  });

  it("adds an item on Enter key press", () => {
    const onChange = vi.fn();
    render(
      <StringListEditor items={["Goal A"]} onChange={onChange} placeholder="Add goal..." />
    );
    const input = screen.getByPlaceholderText("Add goal...");
    fireEvent.change(input, { target: { value: "Goal C" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["Goal A", "Goal C"]);
  });

  it("removes an item when the remove button is clicked", () => {
    const onChange = vi.fn();
    render(
      <StringListEditor items={["Goal A", "Goal B"]} onChange={onChange} placeholder="Add goal..." />
    );
    // Each item has a remove button
    const removeButtons = screen.getAllByRole("button").filter(
      (btn) => !btn.textContent?.trim() || btn.querySelector("svg")
    );
    // The first remove button corresponds to "Goal A"
    fireEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith(["Goal B"]);
  });

  it("does not add empty items", () => {
    const onChange = vi.fn();
    render(
      <StringListEditor items={[]} onChange={onChange} placeholder="Add goal..." />
    );
    const input = screen.getByPlaceholderText("Add goal...");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
