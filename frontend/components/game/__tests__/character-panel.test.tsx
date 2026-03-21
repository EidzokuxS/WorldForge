import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CharacterPanel } from "../character-panel";

const makePlayer = (overrides = {}) => ({
  id: "p1",
  name: "Elara",
  race: "Elf",
  gender: "Female",
  age: "120",
  appearance: "Silver hair, emerald eyes",
  hp: 3,
  tags: ["brave", "arcane"],
  equippedItems: ["Enchanted Staff"],
  currentLocationId: "loc1",
  ...overrides,
});

describe("CharacterPanel", () => {
  it("shows 'No character loaded' when player is null", () => {
    render(
      <CharacterPanel player={null} items={[]} locationName={null} />
    );
    expect(screen.getByText("No character loaded")).toBeInTheDocument();
  });

  it("renders player name", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        items={[]}
        locationName={null}
      />
    );
    expect(screen.getByText("Elara")).toBeInTheDocument();
  });

  it("renders race, gender, age line", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        items={[]}
        locationName={null}
      />
    );
    expect(screen.getByText(/Elf/)).toBeInTheDocument();
    expect(screen.getByText(/Female/)).toBeInTheDocument();
    expect(screen.getByText(/120/)).toBeInTheDocument();
  });

  it("renders appearance text", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        items={[]}
        locationName={null}
      />
    );
    expect(
      screen.getByText("Silver hair, emerald eyes")
    ).toBeInTheDocument();
  });

  it("displays HP as x/5", () => {
    render(
      <CharacterPanel
        player={makePlayer({ hp: 3 })}
        items={[]}
        locationName={null}
      />
    );
    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("renders tags", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        items={[]}
        locationName={null}
      />
    );
    expect(screen.getByText("brave")).toBeInTheDocument();
    expect(screen.getByText("arcane")).toBeInTheDocument();
  });

  it("renders equipped items", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        items={[]}
        locationName={null}
      />
    );
    expect(screen.getByText(/Enchanted Staff/)).toBeInTheDocument();
  });

  it("renders inventory items with tags", () => {
    const items = [
      { id: "i1", name: "Healing Potion", tags: ["consumable", "rare"] },
    ];
    render(
      <CharacterPanel
        player={makePlayer()}
        items={items}
        locationName={null}
      />
    );
    expect(screen.getByText(/Healing Potion/)).toBeInTheDocument();
    expect(screen.getByText("(consumable, rare)")).toBeInTheDocument();
  });

  it("shows (empty) when inventory is empty", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        items={[]}
        locationName={null}
      />
    );
    expect(screen.getByText("(empty)")).toBeInTheDocument();
  });

  it("renders location name when provided", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        items={[]}
        locationName="Enchanted Forest"
      />
    );
    expect(screen.getByText("Enchanted Forest")).toBeInTheDocument();
  });

  it("renders portrait when portraitUrl is provided", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        items={[]}
        locationName={null}
        portraitUrl="/portraits/elara.png"
      />
    );
    const img = screen.getByAltText("Portrait of Elara");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/portraits/elara.png");
  });
});
