import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSafeGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockSafeGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import { buildScaffoldValidationPromptContract } from "../prompt-contracts.js";
import {
  validateAndFixStage,
  validateCrossStage,
} from "../scaffold-steps/validation.js";

const fakeJudgeRole = {
  provider: {
    id: "judge",
    name: "Judge Provider",
    baseUrl: "https://example.com",
    apiKey: "sk-test",
    model: "judge-model",
  },
  temperature: 0,
  maxTokens: 2048,
};

beforeEach(() => {
  mockSafeGenerateObject.mockReset();
});

function expectScaffoldValidationContract(prompt: string, dataMarker: string): void {
  expect(prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: scaffold-validation.v1");
  expect(prompt.indexOf("STRUCTURED_OUTPUT_CONTRACT: scaffold-validation.v1")).toBeLessThan(
    prompt.indexOf(dataMarker),
  );
  expect(prompt).toContain("Required fields");
  expect(prompt).toContain("issues");
  expect(prompt).toContain("entityName");
  expect(prompt).toContain("suggestedFix");
  expect(prompt).toContain("Caps:");
  expect(prompt).toContain("nullable");
  expect(prompt).toContain("Minimal valid output:");
  expect(prompt).toContain("Invalid example:");
  expect(prompt).toContain("fail closed");
}

describe("validation: scaffold prompt contract helper", () => {
  it("documents validation/fix shape, caps, nullability, examples, and fail-closed policy", () => {
    const contract = buildScaffoldValidationPromptContract();

    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: scaffold-validation.v1");
    expect(contract).toContain("Required fields");
    expect(contract).toContain("issues");
    expect(contract).toContain("entityName");
    expect(contract).toContain("suggestedFix");
    expect(contract).toContain("Caps:");
    expect(contract).toContain("nullable");
    expect(contract).toContain("Valid example:");
    expect(contract).toContain("Minimal valid output:");
    expect(contract).toContain("Invalid example:");
    expect(contract).toContain("fail closed");
    expect(contract).toContain("backend must not invent");
  });
});

describe("validation: LLM validation loop (D-03)", () => {
  it("validateAndFixStage wraps stage prompts in the scaffold validation contract", async () => {
    mockSafeGenerateObject.mockResolvedValueOnce({
      object: { issues: [], summary: "clean" },
    });

    await validateAndFixStage(
      [{ name: "Ironhaven" }],
      fakeJudgeRole as never,
      (entities) => `STAGE VALIDATION PROMPT\nENTITIES:\n${entities.map((entity) => entity.name).join(", ")}`,
      vi.fn(),
    );

    const prompt = (mockSafeGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expectScaffoldValidationContract(prompt, "STAGE VALIDATION PROMPT");
    expect((mockSafeGenerateObject.mock.calls[0]![0] as Record<string, unknown>).maxOutputTokens)
      .toBeUndefined();
  });

  it("validateCrossStage wraps cross-stage prompts in the scaffold validation contract", async () => {
    mockSafeGenerateObject.mockResolvedValueOnce({
      object: { issues: [], summary: "clean" },
    });

    await validateCrossStage(
      [
        {
          name: "Ironhaven",
          description: "A fortified city.",
          tags: ["city"],
          connectedTo: ["Mistharbor"],
        },
      ] as never,
      [
        {
          name: "The Crown",
          goals: ["Hold Ironhaven"],
          territoryNames: ["Ironhaven"],
          tags: ["royal"],
        },
      ] as never,
      [
        {
          name: "Lord Varn",
          tier: "major",
          locationName: "Ironhaven",
          factionName: "The Crown",
          persona: "A severe ruler.",
        },
      ] as never,
      fakeJudgeRole as never,
      "CONTEXT BLOCK",
      vi.fn(),
      vi.fn(),
    );

    const prompt = (mockSafeGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expectScaffoldValidationContract(prompt, "CONTEXT BLOCK");
    expect(prompt).toContain("LOCATIONS:");
    expect(prompt).toContain("FACTIONS:");
    expect(prompt).toContain("NPCs:");
  });

  it("validateAndFixStage fails closed for unmatched critical entities", async () => {
    mockSafeGenerateObject.mockResolvedValue({
      object: {
        issues: [
          {
            entityName: "Missing Entity",
            issueType: "broken_reference",
            description: "The model referenced an entity that is not present.",
            severity: "critical",
            suggestedFix: "Do not invent a replacement entity.",
          },
        ],
        summary: "missing entity",
      },
    });
    const regenerateEntity = vi.fn();
    const entities = [{ name: "Ironhaven" }];

    const result = await validateAndFixStage(
      entities,
      fakeJudgeRole as never,
      () => "STAGE VALIDATION PROMPT",
      regenerateEntity,
    );

    expect(regenerateEntity).not.toHaveBeenCalled();
    expect(result).toEqual(entities);
    expect(mockSafeGenerateObject).toHaveBeenCalledTimes(3);
  });

  it.todo("validateAndFixStage returns clean entities when no critical issues found");
  it.todo("validateAndFixStage re-generates flagged entities on critical issues");
  it.todo("validateAndFixStage stops after MAX_VALIDATION_ROUNDS (3) even with remaining issues");
  it.todo("validateAndFixStage only re-generates entities matching critical issue entityName");
  it.todo("validateCrossStage runs up to 3 validate-fix-revalidate rounds for semantic issues");
  it.todo("validateCrossStage normalizes NPC locationName to valid location names via code");
  it.todo("validateCrossStage normalizes faction territoryNames to valid location names via code");
  it.todo("validateCrossStage normalizes location connectedTo to valid location names via code");
  it.todo("validateCrossStage removes self-links from connectedTo");
  it.todo("validateCrossStage re-generates NPCs with semantic cross-stage issues via regen helpers");
});

describe("validation: Judge role (D-04)", () => {
  it.todo("validateAndFixStage uses Judge role provider for validation calls");
  it.todo("validateCrossStage uses Judge role provider");
  it.todo("re-generation uses Generator role, not Judge role");
});
