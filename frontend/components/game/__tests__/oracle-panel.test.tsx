import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OraclePanel, type OracleResultData } from "../oracle-panel";

const makeResult = (overrides: Partial<OracleResultData> = {}): OracleResultData => ({
  chance: 75,
  roll: 42,
  outcome: "strong_hit",
  reasoning: "The odds were in your favor.",
  ...overrides,
});

describe("OraclePanel", () => {
  it("renders nothing when result is null", () => {
    const { container } = render(<OraclePanel result={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Strong Hit outcome label", () => {
    render(<OraclePanel result={makeResult({ outcome: "strong_hit" })} />);
    expect(screen.getByText("Strong Hit")).toBeInTheDocument();
  });

  it("renders Weak Hit outcome label", () => {
    render(<OraclePanel result={makeResult({ outcome: "weak_hit" })} />);
    expect(screen.getByText("Weak Hit")).toBeInTheDocument();
  });

  it("renders Miss outcome label", () => {
    render(<OraclePanel result={makeResult({ outcome: "miss" })} />);
    expect(screen.getByText("Miss")).toBeInTheDocument();
  });

  it("displays chance and roll values", () => {
    render(<OraclePanel result={makeResult({ chance: 80, roll: 55 })} />);
    expect(screen.getByText("Chance: 80% | Roll: 55")).toBeInTheDocument();
  });

  it("shows reasoning text by default", () => {
    render(<OraclePanel result={makeResult()} />);
    expect(
      screen.getByText("The odds were in your favor.")
    ).toBeInTheDocument();
  });

  it("hides reasoning after clicking toggle, shows again on second click", async () => {
    render(<OraclePanel result={makeResult()} />);
    expect(
      screen.getByText("The odds were in your favor.")
    ).toBeInTheDocument();

    // Click to collapse
    const toggleButton = screen.getByRole("button");
    await userEvent.click(toggleButton);
    expect(
      screen.queryByText("The odds were in your favor.")
    ).not.toBeInTheDocument();

    // Click to expand
    await userEvent.click(toggleButton);
    expect(
      screen.getByText("The odds were in your favor.")
    ).toBeInTheDocument();
  });
});
