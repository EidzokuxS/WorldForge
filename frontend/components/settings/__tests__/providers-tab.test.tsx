import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProvidersTab } from "../providers-tab";
import type { Settings } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  testConnection: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function createMockSettings(
  overrides: Partial<Settings> = {}
): Settings {
  const { ui: overrideUi, ...rest } = overrides;

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
        id: "custom-1",
        name: "My Provider",
        baseUrl: "https://custom.api.com/v1",
        apiKey: "custom-key",
        defaultModel: "my-model",
        isBuiltin: false,
      },
    ],
    judge: { providerId: "builtin-openai", temperature: 0.3, maxTokens: 2000 },
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
      providerId: "builtin-openai",
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
    ui: overrideUi ?? { showRawReasoning: false },
    ...rest,
  };
}

describe("ProvidersTab", () => {
  it("renders all provider cards", () => {
    const settings = createMockSettings();
    render(<ProvidersTab settings={settings} setSettings={vi.fn()} />);

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("My Provider")).toBeInTheDocument();
  });

  it("shows Built-in badge for builtin providers", () => {
    const settings = createMockSettings();
    render(<ProvidersTab settings={settings} setSettings={vi.fn()} />);

    expect(screen.getByText("Built-in")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("renders base URLs", () => {
    const settings = createMockSettings();
    render(<ProvidersTab settings={settings} setSettings={vi.fn()} />);

    expect(
      screen.getByText("https://api.openai.com/v1")
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://custom.api.com/v1")
    ).toBeInTheDocument();
  });

  it("renders Add Provider button", () => {
    const settings = createMockSettings();
    render(<ProvidersTab settings={settings} setSettings={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /Add Provider/i })
    ).toBeInTheDocument();
  });

  it("renders Test Connection and Edit buttons for each provider", () => {
    const settings = createMockSettings();
    render(<ProvidersTab settings={settings} setSettings={vi.fn()} />);

    const testButtons = screen.getAllByRole("button", {
      name: /Test Connection/i,
    });
    const editButtons = screen.getAllByRole("button", { name: /^Edit$/i });

    expect(testButtons).toHaveLength(2);
    expect(editButtons).toHaveLength(2);
  });

  it("shows Delete button only for non-builtin providers", () => {
    const settings = createMockSettings();
    render(<ProvidersTab settings={settings} setSettings={vi.fn()} />);

    // Only the custom provider should have a Delete button
    const deleteButtons = screen.getAllByRole("button", { name: /^Delete$/i });
    expect(deleteButtons).toHaveLength(1);
  });

  it("renders API key toggle button", async () => {
    const settings = createMockSettings();
    render(<ProvidersTab settings={settings} setSettings={vi.fn()} />);

    const toggleButtons = screen.getAllByRole("button", {
      name: /Toggle API key visibility/i,
    });
    expect(toggleButtons).toHaveLength(2);
  });
});
