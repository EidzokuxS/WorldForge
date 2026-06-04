import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OraclePanel, type OracleResultData } from "../oracle-panel";

const makeResult = (overrides: Partial<OracleResultData> = {}): OracleResultData => ({
  outcome: "strong_hit",
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

  it("does not render hidden oracle math or reasoning", () => {
    render(
      <OraclePanel
        result={{
          outcome: "strong_hit",
          chance: 80,
          roll: 55,
          reasoning: "The odds were in your favor.",
        } as OracleResultData}
      />,
    );

    expect(screen.getByText("Strong Hit")).toBeInTheDocument();
    expect(screen.queryByText(/Chance:/)).not.toBeInTheDocument();
    expect(screen.queryByText("55")).not.toBeInTheDocument();
    expect(screen.queryByText("The odds were in your favor.")).not.toBeInTheDocument();
  });
});
