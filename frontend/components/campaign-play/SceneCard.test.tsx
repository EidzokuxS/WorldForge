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
      />,
    )).toThrow("Unsupported Campaign Play actor accent");
  });
});
