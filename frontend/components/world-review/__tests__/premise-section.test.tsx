import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PremiseSection } from "../premise-section";

// Stub the regenerate dialog to avoid radix portal issues in jsdom
vi.mock("../regenerate-dialog", () => ({
  RegenerateDialog: ({ sectionName }: { sectionName: string }) => (
    <button data-testid="regenerate">{`Regenerate ${sectionName}`}</button>
  ),
}));

describe("PremiseSection", () => {
  const defaults = {
    refinedPremise: "A dark fantasy world ruled by undead lords.",
    onChange: vi.fn(),
    onRegenerate: vi.fn(),
    regenerating: false,
  };

  it("renders the premise text in the textarea", () => {
    render(<PremiseSection {...defaults} />);
    const textarea = screen.getByPlaceholderText("Describe your world premise...");
    expect(textarea).toHaveValue("A dark fantasy world ruled by undead lords.");
  });

  it("renders the Premise heading", () => {
    render(<PremiseSection {...defaults} />);
    expect(screen.getByText("Premise")).toBeInTheDocument();
  });

  it("calls onChange when the textarea value changes", () => {
    const onChange = vi.fn();
    render(<PremiseSection {...defaults} onChange={onChange} />);
    const textarea = screen.getByPlaceholderText("Describe your world premise...");
    fireEvent.change(textarea, { target: { value: "New premise" } });
    expect(onChange).toHaveBeenCalledWith("New premise");
  });

  it("renders the regenerate button", () => {
    render(<PremiseSection {...defaults} />);
    expect(screen.getByTestId("regenerate")).toBeInTheDocument();
  });
});
