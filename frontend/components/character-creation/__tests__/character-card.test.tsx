import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterCard } from "../character-card";
import type { ParsedCharacter } from "@/lib/api";

const MOCK_CHARACTER: ParsedCharacter = {
  name: "Elara Nightwhisper",
  race: "Half-Elf",
  gender: "Female",
  age: "Young adult",
  appearance: "Tall with silver hair and violet eyes",
  tags: ["stealth", "archery", "cunning"],
  hp: 3,
  equippedItems: ["Short bow", "Leather armor"],
  locationName: "Rivendell",
};

const MOCK_LOCATIONS = ["Rivendell", "Moria", "Bree"];

describe("CharacterCard", () => {
  it("renders all character fields", () => {
    render(
      <CharacterCard
        character={MOCK_CHARACTER}
        locationNames={MOCK_LOCATIONS}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue("Elara Nightwhisper")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Half-Elf")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Female")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Young adult")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Tall with silver hair and violet eyes")
    ).toBeInTheDocument();
  });

  it("renders HP display with correct count", () => {
    render(
      <CharacterCard
        character={MOCK_CHARACTER}
        locationNames={MOCK_LOCATIONS}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("renders tags", () => {
    render(
      <CharacterCard
        character={MOCK_CHARACTER}
        locationNames={MOCK_LOCATIONS}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText("stealth")).toBeInTheDocument();
    expect(screen.getByText("archery")).toBeInTheDocument();
    expect(screen.getByText("cunning")).toBeInTheDocument();
  });

  it("renders equipped items", () => {
    render(
      <CharacterCard
        character={MOCK_CHARACTER}
        locationNames={MOCK_LOCATIONS}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText("Short bow")).toBeInTheDocument();
    expect(screen.getByText("Leather armor")).toBeInTheDocument();
  });

  it("calls onChange with updated character when name is edited", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <CharacterCard
        character={MOCK_CHARACTER}
        locationNames={MOCK_LOCATIONS}
        onChange={onChange}
      />
    );

    const nameInput = screen.getByDisplayValue("Elara Nightwhisper");
    await user.type(nameInput, "X");

    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0][0];
    // The component spreads character and overrides name with new value
    expect(call.name).toBe("Elara NightwhisperX");
    // Other fields should remain unchanged
    expect(call.race).toBe("Half-Elf");
    expect(call.hp).toBe(3);
  });

  it("renders all label text", () => {
    render(
      <CharacterCard
        character={MOCK_CHARACTER}
        locationNames={MOCK_LOCATIONS}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Race")).toBeInTheDocument();
    expect(screen.getByText("Gender")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("HP")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("Equipped Items")).toBeInTheDocument();
  });
});
