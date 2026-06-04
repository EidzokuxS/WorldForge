import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import { resolveStartingLocation } from "../starting-location.js";
import { buildStartingLocationPromptContract } from "../prompt-contracts.js";

const fakeRole = {
  provider: {
    id: "test",
    name: "Test Provider",
    baseUrl: "https://example.com",
    apiKey: "sk-test",
    model: "gpt-4",
  },
  temperature: 0.7,
  maxTokens: 2048,
};

describe("resolveStartingLocation", () => {
  beforeEach(() => {
    mockGenerateObject.mockClear();
  });

  it("has a starting-location prompt contract with no-invented-location rules", () => {
    const contract = buildStartingLocationPromptContract();

    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: starting-location.v1");
    expect(contract).toContain("Required fields");
    expect(contract).toContain("locationName");
    expect(contract).toContain("entryPressure");
    expect(contract).toContain("Caps:");
    expect(contract).toContain("nullable");
    expect(contract).toContain("Valid example:");
    expect(contract).toContain("Minimal valid output:");
    expect(contract).toContain("Invalid example:");
    expect(contract).toContain("no invented location");
    expect(contract).toContain("Source authority");
  });

  it("returns structured startConditions plus compatibility aliases", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        locationName: "Ironhaven",
        arrivalMode: "on-foot",
        immediateSituation: "The character arrives at the city gates.",
        entryPressure: ["cold"],
        companions: ["a tired mule"],
        startingVisibility: "noticed",
        resolvedNarrative: "The character arrives at the city gates.",
      },
    });

    const result = await resolveStartingLocation({
      premise: "Dark fantasy.",
      locations: [
        { id: "loc-1", name: "Ironhaven" },
        { id: "loc-2", name: "Mistharbor" },
      ],
      userPrompt: "I want to start in a city.",
      role: fakeRole,
    });

    expect(result.locationId).toBe("loc-1");
    expect(result.locationName).toBe("Ironhaven");
    expect(result.startConditions.arrivalMode).toBe("on-foot");
    expect(result.startConditions.immediateSituation).toContain("city gates");
    expect(result.startConditions.companions).toEqual(["a tired mule"]);
    expect(result.narrative).toContain("city gates");
  });

  it("passes scoped candidate metadata and preserves exact sublocation selections", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        locationName: "Station Concourse",
        arrivalMode: "escorted",
        immediateSituation: "The character arrives in the concourse checkpoint.",
        entryPressure: ["crowd pressure"],
        companions: [],
        startingVisibility: "noticed",
        resolvedNarrative: "The character arrives in the concourse checkpoint.",
      },
    });

    const result = await resolveStartingLocation({
      premise: "Dense transit ward.",
      locations: [
        {
          id: "loc-macro",
          name: "Dense Transit Ward",
          kind: "macro",
          parentLocationId: null,
        },
        {
          id: "loc-concourse",
          name: "Station Concourse",
          kind: "persistent_sublocation",
          parentLocationId: "loc-macro",
          isStarting: true,
        },
      ],
      userPrompt: "Start in the busy concourse.",
      role: fakeRole,
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("Station Concourse");
    expect(prompt).toContain("kind=persistent_sublocation");
    expect(prompt).toContain("parentLocationId=loc-macro");
    expect(result.locationId).toBe("loc-concourse");
    expect(result.locationName).toBe("Station Concourse");
    expect(result.startConditions.startLocationId).toBe("loc-concourse");
  });

  it("asks for the full structured start-state contract instead of location-plus-flavor wording", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        locationName: "Ironhaven",
        arrivalMode: "on-foot",
        immediateSituation: "test",
        entryPressure: [],
        companions: [],
        startingVisibility: "noticed",
        resolvedNarrative: "test",
      },
    });

    await resolveStartingLocation({
      premise: "Fantasy.",
      locations: [
        { id: "loc-1", name: "Ironhaven" },
        { id: "loc-2", name: "Mistharbor" },
      ],
      userPrompt: "Near the coast",
      role: fakeRole,
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: starting-location.v1");
    expect(prompt.indexOf("STRUCTURED_OUTPUT_CONTRACT: starting-location.v1")).toBeLessThan(
      prompt.indexOf("WORLD PREMISE:"),
    );
    expect(prompt).toContain("no invented location");
    expect(prompt).toContain("Caps:");
    expect(prompt).toContain("Minimal valid output:");
    expect(prompt).toContain("Invalid example:");
    expect(prompt).toContain("startConditions");
    expect(prompt).toContain("arrivalMode");
    expect(prompt).toContain("immediateSituation");
    expect(prompt).toContain("entryPressure");
    expect(prompt).toContain("companions");
    expect(prompt).toContain("startingVisibility");
    expect(prompt).toContain("resolvedNarrative");
    expect(prompt).not.toContain("Choose the best starting location from the known list and describe the concrete opening situation.");
  });
});
