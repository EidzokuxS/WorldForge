import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CampaignPlayCharacterDraft } from "@worldforge/shared";

import { CampaignPlayerEditor } from "./campaign-player-editor";

const draft: CampaignPlayCharacterDraft = {
  name: "Iria Vale",
  summary: "Cartographer",
  species: "Human",
  gender: "Woman",
  ageText: "31",
  appearance: "Ink-stained hands",
  biography: "Maps a flooded city",
  personality: {
    summary: "Patient",
    voice: "Measured",
    decisionStyle: "Evidence first",
    worldview: "Places leave traces",
    contradictions: ["Restless homebody"],
    mythology: "Rivers remember",
    sampleLines: ["Show me the road"],
  },
  motives: ["Finish the map"],
  beliefs: ["Maps are promises"],
  drives: ["Discover"],
  traits: ["Patient"],
  skills: [{ name: "Cartography", tier: "Master" }],
  flaws: ["Overcautious"],
  specialties: ["Rivers"],
  inventory: ["Journal"],
  signatureItems: ["Compass"],
  source: { kind: "generated", importMode: null, label: "Cartographer" },
};

describe("CampaignPlayerEditor", () => {
  it("renders every editable character profile lane and provenance", () => {
    render(<CampaignPlayerEditor draft={draft} onChange={vi.fn()} />);

    for (const label of ["Name", "Species", "Age", "Gender", "Summary", "Appearance", "Biography", "Personality", "Voice", "Decision style", "Worldview", "Personal mythology"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const value of ["Contradictions", "Sample lines", "Motives", "Beliefs", "Drives", "Traits", "Flaws", "Specialties", "Inventory", "Signature items", "Skills"]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText("Source · generated · Cartographer")).toBeInTheDocument();
  });

  it("returns a complete draft when a scalar field changes", () => {
    const onChange = vi.fn();
    render(<CampaignPlayerEditor draft={draft} onChange={onChange} />);

    fireEvent.change(screen.getByDisplayValue("Iria Vale"), { target: { value: "Iria North" } });

    expect(onChange).toHaveBeenCalledWith({ ...draft, name: "Iria North" });
  });
});
