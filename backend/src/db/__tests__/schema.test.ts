import { describe, it, expect } from "vitest";
import {
  campaigns,
  players,
  npcs,
  locations,
  items,
  factions,
  relationships,
  chronicle,
} from "../schema.js";

describe("schema exports", () => {
  it("exports campaigns table", () => {
    expect(campaigns).toBeDefined();
  });

  it("exports players table", () => {
    expect(players).toBeDefined();
  });

  it("exports npcs table", () => {
    expect(npcs).toBeDefined();
  });

  it("exports locations table", () => {
    expect(locations).toBeDefined();
  });

  it("exports items table", () => {
    expect(items).toBeDefined();
  });

  it("exports factions table", () => {
    expect(factions).toBeDefined();
  });

  it("exports relationships table", () => {
    expect(relationships).toBeDefined();
  });

  it("exports chronicle table", () => {
    expect(chronicle).toBeDefined();
  });
});
