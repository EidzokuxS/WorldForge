import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CreationModes } from "../creation-modes";

describe("CreationModes", () => {
  it("renders exactly four tab buttons", () => {
    render(<CreationModes mode={null} onModeChange={() => {}} busy={false} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
  });

  it("renders default labels for all four modes", () => {
    render(<CreationModes mode={null} onModeChange={() => {}} busy={false} />);
    expect(screen.getByRole("tab", { name: /describe character from free text/i })).toHaveTextContent("Describe");
    expect(screen.getByRole("tab", { name: /generate character from scratch/i })).toHaveTextContent("AI Generate");
    expect(screen.getByRole("tab", { name: /research archetype/i })).toHaveTextContent("Research Archetype");
    expect(screen.getByRole("tab", { name: /import sillytavern/i })).toHaveTextContent("Import V2 Card");
  });

  it("fires onModeChange with the mode when clicked from null", () => {
    const onModeChange = vi.fn();
    render(<CreationModes mode={null} onModeChange={onModeChange} busy={false} />);
    fireEvent.click(screen.getByRole("tab", { name: /describe character from free text/i }));
    expect(onModeChange).toHaveBeenCalledWith("parse");
  });

  it("toggles the active mode off (null) when the active tab is clicked again", () => {
    const onModeChange = vi.fn();
    render(<CreationModes mode="parse" onModeChange={onModeChange} busy={false} />);
    fireEvent.click(screen.getByRole("tab", { name: /describe character from free text/i }));
    expect(onModeChange).toHaveBeenCalledWith(null);
  });

  it("disables all tabs when busy=true", () => {
    render(<CreationModes mode={null} onModeChange={() => {}} busy />);
    const tabs = screen.getAllByRole("tab") as HTMLButtonElement[];
    for (const tab of tabs) {
      expect(tab.disabled).toBe(true);
    }
  });

  it("disables only the tabs listed in disabledModes", () => {
    render(
      <CreationModes
        mode={null}
        onModeChange={() => {}}
        busy={false}
        disabledModes={["generate"]}
      />,
    );
    const generateTab = screen.getByRole("tab", { name: /generate character from scratch/i }) as HTMLButtonElement;
    const parseTab = screen.getByRole("tab", { name: /describe character from free text/i }) as HTMLButtonElement;
    expect(generateTab.disabled).toBe(true);
    expect(parseTab.disabled).toBe(false);
  });

  it("marks the active mode with aria-selected=true", () => {
    render(<CreationModes mode="research" onModeChange={() => {}} busy={false} />);
    const research = screen.getByRole("tab", { name: /research archetype/i });
    expect(research).toHaveAttribute("aria-selected", "true");
    const parse = screen.getByRole("tab", { name: /describe character from free text/i });
    expect(parse).toHaveAttribute("aria-selected", "false");
  });
});
