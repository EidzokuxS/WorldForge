import { describe, expect, it } from "vitest";

import {
  formatSessionLanguageContract,
  inferSessionResponseLanguage,
} from "../session-language.js";

describe("session response language", () => {
  it("prefers the current player action language over unrelated recent chat", () => {
    const language = inferSessionResponseLanguage({
      playerAction: "I ask the cafe clerk how much the coffee costs.",
      recentConversation: [
        {
          role: "assistant",
          content: "\u041a\u043b\u0435\u0440\u043a \u043f\u0440\u043e\u0442\u0438\u0440\u0430\u0435\u0442 \u0441\u0442\u043e\u0439\u043a\u0443.",
        },
      ],
    });

    expect(language).toMatchObject({
      languageName: "English",
      source: "inferred",
      reason: "current player action language",
    });
  });

  it("can infer Russian from the current player action", () => {
    const language = inferSessionResponseLanguage({
      playerAction:
        "\u042f \u0441\u043f\u0440\u0430\u0448\u0438\u0432\u0430\u044e \u0443 \u043a\u043b\u0435\u0440\u043a\u0430 \u0446\u0435\u043d\u0443 \u043a\u043e\u0444\u0435.",
    });

    expect(language.languageName).toBe("Russian");
    expect(language.source).toBe("inferred");
  });

  it("honors explicit language instructions after the player action", () => {
    const language = inferSessionResponseLanguage({
      playerAction: "I enter the shrine.",
      campaignPremise: "Language: Russian. A cold shrine in the mountains.",
    });

    expect(language).toMatchObject({
      languageName: "Russian",
      source: "explicit",
    });
  });

  it("formats the contract without changing source proper nouns", () => {
    const contract = formatSessionLanguageContract({
      languageName: "English",
      source: "default",
      reason: "no strong session language signal",
    });

    expect(contract).toContain("Output language: English.");
    expect(contract).toContain("proper nouns");
    expect(contract).toContain("Do not switch language because of operator locale");
  });
});
