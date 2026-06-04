import { describe, expect, it } from "vitest";
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
  currentLocationId: "loc1",
  ...overrides,
});

const makeEquippedItems = () => [
  {
    id: "eq-1",
    name: "Enchanted Staff",
    tags: ["weapon"],
    equipState: "equipped" as const,
    equippedSlot: "hand",
    isSignature: false,
  },
];

const makeCarriedItems = () => [
  {
    id: "i1",
    name: "Healing Potion",
    tags: ["consumable", "rare"],
    equipState: "carried" as const,
    equippedSlot: null,
    isSignature: false,
  },
];

describe("CharacterPanel", () => {
  it("shows 'No character loaded' when player is null", () => {
    render(
      <CharacterPanel
        player={null}
        carriedItems={[]}
        equippedItems={[]}
        locationName={null}
      />
    );
    expect(screen.getByText("No character loaded")).toBeInTheDocument();
  });

  it("renders player name", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        carriedItems={[]}
        equippedItems={[]}
        locationName={null}
      />
    );
    expect(screen.getByText("Elara")).toBeInTheDocument();
  });

  it("renders race, gender, age line", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        carriedItems={[]}
        equippedItems={[]}
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
        carriedItems={[]}
        equippedItems={[]}
        locationName={null}
      />
    );
    expect(screen.getByText("Silver hair, emerald eyes")).toBeInTheDocument();
  });

  it("displays HP as x/5", () => {
    render(
      <CharacterPanel
        player={makePlayer({ hp: 3 })}
        carriedItems={[]}
        equippedItems={[]}
        locationName={null}
      />
    );
    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("renders tags", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        carriedItems={[]}
        equippedItems={[]}
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
        carriedItems={[]}
        equippedItems={makeEquippedItems()}
        locationName={null}
      />
    );
    expect(screen.getByText(/Enchanted Staff/)).toBeInTheDocument();
  });

  it("renders authoritative equipped and carried collections from explicit props", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        carriedItems={makeCarriedItems()}
        equippedItems={[
          {
            id: "eq-2",
            name: "Moonlit Staff",
            tags: ["weapon", "signature"],
            equipState: "equipped",
            equippedSlot: "hand",
            isSignature: true,
          },
        ]}
        locationName={null}
      />
    );

    expect(screen.getByText(/Moonlit Staff/)).toBeInTheDocument();
    expect(screen.getByText(/Healing Potion/)).toBeInTheDocument();
    expect(screen.getByText("(consumable, rare)")).toBeInTheDocument();
  });

  it("renders inventory items with tags", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        carriedItems={makeCarriedItems()}
        equippedItems={[]}
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
        carriedItems={[]}
        equippedItems={[]}
        locationName={null}
      />
    );
    expect(screen.getByText("(empty)")).toBeInTheDocument();
  });

  it("keeps empty states working when authoritative carried and equipped collections are empty", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        carriedItems={[]}
        equippedItems={[]}
        locationName={null}
      />
    );

    expect(screen.getByText("(empty)")).toBeInTheDocument();
    expect(screen.getByText("(none equipped)")).toBeInTheDocument();
  });

  it("renders location name when provided", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        carriedItems={[]}
        equippedItems={[]}
        locationName="Enchanted Forest"
      />
    );
    expect(screen.getByText("Enchanted Forest")).toBeInTheDocument();
  });

  it("renders portrait when portraitUrl is provided", () => {
    render(
      <CharacterPanel
        player={makePlayer()}
        carriedItems={[]}
        equippedItems={[]}
        locationName={null}
        portraitUrl="/portraits/elara.png"
      />
    );
    const img = screen.getByAltText("Portrait of Elara");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/portraits/elara.png");
  });
});
