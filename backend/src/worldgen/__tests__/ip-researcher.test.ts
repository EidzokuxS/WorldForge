import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return {
        ...actual,
        generateText: vi.fn(),
        generateObject: vi.fn(),
        stepCountIs: vi.fn((n: number) => `stepCountIs(${n})`),
    };
});

vi.mock("../../ai/generate-object-safe.js", () => ({
    safeGenerateObject: vi.fn(),
}));

vi.mock("../../ai/index.js", () => ({
    createModel: vi.fn(() => "mock-model"),
}));

vi.mock("../../lib/web-search.js", () => ({
    webSearch: vi.fn(),
}));

import { researchKnownIP, evaluateResearchSufficiency } from "../ip-researcher.js";
import { buildWorldgenResearchPlan } from "../retrieval-intent.js";
import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { webSearch } from "../../lib/web-search.js";
import type { ResolvedRole } from "../../ai/resolve-role-model.js";
import type { Mock } from "vitest";

const mockedWebSearch = webSearch as Mock;

function makeReq(overrides: Record<string, unknown> = {}) {
    return {
        name: "My World",
        premise: "A generic original world with no known franchise references.",
        ...overrides,
    };
}

const fakeRole = {
    provider: {
        id: "test",
        name: "Test Provider",
        baseUrl: "http://localhost:11434",
        apiKey: "test-key",
        model: "test-model",
    },
    temperature: 0.7,
    maxTokens: 2048,
} as ResolvedRole;

const MOCK_IP_CONTEXT = {
    franchise: "Warhammer",
    keyFacts: ["Humanity wages endless war", "The Emperor sits on a golden throne", "Space Marines are genetically enhanced warriors"],
    tonalNotes: ["Grimdark", "Military sci-fi"],
};

const MOCK_RESEARCH_CONFIG = {
    provider: "duckduckgo" as const,
    llmProvider: fakeRole.provider,
};

describe("researchKnownIP", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("no-op path", () => {
        it("returns null when LLM detects no franchise and knownIP is not set", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValue({ object: { confidence: "unknown", franchise: null, searchQuery: null } } as never);
            const result = await researchKnownIP(makeReq(), fakeRole);
            expect(result).toBeNull();
        });

        it("returns null when knownIP is explicitly an empty string", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValue({ object: { confidence: "unknown", franchise: null, searchQuery: null } } as never);
            const result = await researchKnownIP(makeReq({ knownIP: "" }), fakeRole);
            expect(result).toBeNull();
        });

        it("returns null when knownIP is whitespace only", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValue({ object: { confidence: "unknown", franchise: null, searchQuery: null } } as never);
            const result = await researchKnownIP(makeReq({ knownIP: "   " }), fakeRole);
            expect(result).toBeNull();
        });
    });

    describe("franchise detection from premise", () => {
        it("detects Warhammer from premise text via LLM", async () => {
            // First call: franchise detection → certain
            vi.mocked(safeGenerateObject).mockResolvedValueOnce({ object: { confidence: "certain", franchise: "Warhammer", searchQuery: null } } as never);
            // DDG searches for research
            mockedWebSearch.mockResolvedValue([{ title: "Warhammer lore", description: "Grimdark universe", url: "https://example.com" }]);
            // Second call: parse research into structured context
            vi.mocked(safeGenerateObject).mockResolvedValue({ object: MOCK_IP_CONTEXT } as never);

            const result = await researchKnownIP(
                makeReq({ premise: "A world inspired by Warhammer 40,000" }),
                fakeRole
            );

            expect(result).not.toBeNull();
            expect(result?.franchise).toBe("Warhammer");
        });

        it("detects D&D from name field via LLM", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValueOnce({ object: { confidence: "certain", franchise: "Dungeons & Dragons", searchQuery: null } } as never);
            mockedWebSearch.mockResolvedValue([{ title: "D&D", description: "Fantasy RPG", url: "https://example.com" }]);
            vi.mocked(safeGenerateObject).mockResolvedValue({
                object: { franchise: "Dungeons & Dragons", keyFacts: ["d20 system"], tonalNotes: ["High fantasy"] },
            } as never);

            const result = await researchKnownIP(
                makeReq({ name: "D&D Campaign World", premise: "A standard adventure" }),
                fakeRole
            );

            expect(result).not.toBeNull();
            expect(result?.franchise).toBe("Dungeons & Dragons");
        });
    });

    describe("explicit knownIP field takes priority", () => {
        it("uses knownIP value directly without LLM franchise detection", async () => {
            mockedWebSearch.mockResolvedValue([{ title: "Custom", description: "Custom franchise", url: "https://example.com" }]);
            vi.mocked(safeGenerateObject).mockResolvedValue({
                object: { franchise: "Custom Franchise", keyFacts: ["fact1"], tonalNotes: ["tone1"] },
            } as never);

            const result = await researchKnownIP(
                makeReq({ knownIP: "Custom Franchise", premise: "totally original premise" }),
                fakeRole
            );

            expect(result).not.toBeNull();
            expect(result?.franchise).toBe("Custom Franchise");
            // safeGenerateObject should NOT be called for franchise detection (only for research parsing)
            // The first call should be research parsing, not detection
        });
    });

    describe("DDG search failure → LLM fallback", () => {
        it("falls back to LLM when DDG search fails", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValueOnce({ object: { confidence: "certain", franchise: "Naruto", searchQuery: null } } as never);
            mockedWebSearch.mockRejectedValue(new Error("DDG anomaly"));
            // LLM fallback research
            vi.mocked(safeGenerateObject).mockResolvedValue({
                object: { franchise: "Naruto", keyFacts: ["Ninja world"], tonalNotes: ["Shonen action"] },
            } as never);

            const result = await researchKnownIP(
                makeReq({ premise: "A world of ninjas and chakra" }),
                fakeRole
            );

            expect(result).not.toBeNull();
            expect(result?.franchise).toBe("Naruto");
            expect(result?.source).toBe("llm");
        });

        it("returns null when both DDG and LLM fallback fail", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValueOnce({ object: { confidence: "certain", franchise: "Unknown", searchQuery: null } } as never);
            mockedWebSearch.mockRejectedValue(new Error("DDG anomaly"));
            vi.mocked(safeGenerateObject).mockRejectedValue(new Error("LLM failed"));

            const result = await researchKnownIP(
                makeReq({ premise: "Obscure franchise" }),
                fakeRole
            );

            expect(result).toBeNull();
        });
    });

    describe("DDG search happy path", () => {
        it("returns research with DDG results", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValueOnce({ object: { confidence: "certain", franchise: "Star Wars", searchQuery: null } } as never);
            mockedWebSearch.mockResolvedValue([
                { title: "Star Wars lore", description: "A galaxy far far away", url: "https://starwars.com" },
            ]);
            vi.mocked(safeGenerateObject).mockResolvedValue({
                object: { franchise: "Star Wars", keyFacts: ["The Force", "Jedi vs Sith"], tonalNotes: ["Space opera"] },
            } as never);

            const result = await researchKnownIP(
                makeReq({ premise: "In a galaxy far far away" }),
                fakeRole
            );

            expect(result).not.toBeNull();
            expect(result?.franchise).toBe("Star Wars");
            expect(result?.keyFacts).toContain("The Force");
            expect(mockedWebSearch).toHaveBeenCalled();
        });

        it("splits mixed-premise worldgen asks into typed retrieval jobs instead of a blended canon query", () => {
            const plan = buildWorldgenResearchPlan({
                franchise: "Naruto",
                premise: "A campaign about hidden villages, Akatsuki politics, chakra limits, and the aftermath of the Fourth Shinobi War.",
            });

            expect(plan.jobs.length).toBeGreaterThanOrEqual(4);
            expect(plan.jobs.every((job) => job.intent === "world_canon_fact")).toBe(true);
            expect(plan.jobs.map((job) => job.topic)).toEqual(
                expect.arrayContaining(["locations", "factions", "rules", "event_history"]),
            );
            expect(plan.jobs.map((job) => job.query)).not.toContain("Naruto world lore overview wiki");
            expect(plan.jobs).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        topic: "locations",
                        purpose: expect.stringMatching(/location|geography/i),
                    }),
                    expect.objectContaining({
                        topic: "factions",
                        purpose: expect.stringMatching(/faction|organization/i),
                    }),
                    expect.objectContaining({
                        topic: "rules",
                        purpose: expect.stringMatching(/power|rule|ability/i),
                    }),
                    expect.objectContaining({
                        topic: "event_history",
                        purpose: expect.stringMatching(/event|history|timeline/i),
                    }),
                ]),
            );
        });

        it("maps only missing scaffold topics into typed sufficiency follow-up jobs", async () => {
            const ipContext = {
                franchise: "Naruto",
                keyFacts: ["Konohagakure is a hidden village.", "Chakra powers ninja techniques."],
                tonalNotes: ["Shonen action"],
                source: "mcp" as const,
            };

            vi.mocked(safeGenerateObject)
                .mockResolvedValueOnce({
                    object: {
                        sufficient: false,
                        missingTopics: ["Land of Fire geography", "major hidden villages"],
                    },
                } as never)
                .mockResolvedValueOnce({
                    object: {
                        facts: ["The Land of Fire contains Konohagakure and key frontier routes."],
                    },
                } as never)
                .mockResolvedValueOnce({
                    object: {
                        facts: ["Sunagakure and Kirigakure are major hidden villages in neighboring nations."],
                    },
                } as never);
            mockedWebSearch
                .mockResolvedValueOnce([{ title: "Land of Fire", description: "Geography and borders", url: "https://example.com/fire" }])
                .mockResolvedValueOnce([{ title: "Hidden villages", description: "Village network", url: "https://example.com/villages" }]);

            const result = await evaluateResearchSufficiency(
                ipContext,
                "locations",
                "A shinobi world recovering from war.",
                fakeRole,
                MOCK_RESEARCH_CONFIG,
            );

            expect(mockedWebSearch).toHaveBeenCalledTimes(2);
            expect(mockedWebSearch.mock.calls.map(([query]) => query)).toEqual([
                expect.stringMatching(/^Naruto .*Land of Fire geography/i),
                expect.stringMatching(/^Naruto .*major hidden villages/i),
            ]);
            expect(mockedWebSearch.mock.calls.every(([query]) => !String(query).includes("world lore overview"))).toBe(true);
            expect(result.keyFacts).toEqual(
                expect.arrayContaining([
                    "The Land of Fire contains Konohagakure and key frontier routes.",
                    "Sunagakure and Kirigakure are major hidden villages in neighboring nations.",
                ]),
            );
        });

        it("keeps attempted retrieval jobs explicit when focused search falls back to LLM research", async () => {
            vi.mocked(safeGenerateObject)
                .mockResolvedValueOnce({
                    object: { confidence: "certain", franchise: "Naruto", searchQuery: null },
                } as never)
                .mockResolvedValueOnce({
                    object: {
                        franchise: "Naruto",
                        keyFacts: ["Konohagakure is a hidden village."],
                        tonalNotes: ["Shonen action"],
                        canonicalNames: {
                            locations: ["Konohagakure"],
                            factions: ["Akatsuki"],
                            characters: ["Naruto Uzumaki"],
                        },
                    },
                } as never);
            mockedWebSearch.mockRejectedValue(new Error("search down"));

            const result = await researchKnownIP(
                makeReq({
                    premise: "A campaign about hidden villages, Akatsuki politics, chakra limits, and the Fourth Shinobi War.",
                }),
                fakeRole,
            );

            expect(result?.source).toBe("llm");
            const fallbackPrompt = vi.mocked(safeGenerateObject).mock.calls.at(-1)?.[0]?.prompt;
            expect(fallbackPrompt).toContain("Focused retrieval jobs");
            expect(fallbackPrompt).toContain("Naruto canonical locations");
            expect(fallbackPrompt).toContain("Naruto canonical factions");
            expect(fallbackPrompt).toContain("Naruto canonical power system");
            expect(fallbackPrompt).not.toContain("Naruto world lore overview wiki");
        });
    });
});
