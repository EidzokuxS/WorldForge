import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DisplayBeat } from "../types";
import { InspectDrawer } from "../inspect-drawer";

const mechanicBeat: DisplayBeat = {
  id: "mechanic-miss",
  kind: "mechanical_result",
  text: "Close call",
  mechanic: {
    label: "Close call",
    outcome: "miss",
  },
  rawDetails: {
    chance: 65,
    roll: 68,
    reasoning: "The timing almost works, but the platform crowd breaks line of sight.",
  },
};

describe("InspectDrawer", () => {
  it("renders the player-facing beat summary separately from oracle audit details", () => {
    render(
      <InspectDrawer
        currentBeat={mechanicBeat}
        oracleResult={{
          chance: 65,
          roll: 68,
          outcome: "miss",
          reasoning: "The timing almost works, but the platform crowd breaks line of sight.",
        }}
        status="Ready"
        showDebug={false}
        debugReasoning={null}
      />,
    );

    expect(screen.getByRole("tab", { name: "Beat" })).toBeInTheDocument();
    expect(screen.getByText("Close call")).toBeInTheDocument();
    expect(screen.getByText("Chance")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getByText("Roll")).toBeInTheDocument();
    expect(screen.getByText("68")).toBeInTheDocument();
    expect(screen.getByText("miss")).toBeInTheDocument();
    expect(screen.queryByText("Raw reasoning")).not.toBeInTheDocument();
    expect(screen.queryByText("JSON")).not.toBeInTheDocument();
    expect(screen.queryByText("payload")).not.toBeInTheDocument();
  });

  it("uses the UI-spec empty copy when no mechanics are available", () => {
    render(
      <InspectDrawer
        currentBeat={null}
        oracleResult={null}
        status="Ready"
        showDebug={false}
        debugReasoning={null}
      />,
    );

    expect(screen.getByText("No mechanics for the current beat. Raw details appear here only when available.")).toBeInTheDocument();
  });

  it("gates raw reasoning and debug payload affordances behind showDebug", () => {
    const { rerender } = render(
      <InspectDrawer
        currentBeat={mechanicBeat}
        oracleResult={null}
        status="Settling"
        showDebug={false}
        debugReasoning="Hidden chain-of-thought-like trace"
      />,
    );

    expect(screen.queryByText("Raw reasoning")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden chain-of-thought-like trace")).not.toBeInTheDocument();

    rerender(
      <InspectDrawer
        currentBeat={mechanicBeat}
        oracleResult={null}
        status="Settling"
        showDebug
        debugReasoning="Hidden chain-of-thought-like trace"
      />,
    );

    expect(screen.getByText("Raw reasoning")).toBeInTheDocument();
    expect(screen.getByText("Hidden chain-of-thought-like trace")).toBeInTheDocument();
  });
});
