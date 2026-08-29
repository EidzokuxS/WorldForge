import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SceneCard } from "./SceneCard";

describe("SceneCard", () => {
  it("renders only public scene, presence, route, and pressure fields", () => {
    render(
      <SceneCard
        location={{ handle: "location-secret", name: "Signal Yard", description: "Rain ticks on dead rails." }}
        actors={[{
          handle: "actor-secret",
          name: "Ilya Venn",
          monogram: "IV",
          descriptor: "A watchful signal keeper",
          accent: "cobalt",
        }]}
        routes={[{
          handle: "route-secret",
          destinationHandle: "destination-secret",
          destinationName: "North Cut",
          state: "restricted",
          travelTimeLabel: "Twenty minutes on foot",
        }]}
        pressures={[{
          handle: "pressure-secret",
          label: "The late train",
          summary: "Its lamps are visible beyond the rain.",
        }]}
        possessions={[{
          handle: "possession-secret",
          name: "Brass signal key",
          quantity: 2,
        }]}
        obligations={[{
          handle: "obligation-secret",
          direction: "payable",
          counterpartyHandle: "actor-creditor-secret",
          counterpartyName: "Orsa Pell",
          unitKey: "copper",
          outstandingAmount: 16,
        }, {
          handle: "receivable-secret",
          direction: "receivable",
          counterpartyHandle: "actor-debtor-secret",
          counterpartyName: "Mara Venn",
          unitKey: "copper",
          outstandingAmount: 4,
        }]}
        commitments={[]}
        consequences={[{
          observationHandle: "observation-secret",
          performingActorHandle: null,
          performingActorName: null,
          whatChanged: "The North Cut is now restricted.",
          whereOrRoute: "North Cut",
          worldTimeLabel: "Before dawn",
          causalCue: "route_change",
        }]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Signal Yard" })).toBeInTheDocument();
    expect(screen.getByText("Ilya Venn")).toBeInTheDocument();
    expect(screen.getByText("A watchful signal keeper")).toBeInTheDocument();
    const routes = screen.getByRole("region", { name: "Ways onward" });
    expect(within(routes).getByText("North Cut")).toBeInTheDocument();
    expect(within(routes).getByText("Restricted")).toBeInTheDocument();
    expect(screen.getByText("The late train")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Carrying" })).toHaveTextContent("Brass signal key×2");
    const accounts = screen.getByRole("region", { name: "Accounts" });
    expect(accounts).toHaveTextContent("You owe Orsa Pell16 copper");
    expect(accounts).toHaveTextContent("Mara Venn owes you4 copper");
    expect(screen.getByRole("region", { name: "What changed" })).toHaveTextContent("Route changed");
    expect(document.body.textContent?.includes("secret")).toBe(false);
  });

  it("fails closed for an accent outside the public renderer contract", () => {
    expect(() => render(
      <SceneCard
        location={{ handle: "location-1", name: "Signal Yard", description: "Rain." }}
        actors={[{
          handle: "actor-1",
          name: "Ilya",
          monogram: "I",
          descriptor: "Keeper",
          accent: "ultraviolet",
        }]}
        routes={[]}
        pressures={[]}
        possessions={[]}
        obligations={[]}
        commitments={[]}
      />,
    )).toThrow("Unsupported Campaign Play actor accent");
  });

  it("shows active and completed work with exact terms without exposing handles", () => {
    render(
      <SceneCard
        location={{ handle: "location-1", name: "Signal Yard", description: "Rain." }}
        actors={[]}
        routes={[]}
        pressures={[]}
        possessions={[]}
        obligations={[]}
        commitments={[{
          handle: "commitment-public-active",
          kind: "paid_delivery",
          status: "active",
          counterpartyHandle: "counterparty-public-active",
          counterpartyName: "Orsa Pell",
          title: "Carry the sealed dispatch",
          subjectName: "Sealed dispatch",
          destinationHandle: "destination-public-active",
          destinationName: "North Cut",
          feeUnit: "copper",
          feeAmount: 16,
          paymentTiming: "on_completion",
          dueWorldTimeLabel: "Before dawn",
        }, {
          handle: "commitment-public-completed",
          kind: "paid_delivery",
          status: "completed",
          counterpartyHandle: "counterparty-public-completed",
          counterpartyName: "Ilya Venn",
          title: "Return the signal key",
          subjectName: "Brass signal key",
          destinationHandle: "destination-public-completed",
          destinationName: "Signal Yard",
          feeUnit: "copper",
          feeAmount: 8,
          paymentTiming: "on_completion",
          dueWorldTimeLabel: null,
        }]}
      />,
    );

    const work = screen.getByRole("region", { name: "Work" });
    expect(work).toHaveTextContent("Carry the sealed dispatch");
    expect(work).toHaveTextContent("Sealed dispatch · to North Cut");
    expect(work).toHaveTextContent("For Orsa Pell");
    expect(work).toHaveTextContent("16 copper · on completion");
    expect(work).toHaveTextContent("Due Before dawn");
    expect(within(work).getByLabelText("Work status: Active")).toBeInTheDocument();
    expect(within(work).getByLabelText("Work status: Completed")).toBeInTheDocument();
    expect(work).toHaveTextContent("Return the signal key");
    expect(work).toHaveTextContent("8 copper · on completion");
    expect(work.textContent).not.toContain("commitment-public");
    expect(work.textContent).not.toContain("counterparty-public");
    expect(work.textContent).not.toContain("destination-public");
  });

  it("shows unpaid work without fabricating a fee", () => {
    render(
      <SceneCard
        location={{ handle: "location-1", name: "Signal Yard", description: "Rain." }}
        actors={[]}
        routes={[]}
        pressures={[]}
        possessions={[]}
        obligations={[]}
        commitments={[{
          handle: "commitment-public-unpaid",
          kind: "unpaid_delivery",
          status: "active",
          counterpartyHandle: "counterparty-public-joss",
          counterpartyName: "Joss Pebbler",
          title: "Carry the evacuation roll",
          subjectName: "Evacuation signature roll",
          destinationHandle: "destination-public-quayside",
          destinationName: "Quayside Landing",
          dueWorldTimeLabel: null,
        }]}
      />,
    );

    const work = screen.getByRole("region", { name: "Work" });
    expect(work).toHaveTextContent("Carry the evacuation roll");
    expect(work).toHaveTextContent("No payment offered");
    expect(work.textContent).not.toContain("copper");
  });
});
