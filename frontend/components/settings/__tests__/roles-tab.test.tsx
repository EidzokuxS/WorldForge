import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RolesTab } from "../roles-tab";
import type { Settings } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  testRole: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function createMockSettings(): Settings {
  return {
    providers: [
      {
        id: "builtin-openai",
        name: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test-123",
        defaultModel: "gpt-4o-mini",
        isBuiltin: true,
      },
      {
        id: "builtin-openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-or-test",
        defaultModel: "auto",
        isBuiltin: true,
      },
    ],
    judge: {
      providerId: "builtin-openai",
      temperature: 0.3,
      maxTokens: 2000,
    },
    storyteller: {
      providerId: "builtin-openai",
      temperature: 0.8,
      maxTokens: 4000,
    },
    generator: {
      providerId: "builtin-openai",
      temperature: 0.7,
      maxTokens: 4000,
    },
    embedder: {
      providerId: "builtin-openrouter",
      temperature: 0,
      maxTokens: 0,
    },
    images: {
      providerId: "",
      model: "",
      stylePrompt: "",
      enabled: false,
    },
    research: {
      enabled: true,
      maxSearchSteps: 3,
      searchProvider: "duckduckgo",
    },
    ui: { showRawReasoning: false },
  };
}

describe("RolesTab", () => {
  it("renders all four role cards", () => {
    render(<RolesTab settings={createMockSettings()} setSettings={vi.fn()} />);

    expect(screen.getByText("Judge")).toBeInTheDocument();
    expect(screen.getByText("Storyteller")).toBeInTheDocument();
    expect(screen.getByText("Generator")).toBeInTheDocument();
    expect(screen.getByText("Embedder")).toBeInTheDocument();
  });

  it("renders role descriptions", () => {
    render(<RolesTab settings={createMockSettings()} setSettings={vi.fn()} />);

    expect(
      screen.getByText(/Fast, structured model for rulings/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Creative model for narrative text/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Model for world generation/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Embedding model for semantic search/i)
    ).toBeInTheDocument();
  });

  it("does not render any fallback controls", () => {
    render(<RolesTab settings={createMockSettings()} setSettings={vi.fn()} />);

    expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
    expect(screen.queryByText("Global timeout (ms)")).not.toBeInTheDocument();
    expect(screen.queryByText("Retry count")).not.toBeInTheDocument();
  });
});
