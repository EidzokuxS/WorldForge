import { render, screen } from "@testing-library/react";
import type { CampaignPlayConsequenceCue } from "@worldforge/shared";
import { describe, expect, it } from "vitest";

import { ConsequenceCard } from "./ConsequenceCard";

const labels: Array<[CampaignPlayConsequenceCue, string]> = [
  ["your_action", "Your action"],
  ["direct_perception", "You notice"],
  ["visible_aftermath", "Visible aftermath"],
  ["route_change", "Route changed"],
  ["witness_report", "Reported to you"],
];

describe("ConsequenceCard", () => {
  it.each(labels)("renders the public %s cue as %s", (causalCue, label) => {
    const { container } = render(<ConsequenceCard consequence={{
      observationHandle: "private-opaque-handle",
      whatChanged: "The eastern gate is sealed.",
      whereOrRoute: "Eastern gate",
      worldTimeLabel: "Before dawn",
      causalCue,
    }} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("The eastern gate is sealed.")).toBeInTheDocument();
    expect(screen.getByText("Eastern gate")).toBeInTheDocument();
    expect(screen.getByText("Before dawn")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("private-opaque-handle");
  });
});
