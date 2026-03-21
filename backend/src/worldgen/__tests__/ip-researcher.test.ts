import { describe, it, expect, vi, beforeEach } from "vitest";

// We must mock the AI modules BEFORE importing the module under test
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

vi.mock("@ai-sdk/mcp", () => ({
    createMCPClient: vi.fn(),
}));

vi.mock("@ai-sdk/mcp/mcp-stdio", () => ({
    Experimental_StdioMCPTransport: vi.fn(),
}));

vi.mock("../../ai/index.js", () => ({
    createModel: vi.fn(() => "mock-model"),
}));

import { researchKnownIP } from "../ip-researcher.js";
import { createMCPClient } from "@ai-sdk/mcp";
import { generateText } from "ai";
import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import type { GenerateScaffoldRequest } from "../types.js";
import type { ResolvedRole } from "../../ai/resolve-role-model.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeReq(overrides: Partial<GenerateScaffoldRequest> = {}): GenerateScaffoldRequest {
    return {
        campaignId: "test-campaign",
        name: "My World",
        premise: "A generic original world with no known franchise references.",
        role: {
            provider: {
                id: "test",
                name: "Test Provider",
                baseUrl: "http://localhost:11434",
                apiKey: "test-key",
                model: "test-model",
            },
            temperature: 0.7,
            maxTokens: 2048,
        } as ResolvedRole,
        ...overrides,
    };
}

const MOCK_IP_CONTEXT = {
    franchise: "Warhammer",
    keyFacts: ["Humanity wages endless war", "The Emperor sits on a golden throne", "Space Marines are genetically enhanced warriors"],
    tonalNotes: ["Grimdark", "Military sci-fi"],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("researchKnownIP", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("no-op path", () => {
        it("returns null when LLM detects no franchise and knownIP is not set", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValue({ object: { isKnownIP: false, franchise: null } } as never);
            const result = await researchKnownIP(makeReq(), makeReq().role);
            expect(result).toBeNull();
        });

        it("returns null when knownIP is explicitly an empty string", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValue({ object: { isKnownIP: false, franchise: null } } as never);
            const result = await researchKnownIP(makeReq({ knownIP: "" }), makeReq().role);
            expect(result).toBeNull();
        });

        it("returns null when knownIP is whitespace only", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValue({ object: { isKnownIP: false, franchise: null } } as never);
            const result = await researchKnownIP(makeReq({ knownIP: "   " }), makeReq().role);
            expect(result).toBeNull();
        });
    });

    describe("franchise detection from premise", () => {
        it("detects Warhammer from premise text via LLM", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValueOnce({ object: { isKnownIP: true, franchise: "Warhammer" } } as never);
            vi.mocked(createMCPClient).mockRejectedValue(new Error("MCP unavailable"));
            vi.mocked(safeGenerateObject).mockResolvedValue({ object: MOCK_IP_CONTEXT } as never);

            const result = await researchKnownIP(
                makeReq({ premise: "A world inspired by Warhammer 40,000" }),
                makeReq().role
            );

            expect(result).not.toBeNull();
            expect(result?.franchise).toBe("Warhammer");
            expect(result?.source).toBe("llm");
        });

        it("detects D&D from name field via LLM", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValueOnce({ object: { isKnownIP: true, franchise: "Dungeons & Dragons" } } as never);
            vi.mocked(createMCPClient).mockRejectedValue(new Error("MCP unavailable"));
            vi.mocked(safeGenerateObject).mockResolvedValue({
                object: { franchise: "Dungeons & Dragons", keyFacts: ["d20 system"], tonalNotes: ["High fantasy"] },
            } as never);

            const result = await researchKnownIP(
                makeReq({ name: "D&D Campaign World", premise: "A standard adventure" }),
                makeReq().role
            );

            expect(result).not.toBeNull();
            expect(result?.source).toBe("llm");
        });
    });

    describe("explicit knownIP field takes priority", () => {
        it("uses knownIP value directly without LLM franchise detection", async () => {
            vi.mocked(createMCPClient).mockRejectedValue(new Error("MCP unavailable"));
            vi.mocked(safeGenerateObject).mockResolvedValue({
                object: { franchise: "Custom Franchise", keyFacts: ["fact1"], tonalNotes: ["tone1"] },
            } as never);

            const result = await researchKnownIP(
                makeReq({ knownIP: "Custom Franchise", premise: "totally original premise" }),
                makeReq().role
            );

            expect(result).not.toBeNull();
            expect(result?.source).toBe("llm");
        });
    });

    describe("MCP failure -> LLM fallback", () => {
        it("falls back to LLM when createMCPClient rejects", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValueOnce({ object: { isKnownIP: true, franchise: "Warhammer" } } as never);
            vi.mocked(createMCPClient).mockRejectedValue(new Error("spawn failed"));
            vi.mocked(safeGenerateObject).mockResolvedValue({ object: MOCK_IP_CONTEXT } as never);

            const result = await researchKnownIP(
                makeReq({ premise: "Inspired by Warhammer" }),
                makeReq().role
            );

            expect(result).not.toBeNull();
            expect(result?.source).toBe("llm");
        });

        it("returns null when both MCP and LLM fallback fail", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValueOnce({ object: { isKnownIP: true, franchise: "Warhammer" } } as never);
            vi.mocked(createMCPClient).mockRejectedValue(new Error("MCP error"));
            vi.mocked(safeGenerateObject).mockRejectedValue(new Error("LLM error"));

            const result = await researchKnownIP(
                makeReq({ premise: "Inspired by Warhammer" }),
                makeReq().role
            );

            expect(result).toBeNull();
        });

        it("fallback result has source='llm'", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValueOnce({ object: { isKnownIP: true, franchise: "Warhammer" } } as never);
            vi.mocked(createMCPClient).mockRejectedValue(new Error("MCP error"));
            vi.mocked(safeGenerateObject).mockResolvedValue({ object: MOCK_IP_CONTEXT } as never);

            const result = await researchKnownIP(
                makeReq({ premise: "Inspired by Warhammer" }),
                makeReq().role
            );

            expect(result?.source).toBe("llm");
        });
    });

    describe("MCP happy path", () => {
        it("returns source='mcp' when MCP succeeds", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValueOnce({ object: { isKnownIP: true, franchise: "Warhammer" } } as never);
            const mockMcpClient = {
                tools: vi.fn().mockResolvedValue({ duckduckgo_search: {} }),
                close: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(createMCPClient).mockResolvedValue(mockMcpClient as never);
            vi.mocked(generateText).mockResolvedValue({ text: "Research notes about Warhammer..." } as never);
            vi.mocked(safeGenerateObject).mockResolvedValue({ object: MOCK_IP_CONTEXT } as never);

            const result = await researchKnownIP(
                makeReq({ premise: "Inspired by Warhammer" }),
                makeReq().role
            );

            expect(result?.source).toBe("mcp");
            expect(mockMcpClient.close).toHaveBeenCalledTimes(1);
        });

        it("always calls mcpClient.close() even if generateText throws", async () => {
            vi.mocked(safeGenerateObject).mockResolvedValueOnce({ object: { isKnownIP: true, franchise: "Warhammer" } } as never);
            const mockMcpClient = {
                tools: vi.fn().mockResolvedValue({}),
                close: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(createMCPClient).mockResolvedValue(mockMcpClient as never);
            vi.mocked(generateText).mockRejectedValue(new Error("LLM error during MCP path"));
            vi.mocked(safeGenerateObject).mockResolvedValue({ object: MOCK_IP_CONTEXT } as never);

            // Should fall to LLM fallback
            const result = await researchKnownIP(
                makeReq({ premise: "Inspired by Warhammer" }),
                makeReq().role
            );

            expect(mockMcpClient.close).toHaveBeenCalledTimes(1);
            expect(result?.source).toBe("llm");
        });
    });
});
