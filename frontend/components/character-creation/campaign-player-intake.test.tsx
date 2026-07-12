import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CampaignPlayerIntake } from "./campaign-player-intake";

describe("CampaignPlayerIntake", () => {
  it("can delegate the player concept to the accepted world", () => {
    const onDraft = vi.fn();
    render(
      <CampaignPlayerIntake
        busy="idle"
        onDraft={onDraft}
        onResearch={vi.fn()}
        onCard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Let the world decide" }));

    expect(onDraft).toHaveBeenCalledWith(
      "Create a grounded player character who belongs in this accepted world and has a life beyond the opening scene.",
    );
  });
});
