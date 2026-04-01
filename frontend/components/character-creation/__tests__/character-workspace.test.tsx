import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CharacterWorkspace } from "@/components/character-creation/character-workspace";

describe("CharacterWorkspace", () => {
  it("renders input methods, editor content, summary context, and sticky actions", () => {
    render(
      <CharacterWorkspace
        entryMethods={<div>Entry methods</div>}
        editor={<div>Editor body</div>}
        summary={<div>Summary rail</div>}
        actions={<button type="button">Begin Adventure</button>}
      />,
    );

    expect(screen.getByText("Input Methods")).toBeInTheDocument();
    expect(screen.getByText("Entry methods")).toBeInTheDocument();
    expect(screen.getByText("Editor body")).toBeInTheDocument();
    expect(screen.getByText("Summary rail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Begin Adventure" })).toBeInTheDocument();
  });
});
