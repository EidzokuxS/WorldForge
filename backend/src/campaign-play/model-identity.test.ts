import { describe, expect, it } from "vitest";
import { campaignPlayResponseModelMatches } from "./model-identity.js";

describe("Campaign Play response model identity", () => {
  it.each([
    ["test-provider", "test-model", "test-model"],
    ["zai-coding-plan", "glm-5.3", "glm-5.3"],
    ["other-provider", "glm-5.2", "glm-5.2"],
  ])("accepts exact provider/model identity (%s/%s)", (providerId, requestedModel, responseModel) => {
    expect(campaignPlayResponseModelMatches({ providerId, requestedModel, responseModel })).toBe(true);
  });

  it("accepts only the Z.AI glm-5.2 to glm-5.3 compatibility tuple", () => {
    expect(campaignPlayResponseModelMatches({
      providerId: "zai-coding-plan",
      requestedModel: "glm-5.2",
      responseModel: "glm-5.3",
    })).toBe(true);
  });

  it.each([
    ["other-provider", "glm-5.2", "glm-5.3"],
    ["zai-coding-plan", "glm-5-turbo", "glm-5.3"],
    ["zai-coding-plan", "glm-5.3", "glm-5.2"],
    ["zai-coding-plan", "glm-5.2-preview", "glm-5.3"],
    ["zai-coding-plan", "glm-5.2", "glm-5.30"],
    ["zai-coding-plan", "glm-5.2", "glm-6.0"],
    ["zai-coding-plan", "glm-5.2", null],
    ["zai-coding-plan", "glm-5.2", undefined],
  ])("rejects non-allowlisted mismatch (%s/%s/%s)", (providerId, requestedModel, responseModel) => {
    expect(campaignPlayResponseModelMatches({ providerId, requestedModel, responseModel })).toBe(false);
  });
});
