import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagEditor } from "../tag-editor";

describe("TagEditor", () => {
  it("renders existing tags as badges", () => {
    render(<TagEditor tags={["fire", "ice"]} onChange={vi.fn()} />);
    expect(screen.getByText("fire")).toBeInTheDocument();
    expect(screen.getByText("ice")).toBeInTheDocument();
  });

  it("adds a tag on Enter key press", () => {
    const onChange = vi.fn();
    render(<TagEditor tags={["fire"]} onChange={onChange} />);
    const input = screen.getByPlaceholderText("Add tag...");
    fireEvent.change(input, { target: { value: "wind" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["fire", "wind"]);
  });

  it("does not add a duplicate tag", () => {
    const onChange = vi.fn();
    render(<TagEditor tags={["fire"]} onChange={onChange} />);
    const input = screen.getByPlaceholderText("Add tag...");
    fireEvent.change(input, { target: { value: "fire" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a tag when the remove button is clicked", () => {
    const onChange = vi.fn();
    render(<TagEditor tags={["fire", "ice"]} onChange={onChange} />);
    // Each tag badge has a remove button — click the first one
    const removeButtons = screen.getAllByRole("button");
    fireEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith(["ice"]);
  });
});
