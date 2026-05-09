import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationsSection } from "../locations-section";
import type { ScaffoldLocation } from "@/lib/api-types";

vi.mock("../regenerate-dialog", () => ({
  RegenerateDialog: () => <button data-testid="regenerate">Regenerate</button>,
}));

vi.mock("../tag-editor", () => ({
  TagEditor: () => <div data-testid="tag-editor" />,
}));

beforeAll(() => {
  Object.defineProperty(Element.prototype, "hasPointerCapture", {
    value: vi.fn(() => false),
    configurable: true,
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: vi.fn(),
    configurable: true,
  });
});

const makeLocation = (overrides: Partial<ScaffoldLocation> = {}): ScaffoldLocation => ({
  name: "Tavern",
  description: "A cozy tavern",
  tags: ["safe"],
  isStarting: true,
  connectedTo: [],
  ...overrides,
});

describe("LocationsSection", () => {
  const defaults = {
    locations: [makeLocation(), makeLocation({ name: "Forest", description: "A dark forest", isStarting: false })],
    onChange: vi.fn(),
    onRegenerate: vi.fn(),
    regenerating: false,
  };

  it("renders location cards with names", () => {
    render(<LocationsSection {...defaults} />);
    expect(screen.getByDisplayValue("Tavern")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Forest")).toBeInTheDocument();
  });

  it("renders the Locations heading and Add Location button", () => {
    render(<LocationsSection {...defaults} />);
    expect(screen.getByText("Locations")).toBeInTheDocument();
    expect(screen.getByText("Add Location")).toBeInTheDocument();
  });

  it("calls onChange with a new location when Add Location is clicked", () => {
    const onChange = vi.fn();
    render(<LocationsSection {...defaults} onChange={onChange} />);
    fireEvent.click(screen.getByText("Add Location"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const newLocations = onChange.mock.calls[0][0];
    expect(newLocations).toHaveLength(3);
    expect(newLocations[2].name).toBe("");
  });

  it("can update persistent sublocation kind and parent references without flattening the location", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LocationsSection
        {...defaults}
        locations={[
          makeLocation({ name: "Tavern", kind: "macro", parentLocationName: null }),
          makeLocation({ name: "Forest", kind: "macro", parentLocationName: null }),
          makeLocation({
            name: "Cellar",
            isStarting: false,
            kind: "persistent_sublocation",
            parentLocationName: "Tavern",
          }),
        ]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: /parent for cellar/i }));
    await user.click(await screen.findByRole("option", { name: "Forest" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Cellar",
          kind: "persistent_sublocation",
          parentLocationName: "Forest",
        }),
      ]),
    );

    await user.click(screen.getByRole("combobox", { name: /kind for cellar/i }));
    await user.click(await screen.findByRole("option", { name: "Macro" }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Cellar",
          kind: "macro",
          parentLocationName: null,
        }),
      ]),
    );
  });

  it("limits sublocation parents to macro locations and treats None as macro", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LocationsSection
        {...defaults}
        locations={[
          makeLocation({ name: "Tavern", kind: "macro", parentLocationName: null }),
          makeLocation({
            name: "Cellar",
            isStarting: false,
            kind: "persistent_sublocation",
            parentLocationName: "Tavern",
          }),
          makeLocation({
            name: "Hidden Alcove",
            isStarting: false,
            kind: "persistent_sublocation",
            parentLocationName: "Tavern",
          }),
        ]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: /parent for cellar/i }));
    expect(await screen.findByRole("option", { name: "Tavern" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Hidden Alcove" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "None" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Cellar",
          kind: "macro",
          parentLocationName: null,
        }),
      ]),
    );
  });

  it("does not offer persistent sublocation kind when no macro parent exists", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LocationsSection
        {...defaults}
        locations={[makeLocation({ name: "Lonely Tower", kind: "macro", parentLocationName: null })]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: /kind for lonely tower/i }));

    expect(await screen.findByRole("option", { name: "Macro" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Persistent sublocation" }),
    ).not.toBeInTheDocument();
  });
});
