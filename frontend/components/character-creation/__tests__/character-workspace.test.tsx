import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CharacterWorkspace } from "@/components/character-creation/character-workspace";

describe("CharacterWorkspace", () => {
  it("renders children as a minimal container", () => {
    render(
      <CharacterWorkspace>
        <div>Character content</div>
        <button type="button">Begin Adventure</button>
      </CharacterWorkspace>,
    );

    expect(screen.getByText("Character content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Begin Adventure" })).toBeInTheDocument();
  });
});
